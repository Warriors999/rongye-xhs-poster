// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAsyncRuntime, resetAsyncRuntimeForTests } from '@/server/async/runtime';
import { POST } from '@/app/api/generate/route';

const MAX_IMAGE_DATA_URL_LENGTH = 10_000_000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const uploadFields = { imageDataUrl: 'data:image/png;base64,AAAA', width: '600', height: '800', keywords: '春日 手作', forbiddenWords: '价格', creativeIdea: '温柔日常' };

function request(fields: Record<string, string>, extraHeaders: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request('http://localhost/api/generate', { method: 'POST', headers: extraHeaders, body: form });
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    resetAsyncRuntimeForTests();
    process.env.AI_PROVIDER = 'mock';
    delete process.env.REDIS_URL;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
  });

  afterEach(() => {
    resetAsyncRuntimeForTests();
    delete process.env.AI_PROVIDER;
  });

  it('returns 202 and queues a safe job while storing the original outside the queue', async () => {
    const response = await POST(request(uploadFields));
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({ taskId: expect.any(String), status: 'queued' });

    const runtime = getAsyncRuntime();
    const task = await runtime.store.get(body.taskId);
    expect(task).toMatchObject({ originalKey: `tasks/${body.taskId}/original`, keywords: '春日 手作' });
    expect(await runtime.storage.exists(task!.originalKey)).toBe(true);
  });

  it('keeps the existing request size and parameter validation', async () => {
    expect((await POST(request({ imageDataUrl: 'not-an-image' }))).status).toBe(400);
    expect((await POST(request({ imageDataUrl: `data:image/png;base64,${'A'.repeat(MAX_IMAGE_DATA_URL_LENGTH)}` }))).status).toBe(413);
    expect((await POST(request(uploadFields, { 'content-length': 'NaN' }))).status).toBe(400);
    expect((await POST(request(uploadFields, { 'content-length': String(MAX_BODY_BYTES + 1) }))).status).toBe(413);
  });

  it('rejects a malformed complete-looking image data URL with a safe error', async () => {
    const response = await POST(request({ ...uploadFields, imageDataUrl: 'data:image/png;base64,not-base64!' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '请求参数无效，请检查图片、关键词和禁止词' });
  });

  it('returns 413 when a request without content-length streams over the body limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1));
        controller.close();
      }
    });
    const requestWithStream = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=unused' },
      body,
      duplex: 'half'
    } as RequestInit & { duplex: 'half' });
    expect((await POST(requestWithStream)).status).toBe(413);
  });
});


it('accepts a style reference with dimensions and validates incomplete reference uploads', async () => {
  resetAsyncRuntimeForTests();
  process.env.AI_PROVIDER = 'mock';
  const response = await POST(request({ ...uploadFields, referenceImageDataUrl: 'data:image/png;base64,BBBB', referenceWidth: '500', referenceHeight: '700' }));
  expect(response.status).toBe(202);
  const body = await response.json();
  expect(await getAsyncRuntime().storage.exists(`tasks/${body.taskId}/reference`)).toBe(true);
  const incomplete = await POST(request({ ...uploadFields, referenceImageDataUrl: 'data:image/png;base64,BBBB' }));
  expect(incomplete.status).toBe(400);
});
