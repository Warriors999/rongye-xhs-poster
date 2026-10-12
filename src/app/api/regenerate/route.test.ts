// @vitest-environment node
import { beforeEach, expect, it } from 'vitest';
import { POST } from './route';
import { getAsyncRuntime, resetAsyncRuntimeForTests } from '@/server/async/runtime';
import { GET } from '@/app/api/tasks/[taskId]/route';

beforeEach(() => { resetAsyncRuntimeForTests(); process.env.AI_PROVIDER = 'mock'; delete process.env.REDIS_URL; });
function request(fields: Record<string, string>) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return new Request('http://localhost/api/regenerate', { method: 'POST', body: form });
}
const fields = { originalImageDataUrl: 'data:image/png;base64,AAAA', width: '600', height: '800', targetStyle: 'story', revisionPrompt: '背景改成深蓝', selectedPosterCopy: JSON.stringify({ title: '针织日常', description: '柔软的陪伴。', tags: ['#手作'] }) };
it('creates a single-slot task from fresh saved input without requiring an old task', async () => {
  const response = await POST(request(fields));
  expect(response.status).toBe(202);
  const { taskId } = await response.json();
  expect(await getAsyncRuntime().storage.exists(`tasks/${taskId}/original`)).toBe(true);
  let task = await getAsyncRuntime().store.get(taskId);
  for (let tries = 0; tries < 20 && task?.status !== 'succeeded'; tries++) { await new Promise((resolve) => setTimeout(resolve, 10)); task = await getAsyncRuntime().store.get(taskId); }
  expect(task?.result?.posters.map((poster) => poster.style)).toEqual(['story']);
  const status = await GET(new Request(`http://localhost/api/tasks/${taskId}`), { params: Promise.resolve({ taskId }) });
  const body = await status.json();
  expect(body.result.posters[0].finalPrompt).toContain('完整的 3:4');
});
it('requires a chosen target and rejects malformed selected copy', async () => {
  const { targetStyle: _style, ...missing } = fields;
  expect((await POST(request(missing))).status).toBe(400);
  expect((await POST(request({ ...fields, selectedPosterCopy: '{bad JSON' }))).status).toBe(400);
});
