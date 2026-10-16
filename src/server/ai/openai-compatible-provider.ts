import { buildGenerationPrompt } from '@/lib/prompts';
import { formatDesignedImagePrompt } from '@/lib/image-prompt-spec';
import { createEmptyDraft, defaultResearchSummary, type ImageAsset, type PosterDirection } from '@/domain/project';
import { resolveDesignBrief, sanitizeDesignText } from '@/lib/design-system';
import { generateResponseSchema, type GenerateResponse } from './contracts';
import { cloneResearchSummary, type GenerationInput, type Provider, type ProviderDependencies } from './provider';
import { createCombinedSignal, raceWithAbort, type AICallOptions } from './call-options';
import { resolveAIConfig } from './config';
import { readChatResponse } from './chat-response';
import { parseModelJson } from './model-json';

export const PROVIDER_UNAVAILABLE_ERROR = '生成服务暂时不可用，请重试';
export const GENERATION_FORMAT_ERROR = '生成结果格式异常，请重试';

const DEFAULT_TIMEOUT_MS = 60_000;
const GPT_61_SOL_TIMEOUT_MS = 570_000;
const MAX_FORMAT_RETRIES = 1;
const MAX_RESPONSE_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_DESIGN_NOTE = '以主体保真为前提，保留清晰留白和简洁信息层级。';
const MAX_COPY_TITLE_LENGTH = 36;
const MAX_COPY_DESCRIPTION_LENGTH = 60;
const MAX_TAG_LENGTH = 40;
const MAX_DESIGN_NOTE_LENGTH = 200;
const DEFAULT_COPIES = [
  ['软乎乎的一天', '把可爱带在身边。'],
  ['手作小日常', '把温柔放进每一针里。'],
  ['针织小伙伴', '把小小陪伴收进画面。']
] as const;
const UNSUPPORTED_COPY_TEXT = /价格|售价|人民币|¥|￥|\$|元|日期|时间|编号|序号|名称|商品名|品名|品牌|销量|规格|尺寸|新品|上新|限时|特价|折扣|折|伪文字|虚构|编造|水印|logo|\d+|(?:vol|no)\.?\s*\d+|第\s*\d+\s*(?:期|集|册)/i;

class ResponseBodyFormatError extends Error {}

type CompletionMessage = {
  content?: string | object;
};

type CompletionEnvelope = {
  choices?: Array<{
    message?: CompletionMessage;
  }>;
};


function directionForStyle(style: unknown): 'lifestyle' | 'story' | 'editorial' {
  if (style === 'story' || style === 'daily') return 'story';
  if (style === 'editorial' || style === 'series') return 'editorial';
  return 'lifestyle';
}

const DYNAMIC_DIRECTIONS: PosterDirection[] = ['lifestyle', 'story', 'editorial'];

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function truncateText(value: string, maxLength: number): string {
  return Array.from(value.trim()).slice(0, maxLength).join('');
}

function asString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return truncateText(value, maxLength) || fallback;
}

function asCopyText(value: unknown, fallback: string, maxLength: number): string {
  const text = asString(value, fallback, maxLength);
  return UNSUPPORTED_COPY_TEXT.test(text) ? fallback : text;
}

function asTags(value: unknown, fallback: string[]): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,，]+/) : [];
  const tags = values
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())
    .map((item) => item.startsWith('#') ? item : `#${item}`)
    .map((item) => truncateText(item, MAX_TAG_LENGTH))
    .filter((item) => Boolean(item) && !UNSUPPORTED_COPY_TEXT.test(item))
    .slice(0, 2);
  return tags.length ? tags : fallback;
}

function asDesignNote(value: unknown): string {
  return sanitizeDesignText(value, DEFAULT_DESIGN_NOTE, MAX_DESIGN_NOTE_LENGTH);
}

function asBackground(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function normalizePosters(value: unknown, image: ImageAsset, research: GenerationInput['research'], targetStyle?: GenerationInput['targetStyle']): unknown {
  const record = recordValue(value);
  const analysis = recordValue(record.analysis);
  const rawPosters = Array.isArray(record.posters) ? record.posters : [];
  const slots: Array<Record<string, unknown> | undefined> = DYNAMIC_DIRECTIONS.map(() => undefined);

  for (const rawPoster of rawPosters) {
    const poster = recordValue(rawPoster);
    const preferredSlot = poster.style === undefined ? -1 : DYNAMIC_DIRECTIONS.indexOf(directionForStyle(poster.style));
    const slot = preferredSlot >= 0 && slots[preferredSlot] === undefined
      ? preferredSlot
      : slots.findIndex((candidate) => candidate === undefined);
    if (slot >= 0) slots[slot] = poster;
  }

  const directions = targetStyle ? [directionForStyle(targetStyle)] : DYNAMIC_DIRECTIONS;
  const posters = directions.map((direction) => {
    const index = DYNAMIC_DIRECTIONS.indexOf(direction);
    const candidate = targetStyle
      ? recordValue(rawPosters.find((raw) => directionForStyle(recordValue(raw).style) === direction) ?? rawPosters[0])
      : slots[index] ?? {};
    const fallback = createEmptyDraft();
    const candidateCopy = recordValue(candidate.copy);
    const [fallbackTitle, fallbackDescription] = DEFAULT_COPIES[index];
    const title = asCopyText(candidateCopy.title, fallbackTitle, MAX_COPY_TITLE_LENGTH);
    const description = asCopyText(candidateCopy.description ?? candidateCopy.subtitle, fallbackDescription, MAX_COPY_DESCRIPTION_LENGTH);
    const tags = asTags(candidateCopy.tags ?? candidateCopy.tag, index === 1 ? ['#针织玩偶', '#手作日常'] : index === 2 ? ['#针织玩偶', '#可爱种草'] : ['#针织玩偶']);
    const copy = { title, description, tags };
    const finalPrompt = formatDesignedImagePrompt(candidate.imagePrompt, copy);
    const design = recordValue(candidate.design ?? candidate.brief);
    const palette = recordValue(design.palette);
    return {
      ...fallback,
      ...candidate,
      style: direction,
      image: { ...image },
      background: asBackground(candidate.background, fallback.background),
      copy,
      finalPrompt: finalPrompt ?? undefined,
      design: resolveDesignBrief(direction, { ...design, ...(Object.keys(palette).length ? { palette: Object.values(palette).filter((color) => typeof color === 'string') } : {}) }, cloneResearchSummary(research)),
      designNote: asDesignNote(candidate.designNote),
      layers: {
        ...fallback.layers,
        title: { ...fallback.layers.title!, text: title },
        description: { ...fallback.layers.description!, text: description },
        tag: { ...fallback.layers.tag!, text: tags.join('  ') }
      }
    };
  });

  return {
    ...record,
    analysis: {
      ...analysis,
      subject: analysis.subject ?? analysis.subjectIdentity,
      colors: analysis.colors ?? [],
      material: analysis.material ?? '以上传照片中真实可见的材质为准',
      details: analysis.details ?? [analysis.poseAndOrientation, ...(Array.isArray(analysis.protectionScope) ? analysis.protectionScope : [])].filter((detail) => typeof detail === 'string' && detail.trim()).map((detail) => truncateText(detail as string, 200)).slice(0, 12)
    },
    research: cloneResearchSummary(research),
    posters
  };
}

function withLegacyDefaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const posters = Array.isArray(record.posters)
    ? record.posters.map((value) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
        const poster = value as Record<string, unknown>;
        const design = typeof poster.design === 'object' && poster.design !== null && !Array.isArray(poster.design)
          ? poster.design as Record<string, unknown>
          : undefined;
        return {
          ...poster,
          designNote: typeof poster.designNote === 'string' && poster.designNote.trim() ? poster.designNote : DEFAULT_DESIGN_NOTE,
          ...(design ? { design: { ...design, direction: design.direction ?? directionForStyle(poster.style) } } : {})
        };
      })
    : record.posters;

  return {
    ...record,
    research: record.research ?? { ...defaultResearchSummary, sources: defaultResearchSummary.sources.map((source) => ({ ...source })) },
    ...(Array.isArray(record.posters) ? { posters } : {})
  };
}

export class OpenAICompatibleProvider implements Provider {
  private readonly fetchImpl: typeof fetch;
  private readonly env: Record<string, string | undefined>;
  private readonly timeoutMs: number;

  constructor(dependencies: ProviderDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.env = dependencies.env ?? process.env;
    this.timeoutMs = dependencies.timeoutMs ?? (this.env.AI_VISION_MODEL?.trim() === 'gpt-6.1-sol' ? GPT_61_SOL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  }

  async generate(input: GenerationInput, options: AICallOptions = {}): Promise<GenerateResponse> {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('请求已取消');
    const config = resolveAIConfig(this.env);
    const baseUrl = config.vision.baseUrl;
    const apiKey = config.vision.apiKey;
    const visionModel = config.vision.model;
    const imageModel = config.image.model;
    if (!baseUrl || !apiKey || !visionModel || !imageModel) throw new Error('AI 服务配置不完整，请联系管理员');
    const maxFormatRetries = visionModel === 'gpt-6.1-sol' ? 0 : MAX_FORMAT_RETRIES;
    const body = {
      model: visionModel,
      ...(visionModel === 'gpt-6.1-sol' ? { reasoning_effort: 'high' } : {}),
      ...(visionModel === 'gpt-6.1-sol' ? { stream: true } : {}),
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: buildGenerationPrompt(input) },
        { type: 'image_url', image_url: { url: input.image.dataUrl } },
        ...(input.referenceImage ? [{ type: 'image_url', image_url: { url: input.referenceImage.dataUrl } }] : [])
      ] }]
    };
    for (let formatAttempt = 0; formatAttempt <= maxFormatRetries; formatAttempt += 1) {
      let response: Response;
      let envelope: CompletionEnvelope | undefined;
      try {
        const result = await this.fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body)
        }, options);
        response = result.response;
        envelope = result.envelope as CompletionEnvelope | undefined;
      } catch (error) {
        if (error instanceof ResponseBodyFormatError) {
          if (formatAttempt < maxFormatRetries) continue;
          throw new Error(GENERATION_FORMAT_ERROR);
        }
        if (options.signal?.aborted) throw error;
        throw new Error(PROVIDER_UNAVAILABLE_ERROR);
      }
      if (!response.ok) {
        console.error(`[design-response] stage=upstream status=${response.status}`);
        try {
          await response.body?.cancel();
        } catch {
          // The upstream error is already mapped to a safe provider error.
        }
        throw new Error(PROVIDER_UNAVAILABLE_ERROR);
      }
      try {
        const content = envelope?.choices?.[0]?.message?.content;
        const value = typeof content === 'string' ? parseModelJson(content) : content;
        const normalized = generateResponseSchema.parse(normalizePosters(withLegacyDefaults(value), input.image, input.research, input.targetStyle));
        if (options.requireDesignedPrompt && normalized.posters.some((poster) => !poster.finalPrompt)) {
          const slots = normalized.posters.flatMap((poster, index) => poster.finalPrompt ? [] : [index]);
          console.error(`[design-response] stage=prompt-validation slots=${slots.join(',')} code=invalid-image-prompt`);
          throw new Error(GENERATION_FORMAT_ERROR);
        }
        return normalized;
      } catch (error) {
        if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
          const paths = error.issues.slice(0, 12).map((issue: { path?: Array<string | number>; code?: string }) => `${issue.path?.join('.') ?? ''}:${issue.code ?? 'invalid'}`);
          console.error(`[design-response] stage=schema-validation paths=${paths.join(',')}`);
        }
        console.error('[design-response] stage=validation code=invalid-plan');
        if (formatAttempt < maxFormatRetries) continue;
        throw new Error(GENERATION_FORMAT_ERROR);
      }
    }

    throw new Error(GENERATION_FORMAT_ERROR);
  }

  private async fetchWithTimeout(url: string, init: RequestInit, options: AICallOptions): Promise<{ response: Response; envelope?: unknown }> {
    const combined = createCombinedSignal(options.signal, this.timeoutMs, '视觉模型响应超时');
    try {
      const response = await raceWithAbort(this.fetchImpl(url, { ...init, signal: combined.signal }), combined.signal);
      if (!response.ok) return { response };
      if (!response.body && typeof response.json === 'function') {
        try {
          return { response, envelope: await raceWithAbort(response.json(), combined.signal) };
        } catch (error) {
          if (options.signal?.aborted || error instanceof Error && error.name === 'TimeoutError') throw error;
          throw new ResponseBodyFormatError();
        }
      }
      try {
        return { response, envelope: await readChatResponse(response, combined.signal, MAX_RESPONSE_BODY_BYTES) };
      } catch (error) {
        if (combined.signal.aborted) throw error;
        const code = error instanceof Error && /^chat-[a-z-]+$/.test(error.message) ? error.message : 'invalid-json';
        console.error(`[design-response] stage=read code=${code}`);
        throw new ResponseBodyFormatError();
      }
    } finally {
      combined.cleanup();
    }
  }
}
