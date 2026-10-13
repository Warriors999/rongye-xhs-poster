import { z } from 'zod';
import { generationResultSchema, imageAssetSchema, posterDraftSchema } from '@/server/ai/contracts';
import type { GenerationResult, ImageAsset, PosterDraft } from '@/domain/project';

const MAX_TASK_AGE_MS = 30 * 60 * 1000;
const snapshotSchema = z.object({
  upload: imageAssetSchema,
  referenceImage: imageAssetSchema.nullable(),
  creativeIdea: z.string().max(500),
  keywords: z.string().max(500),
  forbiddenWords: z.string().max(300),
  promptPlan: generationResultSchema.nullable(),
  originalPrompts: z.array(z.string().max(1600)).max(3),
  generation: generationResultSchema.nullable(),
  selectedDraft: posterDraftSchema.nullable(),
  regenerationTarget: posterDraftSchema.nullable(),
  revisionPrompt: z.string().max(500)
});

const taskSchema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  savedAt: z.number().int().nonnegative(),
  snapshot: snapshotSchema
});

export interface PendingGenerationSnapshot {
  upload: ImageAsset;
  referenceImage: ImageAsset | null;
  creativeIdea: string;
  keywords: string;
  forbiddenWords: string;
  promptPlan: GenerationResult | null;
  originalPrompts: string[];
  generation: GenerationResult | null;
  selectedDraft: PosterDraft | null;
  regenerationTarget: PosterDraft | null;
  revisionPrompt: string;
}

export interface PendingGenerationTask {
  taskId: string;
  savedAt: number;
  snapshot: PendingGenerationSnapshot;
}

export function createPendingGenerationTask(taskId: string, snapshot: PendingGenerationSnapshot, savedAt = Date.now()): PendingGenerationTask {
  const task = { taskId, savedAt, snapshot };
  taskSchema.parse(task);
  return task;
}

export function isCurrentPendingGenerationTask(value: unknown, now = Date.now()): value is PendingGenerationTask {
  const parsed = taskSchema.safeParse(value);
  return parsed.success && parsed.data.savedAt <= now && now - parsed.data.savedAt < MAX_TASK_AGE_MS;
}

let pending: Promise<unknown> = Promise.resolve();
let delivered: { taskId: string; generation: GenerationResult } | null = null;

function operation(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const run = pending.catch(() => undefined).then(() => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('任务恢复不可用')); return; }
    const open = indexedDB.open('rongye-generation-task', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('task');
    open.onerror = () => reject(new Error('任务恢复不可用'));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('task', mode);
      const request = action(transaction.objectStore('task'));
      transaction.oncomplete = () => { database.close(); resolve(request.result); };
      transaction.onerror = transaction.onabort = () => { database.close(); reject(new Error('任务保存失败')); };
    };
  }));
  pending = run;
  return run;
}

export const pendingGeneration = {
  read: async (): Promise<PendingGenerationTask | undefined> => {
    const value = await operation('readonly', (store) => store.get('current'));
    if (value === undefined) return undefined;
    if (!isCurrentPendingGenerationTask(value)) {
      await operation('readwrite', (store) => store.delete('current'));
      return undefined;
    }
    return value;
  },
  save: (task: PendingGenerationTask): Promise<unknown> => operation('readwrite', (store) => store.put(task, 'current')),
  clear: (): Promise<unknown> => operation('readwrite', (store) => store.delete('current')),
  markDelivered: (taskId: string, generation: GenerationResult): void => { delivered = { taskId, generation }; },
  clearAfterSavedGeneration: async (generation: GenerationResult): Promise<void> => {
    const candidate = delivered;
    if (!candidate || candidate.generation !== generation) return;
    const active = await pendingGeneration.read().catch(() => undefined);
    if (active?.taskId !== candidate.taskId) return;
    await pendingGeneration.clear();
    if (delivered === candidate) delivered = null;
  }
};
