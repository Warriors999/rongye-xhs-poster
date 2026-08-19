import type { GenerateResponse } from '@/server/ai/contracts';
import type { GenerationInput } from '@/server/ai/provider';

export type GenerationJobStatus = 'processing' | 'complete' | 'failed';

export type GenerationJob = {
  id: string;
  status: GenerationJobStatus;
  result?: GenerateResponse;
  error?: string;
  input?: GenerationInput;
  createdAt: number;
};

const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map<string, GenerationJob>();

function pruneJobs(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | undefined {
  const match = dataUrl.match(/^data:([^,]+),([\s\S]*)$/);
  if (!match) return undefined;
  try {
    const metadata = match[1].split(';');
    const mimeType = metadata[0] || 'application/octet-stream';
    const bytes = metadata.includes('base64')
      ? Uint8Array.from(Buffer.from(match[2], 'base64'))
      : new TextEncoder().encode(decodeURIComponent(match[2]));
    return { mimeType, bytes };
  } catch {
    return undefined;
  }
}

export async function createGenerationJob(input: GenerationInput): Promise<GenerationJob> {
  pruneJobs();
  const job: GenerationJob = {
    id: crypto.randomUUID(),
    status: 'processing',
    input,
    createdAt: Date.now()
  };
  jobs.set(job.id, job);
  return job;
}

export async function getGenerationJob(id: string): Promise<GenerationJob | undefined> {
  pruneJobs();
  return jobs.get(id);
}

export async function completeGenerationJob(id: string, result: GenerateResponse) {
  const job = await getGenerationJob(id);
  if (!job) return;
  job.status = 'complete';
  job.result = result;
  job.error = undefined;
  job.input = undefined;
  jobs.set(id, job);
}

export async function failGenerationJob(id: string, error: string) {
  const job = await getGenerationJob(id);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.result = undefined;
  job.input = undefined;
  jobs.set(id, job);
}

export async function getGenerationJobImage(id: string, index: number): Promise<{ mimeType: string; bytes: Uint8Array } | undefined> {
  if (!Number.isInteger(index) || index < 0 || index > 2) return undefined;
  const job = await getGenerationJob(id);
  if (job?.status !== 'complete') return undefined;
  const dataUrl = job.result?.posters[index]?.image.dataUrl;
  return typeof dataUrl === 'string' ? parseImageDataUrl(dataUrl) : undefined;
}
