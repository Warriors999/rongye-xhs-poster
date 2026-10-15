// @vitest-environment node

import { afterEach, expect, it } from 'vitest';
import { POST } from './route';
import { GET } from './[taskId]/route';

afterEach(() => { delete process.env.AI_PROVIDER; });

it('submits a design once and returns the finished plan through polling', async () => {
  process.env.AI_PROVIDER = 'mock';
  const form = new FormData();
  form.set('requestId', 'test-design-route-123');
  form.set('imageDataUrl', 'data:image/png;base64,AAAA');
  form.set('width', '600');
  form.set('height', '800');
  form.set('keywords', '针织玩偶');
  const request = () => new Request('http://localhost/api/design', { method: 'POST', body: form });

  const response = await POST(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ taskId: 'test-design-route-123', status: 'running' });
  expect((await POST(request())).status).toBe(202);

  let body: Record<string, unknown> = {};
  await expect.poll(async () => {
    const polled = await GET(new Request('http://localhost/api/design/test-design-route-123'), { params: Promise.resolve({ taskId: 'test-design-route-123' }) });
    body = await polled.json();
    return body.status;
  }).toBe('succeeded');
  expect((body.result as { posters: Array<{ finalPrompt?: string }> }).posters).toHaveLength(3);
});
