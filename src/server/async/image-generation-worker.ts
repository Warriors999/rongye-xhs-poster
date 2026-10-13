import { generatePosters, type GeneratePostersInput } from '@/server/generation/generate-posters';
import type { GenerationResult, PosterStyle } from '@/domain/project';
import { assetKeyFor, cloneTaskValue, safeTaskError, type GenerationJob, type GenerationQueue, type StoredImageAssetMetadata, type TaskResult, type TaskStore } from './task-types';
import { decodeImageDataUrl, encodeImageDataUrl } from './image-data';
import type { ObjectStorage } from '@/server/storage/r2';

const DEFAULT_TASK_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 2;
const directionNames: Record<string, string> = { lifestyle: '动态方案 A', story: '动态方案 B', editorial: '动态方案 C', cute: '动态方案 A', daily: '动态方案 B', series: '动态方案 C' };

export interface WorkerRuntime {
  store: TaskStore;
  queue: GenerationQueue;
  storage: ObjectStorage;
  env?: Record<string, string | undefined>;
  generate?: typeof generatePosters;
  timeoutMs?: number;
  maxAttempts?: number;
}

export type ProcessTaskOutcome =
  | { ack: true; reason: 'terminal' | 'requeued' | 'already-terminal' }
  | { ack: false; reason: 'persistence-failed' | 'requeue-failed' | 'still-running' };

function imageMetadata(style: PosterStyle, image: GenerationResult['posters'][number]['image'], assetKey: string, contentType: string): StoredImageAssetMetadata {
  return { id: image.id, assetKey, contentType, width: image.width, height: image.height, source: image.source, ...(image.mode ? { mode: image.mode } : {}) };
}

function warningForInvalidAsset(style: PosterStyle): string {
  return `${directionNames[style] ?? '该'}方向的图片格式异常，已跳过。`;
}

function warningForStorageFailure(style: PosterStyle): string {
  return `${directionNames[style] ?? '该'} 的图片暂存失败，已跳过。`;
}

type DeliveryStage = 'input-read' | 'generate' | 'phase-update' | 'asset-decode' | 'asset-write' | 'result-update';

function logTaskFailure(taskId: string, stage: DeliveryStage, error: unknown): void {
  const code = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    ? 'timeout-or-abort'
    : error instanceof Error && error.message === 'no valid generated image'
      ? 'no-valid-image'
      : stage === 'asset-write'
        ? 'storage-error'
        : stage === 'phase-update' || stage === 'result-update'
          ? 'persistence-error'
          : stage === 'asset-decode'
            ? 'invalid-image'
            : stage === 'input-read'
              ? 'missing-input'
              : 'generation-error';
  console.error(`[generation-task] task=${taskId.slice(0, 8)} stage=${stage} code=${code}`);
}

function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error('生成服务超时，请重试'));
      reject(new Error('生成服务超时，请重试'));
    }, timeoutMs);
  });
  return Promise.race([operation(controller.signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function retryOrFail(job: GenerationJob, runtime: WorkerRuntime): Promise<ProcessTaskOutcome> {
  let current;
  try {
    current = await runtime.store.get(job.taskId);
  } catch {
    return { ack: false, reason: 'persistence-failed' };
  }
  if (!current) return { ack: false, reason: 'persistence-failed' };
  const maxAttempts = runtime.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (current.attempts < maxAttempts) {
    try {
      const queued = await runtime.store.update(job.taskId, { status: 'queued', phase: 'queued', progress: 0 });
      if (!queued || queued.status !== 'queued') return { ack: false, reason: 'persistence-failed' };
      await runtime.queue.enqueue(job);
      return { ack: true, reason: 'requeued' };
    } catch {
      return { ack: false, reason: 'requeue-failed' };
    }
  }
  try {
    const failed = await runtime.store.update(job.taskId, { status: 'failed', phase: 'failed', progress: 100, error: safeTaskError(new Error('generation failed')) });
    return failed?.status === 'failed' ? { ack: true, reason: 'terminal' } : { ack: false, reason: 'persistence-failed' };
  } catch {
    return { ack: false, reason: 'persistence-failed' };
  }
}

export async function processTask(job: GenerationJob, runtime: WorkerRuntime, options: { recovered?: boolean } = {}): Promise<ProcessTaskOutcome> {
  if (options.recovered) {
    try {
      const reset = await runtime.store.requeueStale(job.taskId);
      if (!reset) return { ack: false, reason: 'persistence-failed' };
      if (reset.status === 'succeeded' || reset.status === 'failed') return { ack: true, reason: 'already-terminal' };
    } catch {
      return { ack: false, reason: 'persistence-failed' };
    }
  }
  let claimed;
  let stage: DeliveryStage = 'input-read';
  try {
    claimed = await runtime.store.claim(job.taskId);
  } catch {
    return { ack: false, reason: 'persistence-failed' };
  }
  if (!claimed.claimed || !claimed.task) {
    try {
      const current = await runtime.store.get(job.taskId);
      if (current?.status === 'succeeded' || current?.status === 'failed') return { ack: true, reason: 'already-terminal' };
    } catch {
      // Leave the processing message for visibility-timeout recovery.
    }
    return { ack: false, reason: 'still-running' };
  }
  try {
    const original = await runtime.storage.get(job.originalKey);
    if (!original) throw new Error('original image missing');
    const sourceDataUrl = encodeImageDataUrl(original.data, original.contentType);
    const reference = job.referenceKey ? await runtime.storage.get(job.referenceKey) : undefined;
    if (job.referenceKey && !reference) throw new Error('reference image missing');
    const input: GeneratePostersInput = {
      image: { id: 'upload', dataUrl: sourceDataUrl, width: claimed.task.originalWidth ?? 3, height: claimed.task.originalHeight ?? 4, source: 'upload' },
      keywords: job.keywords,
      forbiddenWords: job.forbiddenWords,
      creativeIdea: job.creativeIdea,
      ...(job.approvedPlan ? { approvedPlan: job.approvedPlan } : {}),
      ...(reference ? { referenceImage: { id: 'reference', dataUrl: encodeImageDataUrl(reference.data, reference.contentType), width: job.referenceWidth ?? 3, height: job.referenceHeight ?? 4, source: 'upload' as const } } : {}),
      ...(job.targetStyle ? { targetStyle: job.targetStyle } : {}),
      ...(job.revisionPrompt ? { revisionPrompt: job.revisionPrompt } : {}),
      ...(job.selectedPosterDesign ? { selectedPosterDesign: job.selectedPosterDesign } : {}),
      ...(job.selectedPosterCopy ? { selectedPosterCopy: job.selectedPosterCopy } : {})
    };
    const env = { ...(runtime.env ?? process.env), ...(job.config.mode === 'mock' ? { AI_PROVIDER: 'mock' } : {}) };
    const generator = runtime.generate ?? generatePosters;
    stage = 'generate';
    const result = await withTimeout(
      (signal) => generator(input, { signal, timeoutMs: DEFAULT_TASK_TIMEOUT_MS, dependencies: { env }, onPhase: async (phase) => {
        const progress = { researching: 20, designing: 40, generating: 65, checking: 90 }[phase];
        stage = 'phase-update';
        await runtime.store.update(job.taskId, { phase, progress });
        stage = 'generate';
      } }),
      runtime.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS
    );
    stage = 'phase-update';
    await runtime.store.update(job.taskId, { phase: 'checking', progress: 90 });
    const posters: TaskResult['posters'] = [];
    const warnings = [...(result.warnings ?? [])];
    let storageFailures = 0;
    for (const poster of result.posters) {
      try {
        stage = 'asset-decode';
        const decoded = decodeImageDataUrl(poster.image.dataUrl);
        const key = assetKeyFor(job.taskId, poster.style);
        stage = 'asset-write';
        await runtime.storage.put(key, decoded.bytes, decoded.contentType);
        posters.push({ ...cloneTaskValue(poster), image: imageMetadata(poster.style, poster.image, key, decoded.contentType) });
      } catch (error) {
        logTaskFailure(job.taskId, stage, error);
        if (stage === 'asset-write') {
          storageFailures += 1;
          warnings.push(warningForStorageFailure(poster.style));
        } else {
          warnings.push(warningForInvalidAsset(poster.style));
        }
      }
    }
    if (posters.length === 0 && storageFailures > 0) {
      stage = 'result-update';
      const failed = await runtime.store.update(job.taskId, { status: 'failed', phase: 'failed', progress: 100, warnings, error: '图片已生成但暂存失败；重新生成会再次调用图片模型' });
      return failed?.status === 'failed' ? { ack: true, reason: 'terminal' } : { ack: false, reason: 'persistence-failed' };
    }
    if (posters.length === 0) throw new Error('no valid generated image');
    stage = 'result-update';
    const succeeded = await runtime.store.update(job.taskId, { status: 'succeeded', phase: 'completed', progress: 100, warnings, result: { analysis: cloneTaskValue(result.analysis), research: cloneTaskValue(result.research), posters, ...(warnings.length ? { warnings } : {}) } });
    if (!succeeded || succeeded.status !== 'succeeded') throw new Error('task result persistence failed');
    return { ack: true, reason: 'terminal' };
  } catch (error) {
    logTaskFailure(job.taskId, stage, error);
    return retryOrFail(job, runtime);
  }
}

export async function runOnce(runtime: WorkerRuntime, options: { waitMs?: number } = {}): Promise<boolean> {
  if (runtime.queue.reclaimExpired) await runtime.queue.reclaimExpired();
  const message = await runtime.queue.dequeue({ waitMs: options.waitMs ?? 0 });
  if (!message) return false;
  let outcome: ProcessTaskOutcome;
  try {
    outcome = await processTask(message.job, runtime, { recovered: message.recovered });
  } catch {
    return true;
  }
  if (outcome.ack) await runtime.queue.ack(message);
  return true;
}

export async function workerMain(runtime: WorkerRuntime, signal?: AbortSignal): Promise<void> {
  while (!signal?.aborted) await runOnce(runtime, { waitMs: 5_000 });
}

let scheduledWorker: Promise<void> | null = null;

export function scheduleInProcessWorker(runtime: WorkerRuntime): void {
  if (scheduledWorker) return;
  scheduledWorker = (async () => {
    while (await runOnce(runtime)) {
      // Drain all work submitted in the same process without keeping the server alive.
    }
  })().finally(() => {
    scheduledWorker = null;
  });
}
