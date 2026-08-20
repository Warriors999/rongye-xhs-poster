// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createEmptyDraft, defaultResearchSummary, type GenerationResult, type ImageAsset } from '@/domain/project';
import { InMemoryImageGenerationQueue } from './image-generation-queue';
import { InMemoryTaskStore } from './task-store';
import { processTask, runOnce } from './image-generation-worker';
import { InMemoryObjectStorage } from '@/server/storage/r2';
import type { GenerationJob, GenerationQueue, QueueMessage, TaskClaim, TaskRecord, TaskStore, TaskUpdate } from './task-types';

const original: ImageAsset = {
  id: 'upload',
  dataUrl: 'data:image/png;base64,AAAA',
  width: 600,
  height: 800,
  source: 'upload'
};

function generatedResult(): GenerationResult {
  return {
    analysis: { subject: '针织玩偶', colors: ['奶油白'], material: '棉线', details: ['圆耳朵'] },
    research: { ...defaultResearchSummary },
    posters: [{ ...createEmptyDraft(), style: 'lifestyle', image: { ...original, id: 'generated', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' } }],
    warnings: ['story 方向已跳过']
  };
}

function job(taskId: string): GenerationJob {
  return { taskId, originalKey: `tasks/${taskId}/original`, keywords: '春日', forbiddenWords: '', creativeIdea: '', config: { mode: 'mock' } };
}

class RecordingQueue implements GenerationQueue {
  readonly acknowledgements: QueueMessage[] = [];

  constructor(readonly inner = new InMemoryImageGenerationQueue()) {}

  enqueue(value: GenerationJob): Promise<void> {
    return this.inner.enqueue(value);
  }

  dequeue(options?: { waitMs?: number }): Promise<QueueMessage | null> {
    return this.inner.dequeue(options);
  }

  ack(message: QueueMessage): Promise<void> {
    this.acknowledgements.push(message);
    return this.inner.ack(message);
  }

  reclaimExpired(): Promise<number> {
    return this.inner.reclaimExpired();
  }
}

class FailingUpdateStore implements TaskStore {
  constructor(private readonly inner: TaskStore) {}

  create(input: Parameters<TaskStore['create']>[0]): ReturnType<TaskStore['create']> {
    return this.inner.create(input);
  }

  get(taskId: string): Promise<TaskRecord | null> {
    return this.inner.get(taskId);
  }

  claim(taskId: string): Promise<TaskClaim> {
    return this.inner.claim(taskId);
  }

  async update(_taskId: string, _patch: TaskUpdate): Promise<TaskRecord | null> {
    throw new Error('task persistence unavailable');
  }

  deleteExpired(): Promise<number> {
    return this.inner.deleteExpired();
  }

  requeueStale(taskId: string): Promise<TaskRecord | null> {
    return this.inner.requeueStale(taskId);
  }
}

class FailingRequeueQueue extends RecordingQueue {
  failEnqueue = false;

  override async enqueue(value: GenerationJob): Promise<void> {
    if (this.failEnqueue) throw new Error('queue unavailable');
    await super.enqueue(value);
  }
}

describe('image generation worker', () => {
  it('processes a job into private result assets and exposes only metadata in the task', async () => {
    const store = new InMemoryTaskStore();
    const queue = new InMemoryImageGenerationQueue();
    const storage = new InMemoryObjectStorage();
    const created = await store.create({ taskId: 'task-worker-1', originalKey: 'tasks/task-worker-1/original', keywords: '春日', forbiddenWords: '', creativeIdea: '' });
    await storage.put(created.originalKey, new Uint8Array([1, 2, 3]), 'image/png');
    await queue.enqueue(job(created.taskId));

    await runOnce({ store, queue, storage, generate: async () => generatedResult() });

    const task = await store.get(created.taskId);
    expect(task).toMatchObject({ status: 'succeeded', phase: 'completed', progress: 100 });
    expect(task?.result?.posters[0].image).toMatchObject({ assetKey: 'tasks/task-worker-1/assets/lifestyle', contentType: 'image/svg+xml' });
    expect(await storage.exists('tasks/task-worker-1/assets/lifestyle')).toBe(true);
    expect(JSON.stringify(task)).not.toContain('data:image');
  });

  it('does not generate or overwrite a task after it has succeeded', async () => {
    const store = new InMemoryTaskStore();
    const queue = new InMemoryImageGenerationQueue();
    const storage = new InMemoryObjectStorage();
    const created = await store.create({ taskId: 'task-worker-2', originalKey: 'tasks/task-worker-2/original', keywords: '', forbiddenWords: '', creativeIdea: '' });
    await storage.put(created.originalKey, new Uint8Array([1]), 'image/png');
    await store.update(created.taskId, { status: 'succeeded', phase: 'completed', progress: 100, result: generatedResult() as never });
    let calls = 0;
    await processTask(job(created.taskId), { store, queue, storage, generate: async () => { calls += 1; return generatedResult(); } });
    expect(calls).toBe(0);
    expect((await store.get(created.taskId))?.status).toBe('succeeded');
  });

  it('requeues one transient failure and marks the task failed at the attempt limit', async () => {
    const store = new InMemoryTaskStore();
    const queue = new InMemoryImageGenerationQueue();
    const storage = new InMemoryObjectStorage();
    const created = await store.create({ taskId: 'task-worker-3', originalKey: 'tasks/task-worker-3/original', keywords: '', forbiddenWords: '', creativeIdea: '' });
    await storage.put(created.originalKey, new Uint8Array([1]), 'image/png');
    let calls = 0;
    const generate = async () => { calls += 1; throw new Error('upstream secret api-key'); };

    await queue.enqueue(job(created.taskId));
    await runOnce({ store, queue, storage, generate });
    expect((await store.get(created.taskId))?.status).toBe('queued');
    await runOnce({ store, queue, storage, generate });

    expect(calls).toBe(2);
    expect(await store.get(created.taskId)).toMatchObject({ status: 'failed', phase: 'failed', progress: 100, error: '生成服务暂时不可用，请重试' });
    expect(await queue.dequeue()).toBeNull();
  });

  it('does not acknowledge a message when task state persistence fails', async () => {
    const underlying = new InMemoryTaskStore();
    const created = await underlying.create({ taskId: 'task-worker-persistence', originalKey: 'tasks/task-worker-persistence/original', keywords: '', forbiddenWords: '', creativeIdea: '' });
    const queue = new RecordingQueue();
    const storage = new InMemoryObjectStorage();
    await storage.put(created.originalKey, new Uint8Array([1]), 'image/png');
    await queue.enqueue(job(created.taskId));

    await runOnce({ store: new FailingUpdateStore(underlying), queue, storage, generate: async () => generatedResult() });

    expect(queue.acknowledgements).toHaveLength(0);
  });

  it('does not acknowledge a message when safe requeue fails', async () => {
    const store = new InMemoryTaskStore();
    const queue = new FailingRequeueQueue();
    const storage = new InMemoryObjectStorage();
    const created = await store.create({ taskId: 'task-worker-requeue', originalKey: 'tasks/task-worker-requeue/original', keywords: '', forbiddenWords: '', creativeIdea: '' });
    await storage.put(created.originalKey, new Uint8Array([1]), 'image/png');
    await queue.enqueue(job(created.taskId));
    queue.failEnqueue = true;

    await runOnce({ store, queue, storage, generate: async () => { throw new Error('temporary failure'); } });

    expect(queue.acknowledgements).toHaveLength(0);
    expect((await store.get(created.taskId))?.status).toBe('queued');
  });

  it('reclaims a stale running task and generates it successfully on the next run', async () => {
    let now = 1_000;
    const store = new InMemoryTaskStore({ now: () => now });
    const queue = new InMemoryImageGenerationQueue({ visibilityTimeoutMs: 100, now: () => now });
    const storage = new InMemoryObjectStorage();
    const created = await store.create({ taskId: 'task-worker-recovered', originalKey: 'tasks/task-worker-recovered/original', keywords: '', forbiddenWords: '', creativeIdea: '' });
    await storage.put(created.originalKey, new Uint8Array([1]), 'image/png');
    await queue.enqueue(job(created.taskId));

    const abandonedMessage = await queue.dequeue();
    expect(abandonedMessage).not.toBeNull();
    expect((await store.claim(created.taskId)).task?.status).toBe('running');
    now = 1_101;
    let calls = 0;

    await runOnce({ store, queue, storage, generate: async () => { calls += 1; return generatedResult(); } });

    expect(calls).toBe(1);
    expect(await store.get(created.taskId)).toMatchObject({ status: 'succeeded', phase: 'completed' });
    expect(await queue.dequeue()).toBeNull();
  });
});
