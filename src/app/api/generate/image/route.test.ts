// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createGenerationJob, completeGenerationJob } from '@/server/generation/job-store';
import { createEmptyDraft, type GenerationResult } from '@/domain/project';
import { GET } from './route';

function resultWithImages(): GenerationResult {
  const image = {
    ...createEmptyDraft().image,
    dataUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3Eok%3C%2Fsvg%3E',
    width: 100,
    height: 100,
    source: 'beautified' as const
  };
  return {
    analysis: { subject: '针织玩偶', colors: ['奶白色'], material: '棉线', details: ['针织纹理'] },
    posters: [
      { ...createEmptyDraft(), image, style: 'cute' },
      { ...createEmptyDraft(), image: { ...image, id: 'daily' }, style: 'daily' },
      { ...createEmptyDraft(), image: { ...image, id: 'series' }, style: 'series' }
    ]
  };
}

describe('GET /api/generate/image', () => {
  it('returns generated image bytes instead of embedding them in status JSON', async () => {
    const job = await createGenerationJob({
      image: { ...createEmptyDraft().image, dataUrl: 'data:image/jpeg;base64,AAAA', width: 100, height: 100 },
      keywords: '',
      forbiddenWords: ''
    });
    await completeGenerationJob(job.id, resultWithImages());

    const response = await GET(new Request(`http://localhost/api/generate/image?jobId=${job.id}&index=1`));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response.text()).toBe('<svg>ok</svg>');
  });

  it('rejects an invalid image index', async () => {
    const response = await GET(new Request('http://localhost/api/generate/image?jobId=bad&index=3'));
    expect(response.status).toBe(404);
  });
});
