import { beautifyRequestSchema } from '@/server/ai/contracts';
import { IMAGE_FORMAT_ERROR, IMAGE_PROVIDER_UNAVAILABLE_ERROR } from '@/server/ai/image-provider';
import { getImageProvider } from '@/server/ai/provider';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 10_000_000;

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    return errorResponse(413, '请求体过大，请压缩后重试');
  }

  let values: FormData;
  try {
    values = await request.formData();
  } catch {
    return errorResponse(400, '请求格式无效');
  }

  const imageDataUrl = values.get('imageDataUrl');
  if (typeof imageDataUrl === 'string' && imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return errorResponse(413, '图片文件过大，请压缩后重试');
  }
  const parsed = beautifyRequestSchema.safeParse({
    imageDataUrl,
    width: Number(values.get('width')),
    height: Number(values.get('height')),
    mode: values.get('mode')
  });
  if (!parsed.success) return errorResponse(400, '请求参数无效，请检查图片和美化模式');

  try {
    const image = await getImageProvider().beautify({
      image: { id: 'upload', dataUrl: parsed.data.imageDataUrl, width: parsed.data.width, height: parsed.data.height, source: 'upload' },
      mode: parsed.data.mode
    });
    return Response.json({ image });
  } catch (error) {
    if (error instanceof Error && error.message === IMAGE_FORMAT_ERROR) {
      return errorResponse(502, IMAGE_FORMAT_ERROR);
    }
    return errorResponse(502, IMAGE_PROVIDER_UNAVAILABLE_ERROR);
  }
}
