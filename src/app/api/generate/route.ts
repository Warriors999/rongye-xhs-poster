import { generationRequestSchema } from '@/server/ai/contracts';
import { isAbortError, raceWithAbort } from '@/server/ai/call-options';
import { submitGenerationTask } from '@/server/async/task-submission';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 10_000_000;

class BodyTooLargeError extends Error {}
class InvalidContentLengthError extends Error {}

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function contentLengthFromHeader(header: string | null): number | null {
  if (header === null) return null;
  const value = header.trim();
  if (!/^\d+$/.test(value)) throw new InvalidContentLengthError();
  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength)) throw new InvalidContentLengthError();
  if (contentLength > MAX_BODY_BYTES) throw new BodyTooLargeError();
  return contentLength;
}

async function readBodyWithinLimit(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), request.signal);
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > MAX_BODY_BYTES) throw new BodyTooLargeError();
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function rebuildRequest(request: Request, body: Uint8Array): Request {
  return new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: body.byteLength > 0 ? new Blob([body.buffer as ArrayBuffer]) : undefined,
    signal: request.signal
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    contentLengthFromHeader(request.headers.get('content-length'));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return errorResponse(413, '请求体过大，请压缩后重试');
    return errorResponse(400, '请求格式无效');
  }

  let values: FormData | URLSearchParams;
  try {
    const body = await readBodyWithinLimit(request);
    const boundedRequest = rebuildRequest(request, body);
    if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      values = new URLSearchParams(new TextDecoder().decode(body));
    } else {
      values = await boundedRequest.formData();
    }
  } catch (error) {
    if (error instanceof BodyTooLargeError) return errorResponse(413, '请求体过大，请压缩后重试');
    if (isAbortError(error)) return errorResponse(504, '生成服务超时，请重试');
    return errorResponse(400, '请求格式无效');
  }

  const isRegeneration = new URL(request.url).pathname === '/api/regenerate';
  const imageDataUrl = values.get('imageDataUrl') ?? values.get('originalImageDataUrl');
  const referenceImageDataUrl = values.get('referenceImageDataUrl') ?? undefined;
  if ([imageDataUrl, referenceImageDataUrl].some((value) => typeof value === 'string' && value.length > MAX_IMAGE_DATA_URL_LENGTH)) {
    return errorResponse(413, '图片文件过大，请压缩后重试');
  }
  const widthValue = values.get('width');
  const heightValue = values.get('height');
  let selectedPosterDesign: unknown;
  let selectedPosterCopy: unknown;
  try {
    const designValue = values.get('selectedPosterDesign');
    const copyValue = values.get('selectedPosterCopy');
    if (designValue !== null) selectedPosterDesign = typeof designValue === 'string' ? JSON.parse(designValue) : designValue;
    if (copyValue !== null) selectedPosterCopy = typeof copyValue === 'string' ? JSON.parse(copyValue) : copyValue;
  } catch { return errorResponse(400, '请求参数无效，请检查所选方案'); }
  if (isRegeneration && !values.get('targetStyle')) return errorResponse(400, '请选择需要重做的海报');
  const parsed = generationRequestSchema.safeParse({
    imageDataUrl,
    width: typeof widthValue === 'string' ? Number(widthValue) : Number.NaN,
    height: typeof heightValue === 'string' ? Number(heightValue) : Number.NaN,
    keywords: values.get('keywords') ?? '',
    forbiddenWords: values.get('forbiddenWords') ?? '',
    creativeIdea: values.get('creativeIdea') ?? '',
    referenceImageDataUrl,
    referenceWidth: values.get('referenceWidth') === null ? undefined : Number(values.get('referenceWidth')),
    referenceHeight: values.get('referenceHeight') === null ? undefined : Number(values.get('referenceHeight')),
    targetStyle: values.get('targetStyle') ?? undefined,
    revisionPrompt: values.get('revisionPrompt') ?? undefined,
    selectedPosterDesign,
    selectedPosterCopy
  });
  if (!parsed.success) return errorResponse(400, '请求参数无效，请检查图片、关键词和禁止词');

  try {
    const task = await submitGenerationTask({
      image: { id: 'upload', dataUrl: parsed.data.imageDataUrl, width: parsed.data.width, height: parsed.data.height, source: 'upload' },
      keywords: parsed.data.keywords,
      forbiddenWords: parsed.data.forbiddenWords,
      creativeIdea: parsed.data.creativeIdea,
      ...(parsed.data.referenceImageDataUrl ? { referenceImage: { id: 'reference', dataUrl: parsed.data.referenceImageDataUrl, width: parsed.data.referenceWidth!, height: parsed.data.referenceHeight!, source: 'upload' as const } } : {}),
      ...(parsed.data.targetStyle ? { targetStyle: parsed.data.targetStyle } : {}),
      ...(parsed.data.revisionPrompt ? { revisionPrompt: parsed.data.revisionPrompt } : {}),
      ...(parsed.data.selectedPosterDesign ? { selectedPosterDesign: parsed.data.selectedPosterDesign } : {}),
      ...(parsed.data.selectedPosterCopy ? { selectedPosterCopy: parsed.data.selectedPosterCopy } : {})
    });
    return Response.json(task, { status: 202 });
  } catch (error) {
    if (isAbortError(error)) return errorResponse(504, '生成服务超时，请重试');
    if (error instanceof Error && error.message === '图片格式无效') return errorResponse(400, '请求参数无效，请检查图片、关键词和禁止词');
    return errorResponse(502, '生成服务暂时不可用，请重试');
  }
}
