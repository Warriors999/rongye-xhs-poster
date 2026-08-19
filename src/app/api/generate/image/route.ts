import { getGenerationJobImage } from '@/server/generation/job-store';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const jobId = params.get('jobId');
  const index = Number(params.get('index'));
  if (!jobId || !Number.isInteger(index)) {
    return Response.json({ error: '图片任务编号无效' }, { status: 400 });
  }

  const image = await getGenerationJobImage(jobId, index);
  if (!image) return Response.json({ error: '生成图片已过期，请重新生成' }, { status: 404 });

  return new Response(image.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': image.mimeType,
      'Cache-Control': 'private, no-store'
    }
  });
}
