import type { GenerationInput } from '@/domain/project';
import { generatePosters } from '@/server/generation/generate-posters';
import { decodeImageDataUrl } from './image-data';
import { scheduleInProcessWorker, type WorkerRuntime } from './image-generation-worker';
import { getAsyncRuntime, type AsyncRuntime } from './runtime';
import { originalKeyFor, referenceKeyFor, type GenerationQueue, type TaskStore } from './task-types';
import type { ObjectStorage } from '@/server/storage/r2';

export interface TaskSubmissionInput extends GenerationInput {}

export interface TaskSubmissionDependencies {
  store?: TaskStore;
  queue?: GenerationQueue;
  storage?: ObjectStorage;
  env?: Record<string, string | undefined>;
  scheduleWorker?: (runtime: WorkerRuntime) => void;
}

export async function submitGenerationTask(input: TaskSubmissionInput, dependencies: TaskSubmissionDependencies = {}): Promise<{ taskId: string; status: 'queued' }> {
  const env = dependencies.env ?? process.env;
  const runtime: AsyncRuntime = dependencies.store && dependencies.queue && dependencies.storage
    ? { store: dependencies.store, queue: dependencies.queue, storage: dependencies.storage, env }
    : getAsyncRuntime(env);
  const decoded = decodeImageDataUrl(input.image.dataUrl);
  await runtime.store.deleteExpired();
  const reference = input.referenceImage ? decodeImageDataUrl(input.referenceImage.dataUrl) : undefined;
  const task = await runtime.store.create({
    originalKey: undefined,
    originalWidth: input.image.width,
    originalHeight: input.image.height,
    keywords: input.keywords,
    forbiddenWords: input.forbiddenWords,
    creativeIdea: input.creativeIdea ?? ''
  });
  const originalKey = originalKeyFor(task.taskId);
  try {
    if (task.originalKey !== originalKey) await runtime.store.update(task.taskId, { });
    await runtime.storage.put(originalKey, decoded.bytes, decoded.contentType);
    const referenceKey = reference ? referenceKeyFor(task.taskId) : undefined;
    if (reference && referenceKey) await runtime.storage.put(referenceKey, reference.bytes, reference.contentType);
    const job = {
      taskId: task.taskId,
      originalKey,
      keywords: task.keywords,
      forbiddenWords: task.forbiddenWords,
      creativeIdea: task.creativeIdea,
      ...(referenceKey && input.referenceImage ? { referenceKey, referenceWidth: input.referenceImage.width, referenceHeight: input.referenceImage.height } : {}),
      ...(input.targetStyle ? { targetStyle: input.targetStyle } : {}),
      ...(input.revisionPrompt ? { revisionPrompt: input.revisionPrompt } : {}),
      ...(input.selectedPosterDesign ? { selectedPosterDesign: input.selectedPosterDesign } : {}),
      ...(input.selectedPosterCopy ? { selectedPosterCopy: input.selectedPosterCopy } : {}),
      config: { mode: env.AI_PROVIDER?.trim().toLowerCase() && env.AI_PROVIDER.trim().toLowerCase() !== 'mock' ? 'configured' as const : 'mock' as const },
      ...(input.approvedPlan ? { approvedPlan: {...input.approvedPlan,posters:input.approvedPlan.posters.map(poster=>({...poster,image:{...poster.image,dataUrl:'data:image/png;base64,AA=='}}))} } : {})
    };
    await runtime.queue.enqueue(job);
    const workerRuntime: WorkerRuntime = { ...runtime, generate: generatePosters };
    (dependencies.scheduleWorker ?? (env.REDIS_URL?.trim() ? undefined : scheduleInProcessWorker))?.(workerRuntime);
    return { taskId: task.taskId, status: 'queued' };
  } catch (error) {
    await runtime.store.update(task.taskId, { status: 'failed', phase: 'failed', progress: 100, error: String(error) });
    throw new Error('生成服务暂时不可用，请重试');
  }
}
