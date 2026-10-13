import { buildGenerationPrompt } from '@/lib/prompts';
import { formatDesignedImagePrompt } from '@/lib/image-prompt-spec';
import { resolveDesignBrief, sanitizeDesignText } from '@/lib/design-system';
import { createEmptyDraft, type ImageAsset, type PosterDirection } from '@/domain/project';
import { generateResponseSchema, type GenerateResponse } from './contracts';
import { cloneResearchSummary, type GenerationInput, type Provider, type ProviderDependencies } from './provider';
import { createCombinedSignal, raceWithAbort, type AICallOptions } from './call-options';
import { geminiGenerateContentUrl, resolveAIConfig } from './config';

const PROVIDER_UNAVAILABLE_ERROR = '生成服务暂时不可用，请重试';
const GENERATION_FORMAT_ERROR = '生成结果格式异常，请重试';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TRANSIENT_RETRIES = 1;
const MAX_FORMAT_RETRIES = 1;
const MAX_RESPONSE_BODY_BYTES = 512 * 1024;
const MAX_JSON_INPUT_LENGTH = MAX_RESPONSE_BODY_BYTES;
const MAX_JSON_CANDIDATE_SCANS = 32;
const MAX_TEXT_LENGTH = 200;
const MAX_TAG_LENGTH = 40;
const MAX_COPY_TITLE_LENGTH = 36;
const MAX_COPY_DESCRIPTION_LENGTH = 60;
const DEFAULT_DESIGN_NOTE = '以主体保真为前提，保留清晰留白和简洁信息层级。';

type GeminiEnvelope = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

type GeminiFetchResult = {
  response: Response;
  bodyText: string;
};

class ResponseBodyFormatError extends Error {}
class ResponseBodyLimitError extends Error {}

const DYNAMIC_DIRECTIONS: PosterDirection[] = ['lifestyle', 'story', 'editorial'];
const backgrounds = ['#f8e5df', '#f3ead9', '#dfe9df'] as const;
const defaultCopies = [
  ['软乎乎的一天', '把可爱带在身边。'],
  ['手作小日常', '把温柔放进每一针里。'],
  ['针织小伙伴', '把小小陪伴收进画面。']
] as const;

const UNSUPPORTED_COPY_TEXT = /价格|售价|人民币|¥|￥|\$|元|日期|时间|编号|序号|名称|商品名|品名|品牌|销量|规格|尺寸|新品|上新|限时|特价|折扣|折|伪文字|虚构|编造|水印|logo|\d+|(?:vol|no)\.?\s*\d+|第\s*\d+\s*(?:期|集|册)/i;

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
  if (trimmed.length > MAX_JSON_INPUT_LENGTH) throw new Error(GENERATION_FORMAT_ERROR);
  const direct = tryParseJsonObject(trimmed);
  if (direct !== undefined) return direct;

  let candidateScans = 0;
  for (let start = trimmed.indexOf('{'); start >= 0 && candidateScans < MAX_JSON_CANDIDATE_SCANS; start = trimmed.indexOf('{', start + 1)) {
    candidateScans += 1;
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

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function directionForCandidate(candidate: Record<string, unknown>): PosterDirection | undefined {
  const design = recordValue(candidate.design ?? candidate.brief);
  const value = candidate.direction ?? candidate.style ?? design.direction;
  if (value === 'story' || value === 'daily') return 'story';
  if (value === 'editorial' || value === 'series') return 'editorial';
  if (value === 'lifestyle' || value === 'cute') return 'lifestyle';
  return undefined;
}

function readCandidates(record: Record<string, unknown>): unknown[] {
  if (Array.isArray(record.variants) && record.variants.length > 0) return record.variants;
  if (Array.isArray(record.posters) && record.posters.length > 0) return record.posters;
  if (Array.isArray(record.plans) && record.plans.length > 0) return record.plans;
  // Keep the earlier relay compatibility while giving the documented shapes priority.
  if (Array.isArray(record.schemes) && record.schemes.length > 0) return record.schemes;
  return [];
}

function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('上游响应读取超时');
  error.name = 'AbortError';
  return error;
}

async function readChunkWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw createAbortError(signal);
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
    onAbort = () => reject(createAbortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([reader.read(), abortPromise]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function cancelBodyWithAbort(response: Response, signal: AbortSignal): Promise<void> {
  if (!response.body) return;
  let cancellation: Promise<void>;
  try {
    cancellation = response.body.cancel();
  } catch {
    return;
  }
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<void>((resolve) => {
    onAbort = () => resolve();
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await Promise.race([cancellation, abortPromise]);
  } catch {
    // The response body is already being discarded; keep upstream details private.
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function cancelReaderWithAbort(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<void> {
  let cancellation: Promise<void>;
  try {
    cancellation = reader.cancel();
  } catch {
    return;
  }
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<void>((resolve) => {
    onAbort = () => resolve();
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    await Promise.race([cancellation, abortPromise]);
  } catch {
    // Cancellation is best effort; the request timeout remains the outer guard.
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

async function readResponseBody(response: Response, signal: AbortSignal): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BODY_BYTES) {
      await cancelBodyWithAbort(response, signal);
      throw new ResponseBodyLimitError();
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await readChunkWithAbort(reader, signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BODY_BYTES) {
        await cancelReaderWithAbort(reader, signal);
        throw new ResponseBodyLimitError();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (error) {
    if (!(error instanceof ResponseBodyFormatError)) void cancelReaderWithAbort(reader, signal);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* keep upstream details private */ }
  }
}

function normalizeResponse(value: unknown, image: ImageAsset, research: GenerationInput['research'], targetStyle?: GenerationInput['targetStyle']): GenerateResponse {
  if (typeof value !== 'object' || value === null) throw new Error(GENERATION_FORMAT_ERROR);
  const record = value as Record<string, unknown>;
  const analysisRecord = typeof record.analysis === 'object' && record.analysis !== null ? record.analysis as Record<string, unknown> : {};
  const candidates = readCandidates(record);
  const slots: Array<Record<string, unknown> | undefined> = DYNAMIC_DIRECTIONS.map(() => undefined);
  const unassigned: Array<Record<string, unknown>> = [];

  for (const rawCandidate of candidates) {
    const candidate = recordValue(rawCandidate);
    const direction = directionForCandidate(candidate);
    const slot = direction === undefined ? -1 : DYNAMIC_DIRECTIONS.indexOf(direction);
    if (slot >= 0 && slots[slot] === undefined) slots[slot] = candidate;
    else unassigned.push(candidate);
  }
  for (const candidate of unassigned) {
    const slot = slots.findIndex((current) => current === undefined);
    if (slot < 0) break;
    slots[slot] = candidate;
  }

  const firstCandidate = candidates.find((candidate) => recordValue(recordValue(candidate).imagePrompt).subject);
  const firstPrompt = recordValue(recordValue(firstCandidate).imagePrompt);
  const recognizedSubject = sanitizeDesignText(firstPrompt.subject, '');
  const recognizedColor = sanitizeDesignText(firstPrompt.colorLighting, '');
  const recognizedMaterial = sanitizeDesignText(firstPrompt.visualLanguage, '');
  const recognizedDetails = sanitizeDesignText(firstPrompt.preserve, '');
  const fallbackColors = ['以图片为准'];
  const analysis = {
    subject: asString(analysisRecord.subject ?? analysisRecord.name ?? recognizedSubject, '图片中的针织玩偶'),
    colors: asStringArray(analysisRecord.colors ?? analysisRecord.color ?? recognizedColor, fallbackColors, MAX_TAG_LENGTH),
    material: asString(analysisRecord.material ?? recognizedMaterial, '针织纹理（以图片为准）'),
    details: asStringArray(analysisRecord.details ?? analysisRecord.detail ?? recognizedDetails, ['保留主体轮廓和关键配件'])
  };

  const targetDirection = targetStyle ? directionForCandidate({ style: targetStyle }) : undefined;
  const directions = targetDirection ? [targetDirection] : DYNAMIC_DIRECTIONS;
  const posters = directions.map((direction) => {
    const index = DYNAMIC_DIRECTIONS.indexOf(direction);
    const candidate = targetDirection
      ? recordValue(candidates.find((raw) => directionForCandidate(recordValue(raw)) === direction) ?? candidates[0])
      : slots[index] ?? {};
    const candidateCopy = typeof candidate.copy === 'object' && candidate.copy !== null ? candidate.copy as Record<string, unknown> : candidate;
    const [fallbackTitle, fallbackDescription] = defaultCopies[index];
    const title = asCopyText(candidateCopy.title, fallbackTitle, MAX_COPY_TITLE_LENGTH);
    const description = asCopyText(candidateCopy.description, fallbackDescription, MAX_COPY_DESCRIPTION_LENGTH);
    const draft = createEmptyDraft();
    const design = resolveDesignBrief(direction, candidate.design ?? candidate.brief, cloneResearchSummary(research));
    const fallbackTags = index === 0 ? ['#针织玩偶'] : index === 1 ? ['#针织玩偶', '#手作日常'] : ['#针织玩偶', '#可爱种草'];
    const tags = asTags(candidateCopy.tags ?? candidateCopy.tag, fallbackTags);
    const copy = { title, description, tags };
    const finalPrompt = formatDesignedImagePrompt(candidate.imagePrompt, copy);
    return {
      ...draft,
      style: direction,
      image: { ...image },
      copy,
      ...(finalPrompt ? { finalPrompt } : {}),
      background: backgrounds[index],
      design,
      designNote: sanitizeDesignText(candidate.designNote, DEFAULT_DESIGN_NOTE, MAX_TEXT_LENGTH),
      layers: {
        ...draft.layers,
        title: { ...draft.layers.title!, text: title },
        description: { ...draft.layers.description!, text: description },
        tag: { ...draft.layers.tag!, text: tags.join('  ') }
      }
    };
  });

  try {
    return generateResponseSchema.parse({
      analysis,
      research: cloneResearchSummary(research),
      posters
    });
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

  async generate(input: GenerationInput, options: AICallOptions = {}): Promise<GenerateResponse> {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('请求已取消');
    const config = resolveAIConfig(this.env);
    const baseUrl = config.vision.baseUrl;
    const apiKey = config.vision.apiKey;
    const model = config.vision.model;
    if (!baseUrl || !apiKey || !model) throw new Error(PROVIDER_UNAVAILABLE_ERROR);

    const research = cloneResearchSummary(input.research);
    const image = dataUrlParts(input.image.dataUrl);
    const reference = input.referenceImage ? dataUrlParts(input.referenceImage.dataUrl) : undefined;
    const promptInput = { ...input, research };
    const url = `${geminiGenerateContentUrl(baseUrl, model)}?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ role: 'user', parts: [
        { text: buildGenerationPrompt(promptInput) },
        { inline_data: { mime_type: image.mimeType, data: image.data } },
        ...(reference ? [{ inline_data: { mime_type: reference.mimeType, data: reference.data } }] : [])
      ] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    for (let formatAttempt = 0; formatAttempt <= MAX_FORMAT_RETRIES; formatAttempt += 1) {
      let result: GeminiFetchResult;
      try {
        result = await this.fetchWithRetry(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }, options);
      } catch (error) {
        if (error instanceof ResponseBodyLimitError) {
          throw new Error(GENERATION_FORMAT_ERROR);
        }
        if (error instanceof ResponseBodyFormatError) {
          if (formatAttempt < MAX_FORMAT_RETRIES) continue;
          throw new Error(GENERATION_FORMAT_ERROR);
        }
        if (options.signal?.aborted) throw error;
        throw new Error(PROVIDER_UNAVAILABLE_ERROR);
      }
      if (!result.response.ok) throw new Error(PROVIDER_UNAVAILABLE_ERROR);

      try {
        const envelope = JSON.parse(result.bodyText) as GeminiEnvelope;
        const text = envelope.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
        if (!text) throw new Error(GENERATION_FORMAT_ERROR);
        const normalized = normalizeResponse(parseJsonObject(text), input.image, research, input.targetStyle);
        if (options.requireDesignedPrompt && normalized.posters.some((poster) => !poster.finalPrompt)) throw new Error(GENERATION_FORMAT_ERROR);
        return normalized;
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (formatAttempt < MAX_FORMAT_RETRIES) continue;
        throw new Error(GENERATION_FORMAT_ERROR);
      }
    }

    throw new Error(GENERATION_FORMAT_ERROR);
  }

  private async fetchWithTimeout(url: string, init: RequestInit, options: AICallOptions): Promise<GeminiFetchResult> {
    const combined = createCombinedSignal(options.signal, this.timeoutMs, '视觉模型响应超时');
    try {
      const response = await raceWithAbort(this.fetchImpl(url, { ...init, signal: combined.signal }), combined.signal);
      if (!response.ok) {
        await cancelBodyWithAbort(response, combined.signal);
        return { response, bodyText: '' };
      }
      return { response, bodyText: await readResponseBody(response, combined.signal) };
    } finally {
      combined.cleanup();
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit, options: AICallOptions): Promise<GeminiFetchResult> {
    let lastError: unknown;
    const maxRetries = options.retryMode === 'business' ? 0 : MAX_TRANSIENT_RETRIES;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await this.fetchWithTimeout(url, init, options);
        if (attempt < maxRetries && isTransientStatus(result.response.status)) {
          continue;
        }
        return result;
      } catch (error) {
        if (error instanceof ResponseBodyFormatError || error instanceof ResponseBodyLimitError) throw error;
        if (options.signal?.aborted) throw error;
        lastError = error;
        if (attempt < maxRetries) continue;
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(PROVIDER_UNAVAILABLE_ERROR);
  }
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}
