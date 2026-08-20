// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyDraft, defaultResearchSummary } from '@/domain/project';
import { getAsyncRuntime, resetAsyncRuntimeForTests } from '@/server/async/runtime';
import { taskStatusResponseSchema } from '@/server/async/task-response';
import { GET } from './route';

describe('GET /api/tasks/[taskId]', () => {
  beforeEach(() => {
    resetAsyncRuntimeForTests();
    delete process.env.REDIS_URL;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
  });

  it('returns safe status metadata and task-scoped image bytes without secrets', async () => {
    const runtime = getAsyncRuntime({});
    const task = await runtime.store.create({ taskId: 'task-route-1', originalKey: 'tasks/task-route-1/original', keywords: '春日', forbiddenWords: '', creativeIdea: '' });
    const draft = createEmptyDraft();
    draft.design = { ...draft.design!, scene: '晨光穿过窗帘，在桌面上留下细腻的阴影与温柔层次，主体保留真实针织纹理，周围只安排少量与故事相关的道具，形成具有呼吸感的微海报场景。'.repeat(4) };
    await runtime.storage.put('tasks/task-route-1/assets/lifestyle', new Uint8Array([137, 80, 78, 71]), 'image/png');
    await runtime.store.update(task.taskId, {
      status: 'succeeded', phase: 'completed', progress: 100,
      result: {
        analysis: { subject: '针织玩偶', colors: ['白'], material: '棉线', details: ['耳朵'] },
        research: { ...defaultResearchSummary },
        posters: [{ ...draft, style: 'lifestyle', image: { id: 'poster', assetKey: 'tasks/task-route-1/assets/lifestyle', contentType: 'image/png', width: 1024, height: 1536, source: 'beautified' } }]
      }
    });

    const statusResponse = await GET(new Request('http://localhost/api/tasks/task-route-1'), { params: Promise.resolve({ taskId: task.taskId }) });
    expect(statusResponse.status).toBe(200);
    const body = await statusResponse.json();
    expect(body).toMatchObject({ status: 'succeeded', phase: 'completed', progress: 100, result: { posters: [{ image: { assetUrl: '/api/tasks/task-route-1?asset=lifestyle' } }] } });
    expect(taskStatusResponseSchema.safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('api-key');
    expect(JSON.stringify(body)).not.toContain('provider');

    const assetResponse = await GET(new Request('http://localhost/api/tasks/task-route-1?asset=lifestyle'), { params: Promise.resolve({ taskId: task.taskId }) });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await assetResponse.arrayBuffer())]).toEqual([137, 80, 78, 71]);
  });

  it('rejects missing, expired, and unrelated asset requests', async () => {
    const missing = await GET(new Request('http://localhost/api/tasks/missing-task'), { params: Promise.resolve({ taskId: 'missing-task' }) });
    expect(missing.status).toBe(404);
    const runtime = getAsyncRuntime({});
    await runtime.store.create({ taskId: 'task-route-2', originalKey: 'tasks/task-route-2/original', keywords: '', forbiddenWords: '', creativeIdea: '' });
    const unrelated = await GET(new Request('http://localhost/api/tasks/task-route-2?asset=../secret'), { params: Promise.resolve({ taskId: 'task-route-2' }) });
    expect(unrelated.status).toBe(404);
  });
});
