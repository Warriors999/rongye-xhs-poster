// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createEmptyDraft } from '@/domain/project';
import { InMemoryTaskStore } from './task-store';

const input = {
  originalKey: 'tasks/task-1/original',
  keywords: '春天 手作',
  forbiddenWords: '价格',
  creativeIdea: '温柔的玩偶日常'
};

describe('InMemoryTaskStore', () => {
  it('creates a queued task and transitions it to running and succeeded', async () => {
    const store = new InMemoryTaskStore({ ttlMs: 60_000, now: () => 1_000 });
    const created = await store.create(input);

    expect(created).toMatchObject({
      status: 'queued',
      phase: 'queued',
      progress: 0,
      originalKey: input.originalKey,
      keywords: input.keywords,
      forbiddenWords: input.forbiddenWords,
      creativeIdea: input.creativeIdea,
      createdAt: 1_000,
      expiresAt: 61_000,
      attempts: 0
    });

    const claimed = await store.claim(created.taskId);
    expect(claimed.claimed).toBe(true);
    expect(claimed.task).toMatchObject({ status: 'running', phase: 'recognizing', progress: 5, attempts: 1 });

    const succeeded = await store.update(created.taskId, {
      status: 'succeeded',
      phase: 'completed',
      progress: 100,
      warnings: ['故事叙事方向已使用备用图像。'],
      result: { analysis: { subject: '玩偶', colors: ['白'], material: '棉线', details: ['耳朵'] }, research: { query: 'test', sources: [{ title: 'test' }], composition: 'test', palette: 'test', material: 'test', typography: 'test', density: 'test' }, posters: [{ ...createEmptyDraft(), style: 'lifestyle', image: { assetKey: 'tasks/task-1/assets/lifestyle', contentType: 'image/png', width: 1024, height: 1536 } }] }
    });
    expect(succeeded).toMatchObject({ status: 'succeeded', phase: 'completed', progress: 100 });
  });

  it('does not claim a succeeded task twice and expires old tasks', async () => {
    let now = 1_000;
    const store = new InMemoryTaskStore({ ttlMs: 100, now: () => now });
    const task = await store.create(input);
    expect((await store.claim(task.taskId)).claimed).toBe(true);
    await store.update(task.taskId, { status: 'succeeded', phase: 'completed', progress: 100 });

    expect((await store.claim(task.taskId)).claimed).toBe(false);
    now = 1_101;
    expect(await store.get(task.taskId)).toBeNull();
    expect(await store.deleteExpired()).toBe(0);
  });

  it('sanitizes unsafe error text and never persists arbitrary secret fields', async () => {
    const store = new InMemoryTaskStore({ ttlMs: 60_000, now: () => 1_000 });
    const task = await store.create(input);
    const updated = await store.update(task.taskId, {
      status: 'failed',
      phase: 'failed',
      progress: 100,
      error: 'upstream api-key secret stack trace'
    });

    expect(updated?.error).toBe('生成服务暂时不可用，请重试');
    expect(JSON.stringify(updated)).not.toContain('api-key');
    expect(JSON.stringify(updated)).not.toContain('secret');
    expect(JSON.stringify(updated)).not.toContain('stack');
  });

  it('scrubs data URLs and secret-shaped fields from result metadata before persistence', async () => {
    const store = new InMemoryTaskStore({ ttlMs: 60_000, now: () => 1_000 });
    const task = await store.create(input);
    const updated = await store.update(task.taskId, {
      result: {
        analysis: { subject: '玩偶', colors: ['白'], material: '棉线', details: ['耳朵'] },
        research: { query: 'test', sources: [{ title: 'test' }], composition: 'test', palette: 'test', material: 'test', typography: 'test', density: 'test' },
        posters: [{ ...createEmptyDraft(), image: { ...createEmptyDraft().image, dataUrl: 'data:image/png;base64,secret' }, apiKey: 'secret-api-key' } as never]
      }
    });

    expect(JSON.stringify(updated)).not.toContain('data:image');
    expect(JSON.stringify(updated)).not.toContain('apiKey');
    expect(JSON.stringify(updated)).not.toContain('secret-api-key');
  });
});
