import type { GenerateResponse } from '@/server/ai/contracts';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type GenerationJobStatus = 'processing' | 'complete' | 'failed';

export type GenerationJob = {
  id: string;
  status: GenerationJobStatus;
  result?: GenerateResponse;
  error?: string;
  createdAt: number;
};

const JOB_TTL_MS = 30 * 60 * 1000;
const JOB_DIRECTORY = path.join(os.tmpdir(), 'rongye-xhs-poster-jobs');

function jobPath(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('invalid job id');
  return path.join(JOB_DIRECTORY, `${id}.json`);
}

async function pruneJobs(now = Date.now()) {
  await mkdir(JOB_DIRECTORY, { recursive: true });
  for (const name of await readdir(JOB_DIRECTORY)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(JOB_DIRECTORY, name);
    try {
      const job = JSON.parse(await readFile(file, 'utf8')) as GenerationJob;
      if (now - job.createdAt > JOB_TTL_MS) await unlink(file);
    } catch {
      // Ignore a file being written or removed by another request.
    }
  }
}

export async function createGenerationJob(): Promise<GenerationJob> {
  await pruneJobs();
  const job: GenerationJob = {
    id: crypto.randomUUID(),
    status: 'processing',
    createdAt: Date.now()
  };
  await writeFile(jobPath(job.id), JSON.stringify(job), 'utf8');
  return job;
}

export async function getGenerationJob(id: string): Promise<GenerationJob | undefined> {
  await pruneJobs();
  try {
    return JSON.parse(await readFile(jobPath(id), 'utf8')) as GenerationJob;
  } catch {
    return undefined;
  }
}

export async function completeGenerationJob(id: string, result: GenerateResponse) {
  const job = await getGenerationJob(id);
  if (!job) return;
  job.status = 'complete';
  job.result = result;
  job.error = undefined;
  await writeFile(jobPath(id), JSON.stringify(job), 'utf8');
}

export async function failGenerationJob(id: string, error: string) {
  const job = await getGenerationJob(id);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.result = undefined;
  await writeFile(jobPath(id), JSON.stringify(job), 'utf8');
}
