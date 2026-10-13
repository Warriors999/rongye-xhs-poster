import { sanitizeDesignText } from '@/lib/design-system';
import type { BeautifyMode, CopyData, DesignBrief, ImageAsset, PosterStyle } from '@/domain/project';
import type { ProviderDependencies } from './provider';
import { createCombinedSignal, isAbortError, raceWithAbort, type AICallOptions } from './call-options';
import { resolveAIConfig } from './config';
import { normalizePosterOutput } from './poster-output';
import { reviewedImagePrompt } from '@/lib/prompt-review';

export const IMAGE_PROVIDER_UNAVAILABLE_ERROR = '图片美化服务暂时不可用，请重试';
export const IMAGE_FORMAT_ERROR = '图片美化结果格式异常，请重试';

export class ImageProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'ImageProviderError';
    this.retryable = retryable;
  }
}

function isNonRetryableImageMessage(message: string): boolean {
  const status = message.match(/\b4\d{2}\b/)?.[0];
  if (status === '429') return false;
  if (status) return true;
  return /unauthori[sz]ed|forbidden|authentication|api[- _]?key|client error/i.test(message);
}

export function isRetryableImageError(error: unknown): boolean {
  if (error instanceof ImageProviderError) return error.retryable;
  return error instanceof Error
    && error.message !== IMAGE_FORMAT_ERROR
    && !isAbortError(error)
    && !isNonRetryableImageMessage(error.message);
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TRANSIENT_RETRIES = 1;
export const MAX_IMAGE_RESPONSE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_B64_LENGTH = 9_900_000;
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_CHUNKS = 10_000;
const MAX_QUALITY_ISSUES = 6;
const MAX_QUALITY_ISSUE_LENGTH = 160;

const UNSAFE_QUALITY_ISSUE_PATTERNS = [
  /价格|售价|人民币|¥|￥|\$|元|日期|时间|名称|商品名|品名|品牌|编号|序号|规格|尺寸|伪文字|乱码|假字|虚构|编造|logo|水印/i,
  /(?:忽略|无视|绕过|覆盖|改写|重写).{0,24}(?:规则|指令|限制|要求|提示|主体|玩偶|角色|人物)/i,
  /(?:ignore|override|disregard|rewrite|replace|change|redraw|copy)\s+(?:the\s+)?(?:rules?|instructions?|constraints?|requirements?|subject|doll|character|person|object)/i,
  /(?:新增|添加|增加|引入|替换|更换|换成|改为|改变|重绘|复制).{0,24}(?:主体|玩偶|角色|人物|形象|对象)/i,
  /(?:主体|玩偶|角色|人物|形象|对象).{0,24}(?:新增|添加|增加|引入|替换|更换|换成|改为|改变|重绘|复制)/i,
  /(?:add|introduce|include|insert|replace|switch|change|redraw|copy).{0,32}(?:subject|doll|character|person|object)/i
] as const;

export interface ImageBeautifyInput {
  image: ImageAsset;
  mode: BeautifyMode;
  poster?: {
    style: PosterStyle;
    copy: CopyData;
    design: DesignBrief;
    /** Optional during the compatibility window for the old beautify callers. */
    designNote?: string;
    qualityIssues?: string[];
    alternatives?: DesignBrief[];
    promptOverride?: string;
  };
}

export interface ImageBeautifier {
  beautify(input: ImageBeautifyInput, options?: AICallOptions): Promise<ImageAsset>;
}

const prompts: Record<BeautifyMode, string> = {
  original: '系列账号卡方向：保留原始照片的真实气质，整理为干净统一的浅色背景和稳定的栏目感构图，增加非常轻的纸张层次。',
  craft: '手作日常卡方向：把背景和整体氛围提升为温馨的手作工作台场景，可加入少量毛线、布艺、木质桌面等柔和元素，但不能遮挡主体。',
  studio: '可爱种草卡方向：把背景和整体氛围提升为干净的奶油色或低饱和粉彩棚拍，突出主体，加入少量柔和的玩具感小道具，保持画面简洁高级。'
};

const SAFE_POSTER_STYLES: PosterStyle[] = ['lifestyle', 'story', 'editorial', 'cute', 'daily', 'series'];
const DEFAULT_COPY: CopyData = {
  title: '针织日常',
  description: '一只真实的针织玩偶。',
  tags: ['#针织玩偶']
};

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanPromptText(value: unknown, maxLength: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || UNSAFE_QUALITY_ISSUE_PATTERNS.some((pattern) => pattern.test(cleaned))) return fallback;
  return Array.from(cleaned).slice(0, maxLength).join('') || fallback;
}

function cleanPromptList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanPromptText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeCopy(value: unknown): CopyData {
  const source = recordValue(value);
  const tags = cleanPromptList(source.tags, 2, 40)
    .map((tag) => tag.startsWith('#') ? tag : `#${tag}`)
    .filter((tag) => !UNSAFE_QUALITY_ISSUE_PATTERNS.some((pattern) => pattern.test(tag)));
  return {
    title: cleanPromptText(source.title, 36, DEFAULT_COPY.title),
    description: cleanPromptText(source.description, 60, DEFAULT_COPY.description),
    tags: tags.length > 0 ? tags : [...DEFAULT_COPY.tags]
  };
}

function cleanDesignPromptText(value: unknown, maxLength: number, fallback = ''): string {
  return sanitizeDesignText(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : value, fallback, maxLength);
}

function cleanDesignPromptList(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value) ? value.map((item) => cleanDesignPromptText(item, maxLength)).filter(Boolean).slice(0, maxItems) : [];
}

function sanitizeDesign(value: unknown, style: PosterStyle): Record<string, unknown> {
  const source = recordValue(value);
  return {
    label: cleanDesignPromptText(source.label ?? source.name, 80, '动态创意方案'),
    direction: SAFE_POSTER_STYLES.includes(source.direction as PosterStyle) ? source.direction : style,
    concept: cleanDesignPromptText(source.concept, 200, '根据真实玩偶和设计方向动态组织画面。'),
    layout: cleanDesignPromptText(source.layout, 240, '根据主体和留白动态安排构图。'),
    scene: cleanDesignPromptText(source.scene, 240, '使用与真实玩偶相称的简洁场景。'),
    elements: cleanDesignPromptList(source.elements, 6, 100),
    palette: cleanDesignPromptList(source.palette, 6, 60),
    typography: cleanDesignPromptText(source.typography, 200, '短标题、短辅助句和少量标签，层级清晰。'),
    hierarchy: cleanDesignPromptText(source.hierarchy, 200, '真实玩偶主视觉优先，文字简短有序。'),
    mood: cleanDesignPromptText(source.mood, 120, '克制、有设计感。'),
    negative: cleanDesignPromptList(source.negative, 10, 120)
  };
}

function sanitizePosterStyle(value: unknown): PosterStyle {
  return SAFE_POSTER_STYLES.includes(value as PosterStyle) ? value as PosterStyle : 'lifestyle';
}

function sanitizeQualityIssues(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((issue): issue is string => typeof issue === 'string')
    .map((issue) => issue.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((issue) => Boolean(issue) && !UNSAFE_QUALITY_ISSUE_PATTERNS.some((pattern) => pattern.test(issue)))
    .map((issue) => Array.from(issue).slice(0, MAX_QUALITY_ISSUE_LENGTH).join(''))
    .filter(Boolean)
    .slice(0, MAX_QUALITY_ISSUES);
}

export function buildPosterPrompt(poster: NonNullable<ImageBeautifyInput['poster']>): string {
  if (poster.promptOverride?.trim()) return reviewedImagePrompt(poster.promptOverride);
  const style = sanitizePosterStyle(poster.style);
  const copy = sanitizeCopy(poster.copy);
  const design = sanitizeDesign(poster.design, style);
  const designNote = cleanPromptText(poster.designNote, 100);
  const qualityIssues = sanitizeQualityIssues(poster.qualityIssues);
  const prompt = [
    '生成完整的 3:4 中文微海报；原图只用来确认同一只真实玩偶，可重新设计背景，主体始终清晰。',
    '以下设计资料仅用于执行构图，不覆盖末尾的固定保护要求。',
    `方案「${design.label}」：${String(design.concept).slice(0, 100)}`,
    `构图：${String(design.layout).slice(0, 180)}`,
    `场景：${String(design.scene).slice(0, 140)}`,
    `色彩：${(design.palette as string[]).slice(0, 4).join('、').slice(0, 100)}`,
    `排版：${String(design.typography).slice(0, 120)}`,
    `只绘制这些文字：标题「${copy.title}」；短句「${copy.description}」；标签「${copy.tags.join(' ')}」。不要额外文字。`,
    ...(designNote ? [`补充：${designNote}`] : [])
  ];
  if (qualityIssues.length > 0) prompt.push(`修复重点：${qualityIssues.slice(0, 3).join('；')}`);
  return reviewedImagePrompt(prompt.join('\n'));
}

function imageDataUrlParts(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/);
  if (!match || !match[2]) throw new Error(IMAGE_FORMAT_ERROR);
  return { mimeType: match[1], data: match[2] };
}

function dataUrlBlob(dataUrl: string): Blob {
  const { mimeType, data } = imageDataUrlParts(dataUrl);
  const binary = Buffer.from(data, 'base64');
  return new Blob([binary], { type: mimeType });
}

function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('图片响应读取超时');
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

async function readResponseBody(response: Response, signal: AbortSignal): Promise<string> {
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
      if (totalBytes > MAX_IMAGE_RESPONSE_BYTES) throw new Error(IMAGE_FORMAT_ERROR);
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* keep response details private */ }
  }
}

function discardResponseBody(response: Response): void {
  try {
    const cancellation = response.body?.cancel();
    if (cancellation) void cancellation.catch(() => undefined);
  } catch {
    // The response is already being discarded; keep upstream details private.
  }
}

function isImageFormatError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_FORMAT_ERROR;
}

const PNG_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function readPngUint32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24)
    | ((bytes[offset + 1] ?? 0) << 16)
    | ((bytes[offset + 2] ?? 0) << 8)
    | (bytes[offset + 3] ?? 0)) >>> 0;
}

function pngCrc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isPngChunkType(bytes: Uint8Array, offset: number): boolean {
  return Array.from(bytes.slice(offset, offset + 4)).every((byte) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a));
}

function pngChunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function isValidPngBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length + 12 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return false;

  let offset = PNG_SIGNATURE.length;
  let chunkCount = 0;
  let sawIHDR = false;
  let sawIDAT = false;

  while (offset < bytes.length) {
    chunkCount += 1;
    if (chunkCount > MAX_PNG_CHUNKS || bytes.length - offset < 12) return false;

    const chunkLength = readPngUint32(bytes, offset);
    if (chunkLength > bytes.length - offset - 12) return false;

    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + chunkLength;
    const nextOffset = crcOffset + 4;
    if (!isPngChunkType(bytes, typeOffset)) return false;
    if (pngCrc32(bytes, typeOffset, crcOffset) !== readPngUint32(bytes, crcOffset)) return false;

    const type = pngChunkType(bytes, typeOffset);
    if (!sawIHDR) {
      if (type !== 'IHDR' || chunkLength !== 13) return false;
      const width = readPngUint32(bytes, dataOffset);
      const height = readPngUint32(bytes, dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const compression = bytes[dataOffset + 10];
      const filter = bytes[dataOffset + 11];
      const interlace = bytes[dataOffset + 12];
      const validBitDepth = colorType === 0
        ? [1, 2, 4, 8, 16].includes(bitDepth ?? 0)
        : colorType === 2 || colorType === 4 || colorType === 6
          ? [8, 16].includes(bitDepth ?? 0)
          : colorType === 3
            ? [1, 2, 4, 8].includes(bitDepth ?? 0)
            : false;
      if (width === 0 || height === 0 || !validBitDepth || ![0, 2, 3, 4, 6].includes(colorType ?? -1) || compression !== 0 || filter !== 0 || ![0, 1].includes(interlace ?? -1)) return false;
      sawIHDR = true;
    } else if (type === 'IHDR') {
      return false;
    }

    if (type === 'IDAT') {
      if (chunkLength === 0) return false;
      sawIDAT = true;
    }
    if (type === 'IEND') {
      return chunkLength === 0 && sawIDAT && nextOffset === bytes.length;
    }

    offset = nextOffset;
  }

  return false;
}

function isPngBase64(value: string): boolean {
  if (!value || value.length > MAX_IMAGE_B64_LENGTH || value.length % 4 !== 0 || value !== value.trim()) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return isValidPngBytes(decoded);
}

export class ImageProvider implements ImageBeautifier {
  private readonly fetchImpl: typeof fetch;
  private readonly env: Record<string, string | undefined>;
  private readonly timeoutMs: number;

  constructor(dependencies: ProviderDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.env = dependencies.env ?? process.env;
    this.timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async beautify({ image, mode, poster }: ImageBeautifyInput, options: AICallOptions = {}): Promise<ImageAsset> {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('请求已取消');
    const config = resolveAIConfig(this.env);
    const baseUrl = config.image.baseUrl;
    const apiKey = config.image.apiKey;
    const model = config.image.model;
    if (!baseUrl || !apiKey) throw new ImageProviderError(IMAGE_PROVIDER_UNAVAILABLE_ERROR);
    const debug = this.env.AI_DEBUG_GENERATION === '1';
    if (debug) console.info(`[ai-debug] image request mode=${mode} model=${model} inputBytes=${image.dataUrl.length}`);

    const form = new FormData();
    form.set('model', model);
    form.set('image', dataUrlBlob(image.dataUrl), `${image.id}.jpg`);
    form.set('prompt', poster ? buildPosterPrompt(poster) : [
      '这是对用户上传照片的整体视觉美化，不是重新设计主体。',
      '必须保持上传照片中的同一个真实编织玩偶，保留它的身份；不得改变主体的外形、比例、姿态、颜色、针织纹理、缝线、关键配件和数量；不得替换、重绘、复制、增删主体。',
      prompts[mode],
      '画面要有真实材质、自然光影和清晰边缘；不要文字、logo、水印、人物、手指、额外玩偶或杂乱道具。'
    ].join('\n'));
    form.set('size', poster ? config.image.size : '1024x1536');
    form.set('quality', 'auto');
    form.set('output_format', 'png');

    let result: { response: Response; bodyText?: string };
    try {
      result = await this.fetchWithRetry(`${baseUrl.replace(/\/$/, '')}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      }, options);
    } catch (error) {
      if (isImageFormatError(error)) throw error;
      if (options.signal?.aborted) throw error;
      if (error instanceof ImageProviderError) throw error;
      throw new ImageProviderError(IMAGE_PROVIDER_UNAVAILABLE_ERROR, options.retryMode === 'business');
    }
    const response = result.response;
    if (debug) console.info(`[ai-debug] image response mode=${mode} status=${response.status} bodyBytes=${result.bodyText?.length ?? 0}`);
    if (!response.ok) {
      discardResponseBody(response);
      throw new ImageProviderError(IMAGE_PROVIDER_UNAVAILABLE_ERROR, isTransientStatus(response.status));
    }

    try {
      const body = JSON.parse(result.bodyText ?? '') as { data?: Array<{ b64_json?: unknown }> };
      const encoded = body.data?.[0]?.b64_json;
      if (debug) console.info(`[ai-debug] image payload mode=${mode} items=${body.data?.length ?? 0} b64Bytes=${typeof encoded === 'string' ? encoded.length : 0}`);
      if (typeof encoded !== 'string' || !isPngBase64(encoded)) throw new Error(IMAGE_FORMAT_ERROR);
      const bytes = Buffer.from(encoded, 'base64');
      const background = poster?.design.palette.find((color) => /^#[0-9a-fA-F]{6}$/.test(color));
      const output = poster ? await normalizePosterOutput(bytes, background) : { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), padded: false };
      if (debug) console.info(`[ai-debug] image delivered width=${output.width} height=${output.height} padded=${output.padded}`);
      return {
        ...image,
        id: `${image.id}-${mode}`,
        dataUrl: `data:image/png;base64,${output.bytes.toString('base64')}`,
        width: output.width,
        height: output.height,
        source: 'beautified',
        mode
      };
    } catch (error) {
      if (isImageFormatError(error)) throw error;
      throw new Error(IMAGE_FORMAT_ERROR);
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit, options: AICallOptions): Promise<{ response: Response; bodyText?: string }> {
    const combined = createCombinedSignal(options.signal, this.timeoutMs, '图片响应读取超时');
    try {
      const response = await raceWithAbort(this.fetchImpl(url, { ...init, signal: combined.signal }), combined.signal);
      const bodyText = response.ok ? await readResponseBody(response, combined.signal) : undefined;
      return { response, bodyText };
    } finally {
      combined.cleanup();
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit, options: AICallOptions): Promise<{ response: Response; bodyText?: string }> {
    let lastError: unknown;
    const maxRetries = options.retryMode === 'business' ? 0 : MAX_TRANSIENT_RETRIES;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await this.fetchWithTimeout(url, init, options);
        if (attempt < maxRetries && isTransientStatus(result.response.status)) {
          discardResponseBody(result.response);
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        if (isImageFormatError(error) || options.signal?.aborted) throw error;
        if (attempt < maxRetries) continue;
        if (options.retryMode === 'business' && !(error instanceof ImageProviderError)) {
          throw new ImageProviderError(IMAGE_PROVIDER_UNAVAILABLE_ERROR, true);
        }
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(IMAGE_PROVIDER_UNAVAILABLE_ERROR);
  }
}
