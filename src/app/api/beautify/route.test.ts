// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/beautify/route';

function request(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request('http://localhost/api/beautify', { method: 'POST', body: form });
}

const fields = {
  imageDataUrl: 'data:image/jpeg;base64,AAAA',
  width: '898',
  height: '1600',
  mode: 'studio'
};

describe('POST /api/beautify', () => {
  beforeEach(() => vi.stubEnv('AI_PROVIDER', 'mock'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns the original image through the mock provider with the selected mode', async () => {
    const response = await POST(request(fields));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      image: {
        dataUrl: fields.imageDataUrl,
        width: 898,
        height: 1600,
        source: 'beautified',
        mode: 'studio'
      }
    });
  });

  it('rejects an invalid mode without calling a provider', async () => {
    const response = await POST(request({ ...fields, mode: 'mask' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
  });
});
