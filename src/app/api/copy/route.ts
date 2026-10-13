import { copyGenerationRequestSchema } from '@/server/ai/contracts';
import { isAbortError } from '@/server/ai/call-options';
import { COPY_FORMAT_ERROR, COPY_PROVIDER_UNAVAILABLE_ERROR, getCopyProvider } from '@/server/ai/copy-provider';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 22 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 10_000_000;

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    return errorResponse(413, '图片文件过大，请压缩后重试');
  }

  let values: FormData;
  try {
    values = await request.formData();
  } catch {
    return errorResponse(400, '请求格式无效');
  }

  const originalImageDataUrl = values.get('originalImageDataUrl');
  let posters: unknown;
  try {
    const submittedPosters = values.get('posters');
    posters = typeof submittedPosters === 'string'
      ? JSON.parse(submittedPosters)
      : [{
          imageDataUrl: values.get('posterImageDataUrl'),
          width: Number(values.get('posterWidth')),
          height: Number(values.get('posterHeight')),
          style: values.get('selectedStyle'),
          copy: JSON.parse(String(values.get('selectedPosterCopy') ?? ''))
        }];
  } catch {
    return errorResponse(400, '请求参数无效，请检查图片和提示词');
  }
  if (
    (typeof originalImageDataUrl === 'string' && originalImageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) ||
    (Array.isArray(posters) && posters.some((poster) => typeof poster?.imageDataUrl === 'string' && poster.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH))
  ) {
    return errorResponse(413, '图片文件过大，请压缩后重试');
  }

  const parsed = copyGenerationRequestSchema.safeParse({
    originalImageDataUrl,
    originalWidth: Number(values.get('originalWidth')),
    originalHeight: Number(values.get('originalHeight')),
    posters,
    keywords: values.get('keywords') ?? '',
    creativeIdea: values.get('creativeIdea') ?? '',
    prompt: values.get('prompt') ?? ''
  });
  if (!parsed.success) return errorResponse(400, '请求参数无效，请检查图片和提示词');

  try {
    const result = await getCopyProvider().generate({
      originalImage: {
        id: 'original',
        dataUrl: parsed.data.originalImageDataUrl,
        width: parsed.data.originalWidth,
        height: parsed.data.originalHeight,
        source: 'upload'
      },
      posters: parsed.data.posters.map((poster, index) => ({
        image: { id: `selected-poster-${index}`, dataUrl: poster.imageDataUrl, width: poster.width, height: poster.height, source: 'upload' as const },
        style: poster.style,
        copy: poster.copy
      })),
      keywords: parsed.data.keywords,
      creativeIdea: parsed.data.creativeIdea,
      prompt: parsed.data.prompt
    });
    return Response.json(result);
  } catch (error) {
    if (isAbortError(error)) return errorResponse(504, '文案生成超时，请重试');
    if (error instanceof Error && error.message === COPY_FORMAT_ERROR) return errorResponse(502, COPY_FORMAT_ERROR);
    if (error instanceof Error && error.message === COPY_PROVIDER_UNAVAILABLE_ERROR) return errorResponse(502, COPY_PROVIDER_UNAVAILABLE_ERROR);
    return errorResponse(502, COPY_PROVIDER_UNAVAILABLE_ERROR);
  }
}
