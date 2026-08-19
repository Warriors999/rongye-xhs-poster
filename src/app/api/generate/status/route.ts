import { getGenerationJob } from '@/server/generation/job-store';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const jobId = new URL(request.url).searchParams.get('jobId');
  if (!jobId) return Response.json({ error: '任务编号无效' }, { status: 400 });

  const job = await getGenerationJob(jobId);
  if (!job) return Response.json({ error: '生成任务已过期，请重新生成' }, { status: 404 });
  if (job.status === 'processing') return Response.json({ status: job.status }, { status: 202 });
  if (job.status === 'failed') return Response.json({ status: job.status, error: job.error }, { status: 502 });
  if (!job.result) return Response.json({ error: '生成结果不存在，请重新生成' }, { status: 502 });

  // Keep the status response small. The three generated images are fetched
  // separately as binary responses so Railway/browser connections do not have
  // to carry one multi-megabyte JSON document.
  return Response.json({
    status: job.status,
    analysis: job.result.analysis,
    posters: job.result.posters.map((poster) => ({
      ...poster,
      image: { ...poster.image, dataUrl: '' }
    })),
    imageUrls: job.result.posters.map((_, index) => `/api/generate/image?jobId=${encodeURIComponent(job.id)}&index=${index}`)
  });
}
