import { getGenerationJob } from '@/server/generation/job-store';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const jobId = new URL(request.url).searchParams.get('jobId');
  if (!jobId) return Response.json({ error: '任务编号无效' }, { status: 400 });

  const job = getGenerationJob(jobId);
  if (!job) return Response.json({ error: '生成任务已过期，请重新生成' }, { status: 404 });
  if (job.status === 'processing') return Response.json({ status: job.status }, { status: 202 });
  if (job.status === 'failed') return Response.json({ status: job.status, error: job.error }, { status: 502 });
  return Response.json({ status: job.status, ...job.result });
}
