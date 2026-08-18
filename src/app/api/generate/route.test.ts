// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/generate/route';
import { GET as GET_GENERATION_STATUS } from '@/app/api/generate/status/route';

const MAX_IMAGE_DATA_URL_LENGTH = 10_000_000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function request(fields: Record<string, string>, extraHeaders: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request('http://localhost/api/generate', { method: 'POST', headers: extraHeaders, body: form });
}

async function waitForJob(response: Response) {
  const { jobId } = await response.json() as { jobId: string };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await GET_GENERATION_STATUS(new Request(`http://localhost/api/generate/status?jobId=${jobId}`));
    if (status.status !== 202) return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('job did not finish during test');
}

const uploadFields = { imageDataUrl: 'data:image/png;base64,AAAA', width: '1600', height: '900' };

describe('POST /api/generate', () => {
  beforeEach(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns three mock posters for a valid multipart request', async () => {
    const response = await POST(request(uploadFields));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.posters).toHaveLength(3);
    expect(body.posters[0].image).toMatchObject({ width: 1024, height: 1536, source: 'beautified' });
    expect(body.posters.map((poster: { image: { id: string } }) => poster.image.id)).toEqual(['upload-studio', 'upload-craft', 'upload-original']);
  });

  it('returns 400 for invalid request data', async () => {
    const response = await POST(request({ imageDataUrl: 'not-an-image' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
  });

  it('returns 413 for an oversized data URL', async () => {
    const response = await POST(request({ imageDataUrl: `data:image/png;base64,${'A'.repeat(MAX_IMAGE_DATA_URL_LENGTH)}` }));
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBeTruthy();
  });

  it.each(['NaN', '-1'])('returns 400 for an invalid content-length header: %s', async (contentLength) => {
    const response = await POST(request({ imageDataUrl: 'data:image/png;base64,AAAA' }, { 'content-length': contentLength }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it('returns 413 when content-length exceeds the body limit', async () => {
    const response = await POST(request({ imageDataUrl: 'data:image/png;base64,AAAA' }, { 'content-length': String(MAX_BODY_BYTES + 1) }));
    expect(response.status).toBe(413);
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
    const response = await POST(requestWithStream);
    expect(response.status).toBe(413);
  });

  it('returns 400 for a multipart request missing imageDataUrl', async () => {
    const response = await POST(request({ keywords: '针织' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('does not expose an unknown provider value in a 502 error', async () => {
    vi.stubEnv('AI_PROVIDER', 'secret-provider-value');
    const response = await waitForJob(await POST(request(uploadFields)));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'failed', error: '生成服务暂时不可用，请重试' });
    expect(JSON.stringify(body)).not.toContain('secret-provider-value');
  });

  it('maps an upstream 503 from the real provider to a safe 502', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai-compatible');
    vi.stubEnv('AI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('AI_API_KEY', 'secret-api-key');
    vi.stubEnv('AI_VISION_MODEL', 'vision-model');
    vi.stubEnv('AI_IMAGE_MODEL', 'image-model');
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('upstream secret body'));
        controller.close();
      }
    });
    const upstreamResponse = new Response(upstreamBody, { status: 503 });
    const cancelSpy = vi.spyOn(upstreamResponse.body!, 'cancel');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamResponse));

    const response = await waitForJob(await POST(request(uploadFields)));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ status: 'failed', error: '生成服务暂时不可用，请重试' });
    expect(JSON.stringify(body)).not.toContain('upstream secret body');
    expect(JSON.stringify(body)).not.toContain('secret-api-key');
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it('maps invalid JSON from the real provider to a safe 502', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai-compatible');
    vi.stubEnv('AI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('AI_API_KEY', 'secret-api-key');
    vi.stubEnv('AI_VISION_MODEL', 'vision-model');
    vi.stubEnv('AI_IMAGE_MODEL', 'image-model');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream invalid json', { status: 200 })));

    const response = await waitForJob(await POST(request(uploadFields)));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ status: 'failed', error: '生成结果格式异常，请重试' });
    expect(JSON.stringify(body)).not.toContain('upstream invalid json');
    expect(JSON.stringify(body)).not.toContain('secret-api-key');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('maps missing real-provider configuration to a safe 502', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai-compatible');
    vi.stubEnv('AI_API_KEY', 'secret-api-key');

    const response = await waitForJob(await POST(request(uploadFields)));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ status: 'failed', error: '生成服务暂时不可用，请重试' });
    expect(JSON.stringify(body)).not.toContain('secret-api-key');
    expect(JSON.stringify(body)).not.toContain('stack');
  });
});
