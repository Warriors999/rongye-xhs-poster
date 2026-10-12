// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { ImageAsset } from '@/domain/project';
import { InMemoryImageGenerationQueue } from './image-generation-queue';
import { InMemoryTaskStore } from './task-store';
import { submitGenerationTask } from './task-submission';
import { InMemoryObjectStorage } from '@/server/storage/r2';

const image: ImageAsset = {
  id: 'upload',
  dataUrl: 'data:image/png;base64,AAAA',
  width: 600,
  height: 800,
  source: 'upload'
};

describe('submitGenerationTask', () => {
  it('stores original bytes and returns a queued task without putting image data in the job', async () => {
    const store = new InMemoryTaskStore();
    const queue = new InMemoryImageGenerationQueue();
    const storage = new InMemoryObjectStorage();
    const scheduleWorker = vi.fn();

    const result = await submitGenerationTask({
      image,
      keywords: '春日',
      forbiddenWords: '价格',
      creativeIdea: '温柔日常'
    }, { store, queue, storage, env: { AI_PROVIDER: 'mock' }, scheduleWorker });

    expect(result).toMatchObject({ status: 'queued' });
    const task = await store.get(result.taskId);
    expect(task).toMatchObject({ taskId: result.taskId, status: 'queued', originalKey: `tasks/${result.taskId}/original` });
    expect(await storage.exists(task!.originalKey)).toBe(true);

    const message = await queue.dequeue();
    expect(message?.job).toMatchObject({ taskId: result.taskId, originalKey: task!.originalKey, config: { mode: 'mock' } });
    expect(JSON.stringify(message?.job)).not.toContain('data:image');
    expect(JSON.stringify(message?.job)).not.toContain('api-key');
    expect(scheduleWorker).toHaveBeenCalledOnce();
  });
});


it('stores the optional style reference outside the queue and retains revision inputs', async () => {
  const store = new InMemoryTaskStore();
  const queue = new InMemoryImageGenerationQueue();
  const storage = new InMemoryObjectStorage();
  const result = await submitGenerationTask({ image, referenceImage: { ...image, id: 'reference', width: 700, height: 900 }, keywords: '', forbiddenWords: '', targetStyle: 'story', revisionPrompt: '背景换成深蓝' }, { store, queue, storage, env: { AI_PROVIDER: 'mock' }, scheduleWorker: () => undefined });
  const job = (await queue.dequeue())!.job;
  expect(job).toMatchObject({ referenceKey: `tasks/${result.taskId}/reference`, referenceWidth: 700, referenceHeight: 900, targetStyle: 'story', revisionPrompt: '背景换成深蓝' });
  expect(await storage.exists(job.referenceKey!)).toBe(true);
  expect(JSON.stringify(job)).not.toContain('data:image');
});
