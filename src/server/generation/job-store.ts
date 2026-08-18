import type { GenerateResponse } from '@/server/ai/contracts';

export type GenerationJobStatus = 'processing' | 'complete' | 'failed';

export type GenerationJob = {
  id: string;
  status: GenerationJobStatus;
  result?: GenerateResponse;
  error?: string;
  createdAt: number;
};

const jobs = new Map<string, GenerationJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneJobs(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function createGenerationJob(): GenerationJob {
  pruneJobs();
  const job: GenerationJob = {
    id: crypto.randomUUID(),
    status: 'processing',
    createdAt: Date.now()
  };
  jobs.set(job.id, job);
  return job;
}

export function getGenerationJob(id: string): GenerationJob | undefined {
  pruneJobs();
  return jobs.get(id);
}

export function completeGenerationJob(id: string, result: GenerateResponse) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'complete';
  job.result = result;
  job.error = undefined;
}

export function failGenerationJob(id: string, error: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.result = undefined;
}
