import { generationRequestSchema } from '@/server/ai/contracts';
import { GENERATION_FORMAT_ERROR, PROVIDER_UNAVAILABLE_ERROR } from '@/server/ai/openai-compatible-provider';
import { IMAGE_FORMAT_ERROR, IMAGE_PROVIDER_UNAVAILABLE_ERROR } from '@/server/ai/image-provider';
import { getImageProvider, getProvider } from '@/server/ai/provider';
import { completeGenerationJob, createGenerationJob, failGenerationJob } from '@/server/generation/job-store';
import type { BeautifyMode } from '@/domain/project';
import { resolveDesignBrief } from '@/lib/design-system';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 10_000_000;

class BodyTooLargeError extends Error {}
class InvalidContentLengthError extends Error {}

function errorResponse(status: number, error: string) {
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
      const { done, value } = await reader.read();
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

const visualModes: Record<'cute' | 'daily' | 'series', BeautifyMode> = {
  cute: 'studio',
  daily: 'craft',
  series: 'original'
};

async function beautifyPosters(result: Awaited<ReturnType<ReturnType<typeof getProvider>['generate']>>) {
  const imageProvider = getImageProvider();
  // Keep all three upstream image requests concurrent. The long-running work
  // is performed outside the browser-facing request by processGenerationJob.
  const posters = await Promise.all(result.posters.map(async (poster) => ({
    ...poster,
    image: await imageProvider.beautify({
      image: poster.image,
      mode: visualModes[poster.style],
      poster: {
        style: poster.style,
        copy: poster.copy,
        design: poster.design ?? resolveDesignBrief(poster.style, {})
      }
    })
  })));
  return { ...result, posters };
}

function publicErrorFor(error: unknown): string {
  if (error instanceof Error && [GENERATION_FORMAT_ERROR, IMAGE_FORMAT_ERROR].includes(error.message)) {
    return GENERATION_FORMAT_ERROR;
  }
  if (error instanceof Error && error.message === IMAGE_PROVIDER_UNAVAILABLE_ERROR) {
    return IMAGE_PROVIDER_UNAVAILABLE_ERROR;
  }
  return PROVIDER_UNAVAILABLE_ERROR;
}

async function processGenerationJob(jobId: string, result: Awaited<ReturnType<ReturnType<typeof getProvider>['generate']>>) {
  try {
    completeGenerationJob(jobId, await beautifyPosters(result));
  } catch (error) {
    console.error('[generate] background image generation failed:', publicErrorFor(error));
    failGenerationJob(jobId, publicErrorFor(error));
  }
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
    return errorResponse(400, '请求格式无效');
  }

  const imageDataUrl = values.get('imageDataUrl');
  if (typeof imageDataUrl === 'string' && imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return errorResponse(413, '图片文件过大，请压缩后重试');
  }
  const widthValue = values.get('width');
  const heightValue = values.get('height');
  const parsed = generationRequestSchema.safeParse({
    imageDataUrl,
    width: typeof widthValue === 'string' ? Number(widthValue) : Number.NaN,
    height: typeof heightValue === 'string' ? Number(heightValue) : Number.NaN,
    keywords: values.get('keywords') ?? '',
    forbiddenWords: values.get('forbiddenWords') ?? '',
    creativeIdea: values.get('creativeIdea') ?? ''
  });
  if (!parsed.success) return errorResponse(400, '请求参数无效，请检查图片、关键词和禁止词');

  try {
    const result = await getProvider().generate({
      image: { id: 'upload', dataUrl: parsed.data.imageDataUrl, width: parsed.data.width, height: parsed.data.height, source: 'upload' },
      keywords: parsed.data.keywords,
      forbiddenWords: parsed.data.forbiddenWords,
      creativeIdea: parsed.data.creativeIdea
    });
    // Keep the mock provider synchronous for tests and local previews. Real
    // image generation can take longer than a browser/proxy request window,
    // so return a job immediately after the fast vision/copy step.
    if (process.env.AI_PROVIDER?.trim() !== 'mock') {
      const job = createGenerationJob();
      void processGenerationJob(job.id, result);
      return Response.json({ jobId: job.id, status: job.status }, { status: 202 });
    }
    return Response.json(await beautifyPosters(result));
  } catch (error) {
    return errorResponse(502, publicErrorFor(error));
  }
}
