// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';

const fields = {
  originalImageDataUrl: 'data:image/png;base64,ORIGINAL',
  originalWidth: '600',
  originalHeight: '800',
  posterImageDataUrl: 'data:image/png;base64,POSTER',
  posterWidth: '768',
  posterHeight: '1024',
  selectedStyle: 'story',
  selectedPosterCopy: JSON.stringify({ title: '窗边的小伙伴', description: '把温柔放进每一针里。', tags: ['#针织玩偶'] }),
  keywords: '针织玩偶',
  creativeIdea: '陪伴感',
  prompt: '自然一点，不要营销腔'
};

function request(values: Record<string, string> = fields, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  return new Request('http://localhost/api/copy', { method: 'POST', headers, body: form });
}

describe('POST /api/copy', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'mock';
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
  });

  it('returns three copy options only after a valid explicit copy request', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.variants).toHaveLength(3);
    expect(body.variants[0]).toEqual(expect.objectContaining({
      title: expect.any(String),
      body: expect.any(String),
      tags: expect.any(Array)
    }));
  });

  it('rejects invalid image input without calling a model', async () => {
    const response = await POST(request({ ...fields, posterImageDataUrl: 'not-an-image' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '请求参数无效，请检查图片和提示词' });
  });
});
