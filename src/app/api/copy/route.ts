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
  const posterImageDataUrl = values.get('posterImageDataUrl');
  if (
    (typeof originalImageDataUrl === 'string' && originalImageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) ||
    (typeof posterImageDataUrl === 'string' && posterImageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH)
  ) {
    return errorResponse(413, '图片文件过大，请压缩后重试');
  }

  let selectedPosterCopy: unknown;
  try {
    selectedPosterCopy = JSON.parse(String(values.get('selectedPosterCopy') ?? ''));
  } catch {
    return errorResponse(400, '请求参数无效，请检查图片和提示词');
  }

  const parsed = copyGenerationRequestSchema.safeParse({
    originalImageDataUrl,
    originalWidth: Number(values.get('originalWidth')),
    originalHeight: Number(values.get('originalHeight')),
    posterImageDataUrl,
    posterWidth: Number(values.get('posterWidth')),
    posterHeight: Number(values.get('posterHeight')),
    selectedStyle: values.get('selectedStyle'),
    selectedPosterCopy,
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
      posterImage: {
        id: 'selected-poster',
        dataUrl: parsed.data.posterImageDataUrl,
        width: parsed.data.posterWidth,
        height: parsed.data.posterHeight,
        source: 'upload'
      },
      selectedStyle: parsed.data.selectedStyle,
      selectedPosterCopy: parsed.data.selectedPosterCopy,
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
