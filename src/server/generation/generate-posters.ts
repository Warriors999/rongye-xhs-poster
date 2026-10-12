import { defaultResearchSummary, createEmptyDraft, type BeautifyMode, type DesignBrief, type GenerationInput as DomainGenerationInput, type ImageAsset, type PosterDraft, type PosterStyle, type ResearchSummary } from '@/domain/project';
import { resolveDesignBrief, sanitizeDesignText } from '@/lib/design-system';
import { getImageProvider, getProvider, getReferenceResearcher, type GenerationInput, type Provider, type ProviderDependencies } from '@/server/ai/provider';
import { buildPosterPrompt, IMAGE_FORMAT_ERROR, IMAGE_PROVIDER_UNAVAILABLE_ERROR, isRetryableImageError, type ImageBeautifier } from '@/server/ai/image-provider';
import type { QualityChecker } from '@/server/ai/quality-provider';
import { consumeRetryBudget, createCombinedSignal, createRetryBudget, throwIfAborted, withDeadline, type AICallOptions } from '@/server/ai/call-options';
import type { GenerateResponse } from '@/server/ai/contracts';

export const DEFAULT_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUSINESS_RETRIES = 1;

const visualModes: Record<PosterStyle, BeautifyMode> = {
  cute: 'studio', daily: 'craft', series: 'original',
  lifestyle: 'studio', story: 'craft', editorial: 'original'
};

const directionLabels: Record<'lifestyle' | 'story' | 'editorial', string> = {
  lifestyle: '动态方案 A', story: '动态方案 B', editorial: '动态方案 C'
};

const SENSITIVE_RESPONSE_TEXT = /api[_ -]?key|secret|token|authorization|bearer|stack|上游|provider|内部服务/i;
const UNSAFE_COPY_TEXT = /价格|售价|人民币|¥|￥|\$|元|日期|时间|编号|序号|名称|商品名|品名|品牌|销量|规格|尺寸|新品|上新|限时|特价|折扣|伪文字|乱码|水印|logo|\d+/i;
const SENSITIVE_ENV_NAME = /(?:API[_-]?KEY|SECRET|PASSWORD|TOKEN)/i;
const INTERNAL_ENV_NAME = /^AI_(?:.*_)?(?:PROVIDER|MODEL|PROTOCOL)$/i;
const DEFAULT_INTERNAL_NAMES = [
  'OpenAICompatibleProvider',
  'GeminiProvider',
  'ImageProvider',
  'MockProvider',
  'QualityProvider',
  'ReferenceResearcher',
  'openai-compatible',
  'google',
  'mock'
] as const;
const MAX_OUTPUT_IMAGE_DATA_URL_LENGTH = 10_000_000;

export interface GeneratePostersInput extends DomainGenerationInput {}

export type GenerationPhase = 'researching' | 'designing' | 'generating' | 'checking';

export interface GeneratePostersDependencies {
  env?: Record<string, string | undefined>;
  getProvider?: (dependencies?: ProviderDependencies) => Provider;
  getReferenceResearcher?: (dependencies?: ProviderDependencies) => { research: (input: { keywords: string; creativeIdea?: string }, options?: AICallOptions) => Promise<ResearchSummary> };
  getImageProvider?: (dependencies?: ProviderDependencies) => ImageBeautifier;
  getQualityChecker?: (dependencies?: ProviderDependencies) => QualityChecker;
}

export interface GeneratePostersOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  dependencies?: GeneratePostersDependencies;
  onPhase?: (phase: GenerationPhase) => void | Promise<void>;
}

export class GenerationAbortedError extends Error {
  readonly reason: 'aborted' | 'timeout';

  constructor(reason: 'aborted' | 'timeout') {
    super(reason === 'timeout' ? '生成服务超时，请重试' : '生成请求已取消');
    this.name = 'AbortError';
    this.reason = reason;
  }
}

export class ImageGenerationError extends Error {
  constructor(message = IMAGE_PROVIDER_UNAVAILABLE_ERROR) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

function directionForStyle(style: PosterStyle): 'lifestyle' | 'story' | 'editorial' {
  if (style === 'story' || style === 'daily') return 'story';
  if (style === 'editorial' || style === 'series') return 'editorial';
  return 'lifestyle';
}

interface OutputSecurity {
  isForbidden(value: unknown): boolean;
  clean(value: unknown, fallback: string, maxLength: number, unsafe?: RegExp): string;
  cleanList(value: unknown, fallback: string[], maxItems: number, maxLength: number, unsafe?: RegExp): string[];
  cleanUrl(value: unknown, maxLength?: number): string | undefined;
}

function encodedVariants(value: string): string[] {
  try {
    return [...new Set([value, encodeURIComponent(value), encodeURI(value)])];
  } catch {
    return [value];
  }
}

function encodedSecretVariants(value: string): string[] {
  try {
    const standard = encodeURIComponent(value);
    return [...new Set([...encodedVariants(value), encodeURIComponent(standard)])];
  } catch {
    return encodedVariants(value);
  }
}

function createOutputSecurity(env: Record<string, string | undefined>): OutputSecurity {
  const rawSecrets = new Set<string>();
  const exactGuards = new Set<string>();
  const normalizedSecretGuards = new Set<string>();
  const internalGuards = new Set<string>(DEFAULT_INTERNAL_NAMES);
  for (const [name, rawValue] of Object.entries(env)) {
    const value = rawValue?.trim();
    if (!value) continue;
    if (SENSITIVE_ENV_NAME.test(name)) {
      rawSecrets.add(value);
      for (const variant of encodedSecretVariants(value)) {
        exactGuards.add(variant);
        normalizedSecretGuards.add(variant.toLocaleLowerCase());
      }
    }
    if (INTERNAL_ENV_NAME.test(name)) {
      for (const variant of encodedVariants(value)) internalGuards.add(variant);
    }
  }

  const internalGuardVariants = [...internalGuards].map((value) => value.toLocaleLowerCase());
  const containsDecodedSecret = (value: string): boolean => {
    let decoded = value;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        break;
      }
      if ([...rawSecrets].some((secret) => decoded.includes(secret))) return true;
    }
    return false;
  };
  const isForbidden = (value: unknown): boolean => {
    if (typeof value !== 'string' || !value) return false;
    const lowerValue = value.toLocaleLowerCase();
    if ([...exactGuards].some((guard) => value.includes(guard))
      || [...normalizedSecretGuards].some((guard) => lowerValue.includes(guard))
      || containsDecodedSecret(value)) return true;
    return internalGuardVariants.some((guard) => lowerValue.includes(guard));
  };

  const clean = (value: unknown, fallback: string, maxLength: number, unsafe = SENSITIVE_RESPONSE_TEXT): string => {
    const safeFallback = typeof fallback === 'string'
      ? fallback.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
    const usableFallback = !isForbidden(safeFallback) && !unsafe.test(safeFallback)
      ? Array.from(safeFallback).slice(0, maxLength).join('')
      : '';
    if (typeof value !== 'string') return usableFallback;
    const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || isForbidden(text) || unsafe.test(text)) return usableFallback;
    return Array.from(text).slice(0, maxLength).join('') || usableFallback;
  };

  const cleanList = (value: unknown, fallback: string[], maxItems: number, maxLength: number, unsafe = SENSITIVE_RESPONSE_TEXT): string[] => {
    const safe = Array.isArray(value)
      ? value.map((item) => clean(item, '', maxLength, unsafe)).filter(Boolean).slice(0, maxItems)
      : [];
    if (safe.length > 0) return safe;
    return fallback.map((item) => clean(item, '', maxLength, unsafe)).filter(Boolean).slice(0, maxItems);
  };

  const cleanUrl = (value: unknown, maxLength = 500): string | undefined => {
    const cleaned = clean(value, '', maxLength);
    if (!cleaned) return undefined;
    try {
      const url = new URL(cleaned);
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return undefined;
      if ([...url.searchParams.keys()].some((key) => /key|token|secret|auth|password|signature/i.test(key))) return undefined;
      return isForbidden(url.toString()) ? undefined : url.toString();
    } catch {
      return undefined;
    }
  };

  return { isForbidden, clean, cleanList, cleanUrl };
}

function safeResearch(research: ResearchSummary | undefined, security: OutputSecurity): ResearchSummary {
  const source = research ?? defaultResearchSummary;
  const sources = Array.isArray(source.sources) ? source.sources.map((item) => {
    const title = security.clean(item?.title, '设计参考', 200);
    const url = security.cleanUrl(item?.url);
    return url ? { title, url } : { title };
  }).slice(0, 3) : [];
  return {
    query: security.clean(source.query, defaultResearchSummary.query, 200),
    sources: sources.length > 0 ? sources : defaultResearchSummary.sources.map((item) => ({ ...item })),
    composition: security.clean(source.composition, defaultResearchSummary.composition, 200),
    palette: security.clean(source.palette, defaultResearchSummary.palette, 200),
    material: security.clean(source.material, defaultResearchSummary.material, 200),
    typography: security.clean(source.typography, defaultResearchSummary.typography, 200),
    density: security.clean(source.density, defaultResearchSummary.density, 200),
    fallback: source.fallback === true
  };
}

function safeCopyText(security: OutputSecurity, value: unknown, fallback: string, maxLength: number): string {
  return security.clean(value, fallback, maxLength, new RegExp(`${SENSITIVE_RESPONSE_TEXT.source}|${UNSAFE_COPY_TEXT.source}`, 'i'));
}

function safeDesignList(security: OutputSecurity, value: unknown, fallback: string[], maxItems: number, maxLength: number): string[] {
  return security.cleanList(value, fallback, maxItems, maxLength);
}

function safeDesignBrief(security: OutputSecurity, style: PosterStyle, candidate: unknown, research: ResearchSummary): DesignBrief {
  const fallback = resolveDesignBrief(style, {}, research);
  const design = resolveDesignBrief(style, candidate, research);
  return {
    ...design,
    label: security.clean(design.label, fallback.label ?? '动态创意方案', 80),
    concept: security.clean(design.concept, fallback.concept, 240),
    layout: security.clean(design.layout, fallback.layout, 280),
    scene: security.clean(design.scene, fallback.scene, 280),
    elements: safeDesignList(security, design.elements, fallback.elements, 6, 100),
    palette: safeDesignList(security, design.palette, fallback.palette, 5, 60),
    typography: security.clean(design.typography, fallback.typography, 240),
    hierarchy: security.clean(design.hierarchy, fallback.hierarchy, 240),
    mood: security.clean(design.mood, fallback.mood, 160),
    negative: safeDesignList(security, design.negative, fallback.negative, 10, 140)
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeImage(security: OutputSecurity, candidate: unknown, fallback: ImageAsset): ImageAsset {
  const source = recordValue(candidate);
  const dataUrl = typeof source.dataUrl === 'string'
    && source.dataUrl.startsWith('data:image/')
    && source.dataUrl.length <= MAX_OUTPUT_IMAGE_DATA_URL_LENGTH
    ? source.dataUrl
    : fallback.dataUrl;
  const width = typeof source.width === 'number' && Number.isFinite(source.width) && source.width > 0 ? Math.floor(source.width) : fallback.width;
  const height = typeof source.height === 'number' && Number.isFinite(source.height) && source.height > 0 ? Math.floor(source.height) : fallback.height;
  return {
    id: security.clean(source.id, fallback.id, 100),
    dataUrl,
    width,
    height,
    source: source.source === 'beautified' || source.source === 'upload' ? source.source : fallback.source,
    ...(source.mode === 'original' || source.mode === 'craft' || source.mode === 'studio' ? { mode: source.mode } : {})
  };
}

function safePoster(security: OutputSecurity, poster: PosterDraft, image: ImageAsset, research: ResearchSummary, candidateImage: unknown = image): PosterDraft {
  const style = directionForStyle(poster.style);
  const fallbackDraft = createEmptyDraft();
  const fallbackDesign = resolveDesignBrief(style, {}, research);
  const copy = {
    title: safeCopyText(security, poster.copy?.title, '针织日常', 36),
    description: safeCopyText(security, poster.copy?.description, '一只真实的针织玩偶。', 60),
    tags: Array.isArray(poster.copy?.tags)
      ? poster.copy.tags.map((tag) => safeCopyText(security, tag, '', 40)).filter(Boolean).slice(0, 2)
      : ['#针织玩偶']
  };
  const safeLayers = {
    title: { ...fallbackDraft.layers.title!, text: copy.title },
    description: { ...fallbackDraft.layers.description!, text: copy.description },
    tag: { ...fallbackDraft.layers.tag!, text: copy.tags.join('  ') },
    stickers: {}
  };
  return {
    style,
    image: safeImage(security, candidateImage, image),
    copy: { ...copy, tags: copy.tags.length > 0 ? copy.tags : ['#针织玩偶'] },
    background: typeof poster.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(poster.background) ? poster.background : '#FFFAF4',
    layers: safeLayers,
    design: safeDesignBrief(security, style, poster.design ?? {}, research),
    designNote: security.clean(sanitizeDesignText(poster.designNote, fallbackDesign.mood, 200), fallbackDesign.mood, 200),
    ...(typeof poster.finalPrompt === 'string' && poster.finalPrompt.length <= 20000 && !security.isForbidden(poster.finalPrompt) && !SENSITIVE_RESPONSE_TEXT.test(poster.finalPrompt) ? { finalPrompt: poster.finalPrompt } : {})
  };
}

function safeAnalysis(security: OutputSecurity, analysis: GenerateResponse['analysis']): GenerateResponse['analysis'] {
  const source = recordValue(analysis);
  return {
    subject: security.clean(source.subject, '图片中的真实玩偶', 200),
    colors: security.cleanList(source.colors, [], 12, 40),
    material: security.clean(source.material, '以上传图片中的真实材质为准', 200),
    details: security.cleanList(source.details, [], 12, 200)
  };
}

function safeWarnings(security: OutputSecurity, warnings: string[]): string[] {
  return security.cleanList(warnings, [], 12, 200);
}

function warningForGeneration(style: PosterStyle): string {
  return `${directionLabels[directionForStyle(style)]}方向的海报生成失败，已跳过。`;
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function throwIfOperationAborted(signal: AbortSignal): void {
  try {
    throwIfAborted(signal);
  } catch {
    const reason = signal.reason instanceof Error && signal.reason.name === 'TimeoutError' ? 'timeout' : 'aborted';
    throw new GenerationAbortedError(reason);
  }
}

async function beautifyOnce(imageProvider: ImageBeautifier, poster: PosterDraft, sourceImage: ImageAsset, options: AICallOptions, qualityIssues?: string[]): Promise<PosterDraft> {
  throwIfOperationAborted(options.signal!);
  const posterInput = {
    style: poster.style,
    copy: poster.copy,
    design: poster.design ?? resolveDesignBrief(poster.style, {}),
    designNote: poster.designNote,
    qualityIssues
  };
  const finalPrompt = buildPosterPrompt(posterInput);
  const image = await withDeadline(() => imageProvider.beautify({ image: sourceImage, mode: visualModes[poster.style], poster: posterInput }, options), options.signal!);
  throwIfOperationAborted(options.signal!);
  return { ...poster, image, finalPrompt };
}

async function beautifyWithBusinessRetry(imageProvider: ImageBeautifier, poster: PosterDraft, sourceImage: ImageAsset, signal: AbortSignal, qualityIssues?: string[], retryCount = MAX_BUSINESS_RETRIES): Promise<PosterDraft> {
  const budget = createRetryBudget(retryCount);
  const callOptions: AICallOptions = { signal, retryMode: 'business', retryBudget: budget };
  try {
    return await beautifyOnce(imageProvider, poster, sourceImage, callOptions, qualityIssues);
  } catch (error) {
    if (signal.aborted) throw error;
    if (!isRetryableImageError(error) || !consumeRetryBudget(budget)) throw error;
    return beautifyOnce(imageProvider, poster, sourceImage, callOptions, qualityIssues);
  }
}

export async function generatePosters(input: GeneratePostersInput, options: GeneratePostersOptions = {}): Promise<GenerateResponse> {
  const dependencies = options.dependencies ?? {};
  const providerDependencies: ProviderDependencies = { env: dependencies.env };
  const createProvider = dependencies.getProvider ?? ((providerDeps) => getProvider(providerDeps));
  const createResearcher = dependencies.getReferenceResearcher ?? ((providerDeps) => getReferenceResearcher(providerDeps));
  const createImageProvider = dependencies.getImageProvider ?? ((providerDeps) => getImageProvider(providerDeps));
  const security = createOutputSecurity(dependencies.env ?? process.env);
  const combined = createCombinedSignal(options.signal, options.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS, '生成服务总超时');
  const signal = combined.signal;
  const callOptions: AICallOptions = { signal, retryMode: 'business' };

  try {
    throwIfOperationAborted(signal);
    await options.onPhase?.('researching');
    let research = safeResearch(defaultResearchSummary, security);
    try {
      research = safeResearch(await withDeadline(
        () => createResearcher(providerDependencies).research({ keywords: input.keywords, creativeIdea: input.creativeIdea }, callOptions),
        signal
      ), security);
    } catch (error) {
      if (signal.aborted) throw error;
    }
    throwIfOperationAborted(signal);

    await options.onPhase?.('designing');
    const providerInput: GenerationInput = { ...input, research };
    const result = await withDeadline(() => createProvider(providerDependencies).generate(providerInput, callOptions), signal);
    throwIfOperationAborted(signal);
    let imageProvider: ImageBeautifier;
    try {
      imageProvider = createImageProvider(providerDependencies);
      if (providerDependencies.env?.AI_DEBUG_GENERATION === '1') console.info(`[ai-debug] generation image provider=${imageProvider.constructor.name}`);
    } catch {
      throw new ImageGenerationError();
    }

    const candidates = input.targetStyle
      ? [result.posters.find((poster) => directionForStyle(poster.style) === directionForStyle(input.targetStyle!)) ?? result.posters[0]].filter(Boolean).map((poster) => ({ ...poster, style: directionForStyle(input.targetStyle!) }))
      : result.posters;
    const preparedPosters = candidates.map((poster) => safePoster(security, input.targetStyle && input.selectedPosterCopy ? { ...poster, copy: input.selectedPosterCopy } : poster, input.image, research));
    await options.onPhase?.('generating');
    const warnings: string[] = [];
    const generated = await withDeadline(
      () => Promise.allSettled(preparedPosters.map((poster) => beautifyWithBusinessRetry(imageProvider, poster, input.image, signal))),
      signal
    );
    throwIfOperationAborted(signal);
    const successfulPosters: PosterDraft[] = [];
    generated.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') successfulPosters.push(outcome.value);
      else {
        if (providerDependencies.env?.AI_DEBUG_GENERATION === '1') console.info(`[ai-debug] image generation failed style=${preparedPosters[index].style}`);
        addWarning(warnings, warningForGeneration(preparedPosters[index].style));
      }
    });
    if (successfulPosters.length === 0) throw new ImageGenerationError();

    // 先把图片模型的真实结果直接交给前端。质量检查不能把生成结果静默替换成原图。
    await options.onPhase?.('checking');
    const checkedPosters = successfulPosters;

    return {
      analysis: safeAnalysis(security, result.analysis),
      research: safeResearch(research, security),
      posters: checkedPosters.map((poster) => safePoster(security, poster, input.image, research, poster.image)),
      warnings: safeWarnings(security, warnings)
    };
  } catch (error) {
    if (signal.aborted) {
      const reason = signal.reason instanceof Error && signal.reason.name === 'TimeoutError' ? 'timeout' : 'aborted';
      throw new GenerationAbortedError(reason);
    }
    throw error;
  } finally {
    combined.cleanup();
  }
}
