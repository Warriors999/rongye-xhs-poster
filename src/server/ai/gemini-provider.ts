import { buildGenerationPrompt } from '@/lib/prompts';
import { resolveDesignBrief } from '@/lib/design-system';
import { createEmptyDraft, type GenerationResult, type ImageAsset, type PosterStyle } from '@/domain/project';
import { generateResponseSchema, type GenerateResponse } from './contracts';
import type { GenerationInput, Provider, ProviderDependencies } from './provider';

const PROVIDER_UNAVAILABLE_ERROR = '生成服务暂时不可用，请重试';
const GENERATION_FORMAT_ERROR = '生成结果格式异常，请重试';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TRANSIENT_RETRIES = 1;
const MAX_FORMAT_RETRIES = 1;
const MAX_TEXT_LENGTH = 200;
const MAX_TAG_LENGTH = 40;
const MAX_COPY_TITLE_LENGTH = 36;
const MAX_COPY_DESCRIPTION_LENGTH = 60;

type GeminiEnvelope = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const styles: PosterStyle[] = ['cute', 'daily', 'series'];
const backgrounds = ['#f8e5df', '#f3ead9', '#dfe9df'] as const;
const defaultCopies = [
  ['软乎乎的一天', '把可爱带在身边。'],
  ['手作小日常', '把温柔放进每一针里。'],
  ['针织小伙伴', '把小小陪伴收进画面。']
] as const;

const UNSUPPORTED_COPY_TEXT = /价格|售价|人民币|¥|￥|\$|元|日期|时间|编号|序号|商品名|品名|品牌|销量|规格|尺寸|新品|上新|限时|特价|折扣|折|\d+|(?:vol|no)\.?\s*\d+|第\s*\d+\s*(?:期|集|册)/i;

function truncateText(value: string, maxLength: number): string {
  return Array.from(value.trim()).slice(0, maxLength).join('');
}

function asString(value: unknown, fallback: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return truncateText(value, maxLength) || fallback;
}

function asStringArray(value: unknown, fallback: string[], maxLength = MAX_TEXT_LENGTH): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const strings = values
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => truncateText(item, maxLength))
    .filter(Boolean)
    .slice(0, 12);
  return strings.length ? strings : fallback;
}

function asTags(value: unknown, fallback: string[]): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,，]+/) : [];
  const tags = values
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.startsWith('#') ? item : `#${item}`)
    .map((item) => truncateText(item, MAX_TAG_LENGTH))
    .filter((item) => Boolean(item) && !UNSUPPORTED_COPY_TEXT.test(item))
    .slice(0, 2);
  return tags.length ? tags : fallback;
}

function asCopyText(value: unknown, fallback: string, maxLength: number): string {
  const text = asString(value, fallback, maxLength);
  return UNSUPPORTED_COPY_TEXT.test(text) ? fallback : text;
}

function dataUrlParts(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/);
  if (!match) throw new Error(GENERATION_FORMAT_ERROR);
  return { mimeType: match[1], data: match[2] };
}

function removeTrailingCommas(text: string): string {
  let repaired = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      repaired += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      repaired += character;
      continue;
    }
    if (character === ',') {
      let nextIndex = index + 1;
      while (/\s/.test(text[nextIndex] ?? '')) nextIndex += 1;
      if (text[nextIndex] === '}' || text[nextIndex] === ']') continue;
    }
    repaired += character;
  }
  return repaired;
}

function tryParseJsonObject(text: string): unknown | undefined {
  for (const candidate of [text, removeTrailingCommas(text)]) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
    } catch {
      // Try the next safe candidate. Never evaluate model output as code.
    }
  }
  return undefined;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const direct = tryParseJsonObject(trimmed);
  if (direct !== undefined) return direct;

  for (let start = trimmed.indexOf('{'); start >= 0; start = trimmed.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          const parsed = tryParseJsonObject(trimmed.slice(start, index + 1));
          if (parsed !== undefined) return parsed;
          break;
        }
      }
    }
  }
  throw new Error(GENERATION_FORMAT_ERROR);
}

function normalizeResponse(value: unknown, image: ImageAsset): GenerateResponse {
  if (typeof value !== 'object' || value === null) throw new Error(GENERATION_FORMAT_ERROR);
  const record = value as Record<string, unknown>;
  const analysisRecord = typeof record.analysis === 'object' && record.analysis !== null ? record.analysis as Record<string, unknown> : {};
  const candidates = Array.isArray(record.posters)
    ? record.posters
    : Array.isArray(record.schemes)
      ? record.schemes
      : Array.isArray(record.plans)
        ? record.plans
        : [];
  const fallbackColors = ['以图片为准'];
  const analysis = {
    subject: asString(analysisRecord.subject ?? analysisRecord.name, '图片中的针织玩偶'),
    colors: asStringArray(analysisRecord.colors ?? analysisRecord.color, fallbackColors, MAX_TAG_LENGTH),
    material: asString(analysisRecord.material, '针织纹理（以图片为准）'),
    details: asStringArray(analysisRecord.details ?? analysisRecord.detail, ['保留主体轮廓和关键配件'])
  };

  const posters = styles.map((style, index) => {
    const candidate = typeof candidates[index] === 'object' && candidates[index] !== null ? candidates[index] as Record<string, unknown> : {};
    const candidateCopy = typeof candidate.copy === 'object' && candidate.copy !== null ? candidate.copy as Record<string, unknown> : candidate;
    const [fallbackTitle, fallbackDescription] = defaultCopies[index];
    const title = asCopyText(candidateCopy.title, fallbackTitle, MAX_COPY_TITLE_LENGTH);
    const description = asCopyText(candidateCopy.description, fallbackDescription, MAX_COPY_DESCRIPTION_LENGTH);
    const draft = createEmptyDraft();
    const design = resolveDesignBrief(style, candidate.design ?? candidate.brief);
    const tags = asTags(candidateCopy.tags ?? candidateCopy.tag, ['#针织玩偶', index === 1 ? '#手作日常' : '#可爱种草']);
    return {
      ...draft,
      style,
      image: { ...image },
      copy: {
        title,
        description,
        tags
      },
      background: backgrounds[index],
      design,
      layers: {
        ...draft.layers,
        title: { ...draft.layers.title!, text: title },
        description: { ...draft.layers.description!, text: description },
        tag: { ...draft.layers.tag!, text: asTags(candidateCopy.tags ?? candidateCopy.tag, ['#针织玩偶', '#手作日常']).join('  ') }
      }
    };
  });

  try {
    return generateResponseSchema.parse({ analysis, posters });
  } catch {
    throw new Error(GENERATION_FORMAT_ERROR);
  }
}

export class GeminiProvider implements Provider {
  private readonly fetchImpl: typeof fetch;
  private readonly env: Record<string, string | undefined>;
  private readonly timeoutMs: number;

  constructor(dependencies: ProviderDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.env = dependencies.env ?? process.env;
    this.timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generate(input: GenerationInput): Promise<GenerateResponse> {
    const baseUrl = this.env.AI_VISION_BASE_URL || this.env.AI_BASE_URL;
    const apiKey = this.env.AI_VISION_API_KEY || this.env.AI_API_KEY;
    const model = this.env.AI_VISION_MODEL;
    if (!baseUrl || !apiKey || !model) throw new Error(PROVIDER_UNAVAILABLE_ERROR);

    const image = dataUrlParts(input.image.dataUrl);
    const url = `${baseUrl.replace(/\/$/, '')}/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ role: 'user', parts: [
        { text: buildGenerationPrompt(input) },
        { inline_data: { mime_type: image.mimeType, data: image.data } }
      ] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    for (let attempt = 0; attempt <= MAX_FORMAT_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchWithRetry(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch {
        throw new Error(PROVIDER_UNAVAILABLE_ERROR);
      }
      if (!response.ok) {
        try { await response.body?.cancel(); } catch { /* keep upstream details private */ }
        throw new Error(PROVIDER_UNAVAILABLE_ERROR);
      }

      try {
        const envelope = await response.json() as GeminiEnvelope;
        const text = envelope.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
        if (!text) throw new Error(GENERATION_FORMAT_ERROR);
        return normalizeResponse(parseJsonObject(text), input.image);
      } catch (error) {
        if (attempt < MAX_FORMAT_RETRIES) continue;
        throw new Error(GENERATION_FORMAT_ERROR);
      }
    }

    throw new Error(GENERATION_FORMAT_ERROR);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        if (attempt < MAX_TRANSIENT_RETRIES && isTransientStatus(response.status)) {
          try { await response.body?.cancel(); } catch { /* keep upstream details private */ }
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_TRANSIENT_RETRIES) continue;
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(PROVIDER_UNAVAILABLE_ERROR);
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}
