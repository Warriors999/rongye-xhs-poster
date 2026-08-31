// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { GeminiCopyProvider, OpenAICopyProvider } from './copy-provider';

const input = {
  originalImage: {
    id: 'original',
    dataUrl: 'data:image/png;base64,ORIGINAL',
    width: 600,
    height: 800,
    source: 'upload' as const
  },
  posterImage: {
    id: 'poster',
    dataUrl: 'data:image/png;base64,POSTER',
    width: 768,
    height: 1024,
    source: 'upload' as const
  },
  selectedStyle: 'story' as const,
  selectedPosterCopy: {
    title: '窗边的小伙伴',
    description: '把温柔放进每一针里。',
    tags: ['#针织玩偶']
  },
  keywords: '针织玩偶 自然光',
  creativeIdea: '想要有陪伴感',
  prompt: '写得像朋友分享手作日常，真诚、轻松，不要营销腔。'
};

describe('copy providers', () => {
  it('sends both the original image and selected poster to the multimodal model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        variants: [
          { angle: '陪伴感', title: '窗边有个软乎乎的朋友', body: '做完它以后，房间里好像多了一点安静的陪伴。', tags: ['#针织玩偶', '#手作日常'] },
          { angle: '手作记录', title: '把一针一线留在今天', body: '慢慢织，慢慢把喜欢的日常收进手里。', tags: ['#编织记录'] },
          { angle: '生活分享', title: '今天也被小可爱治愈', body: '自然光落下来，连针织纹理都变得很温柔。', tags: ['#手作生活'] }
        ]
      }) } }]
    }), { status: 200 }));
    const provider = new OpenAICopyProvider({
      env: {
        AI_VISION_BASE_URL: 'https://apinebula.example/v1',
        AI_VISION_API_KEY: 'vision-secret',
        AI_VISION_MODEL: 'gemini-3.1-flash-lite'
      },
      fetchImpl
    });

    const result = await provider.generate(input);

    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]?.title).toBe('窗边有个软乎乎的朋友');
    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as { messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { url: string } }> }> };
    const content = body.messages[0]?.content ?? [];
    expect(content.filter((part) => part.type === 'image_url').map((part) => part.image_url?.url)).toEqual([
      input.originalImage.dataUrl,
      input.posterImage.dataUrl
    ]);
    expect(content[0]?.text).toContain('原始玩偶图');
    expect(content[0]?.text).toContain(input.prompt);
    expect(content[0]?.text).toContain(input.selectedPosterCopy.title);
  });

  it('normalizes alternate fields and replaces unsafe or missing variants with safe copy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        copies: [
          { title: '限时特价 99 元', description: '2026 年新品上新', hashtags: ['#品牌'] }
        ]
      }) } }]
    }), { status: 200 }));
    const provider = new OpenAICopyProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'key', AI_VISION_MODEL: 'vision-model' },
      fetchImpl
    });

    const result = await provider.generate(input);

    expect(result.variants).toHaveLength(3);
    expect(JSON.stringify(result)).not.toMatch(/特价|99|2026|品牌|新品/);
    expect(result.variants.every((variant) => variant.tags.length > 0)).toBe(true);
  });

  it('uses the native Gemini protocol with two inline image parts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ variants: [
        { angle: '陪伴感', title: '软乎乎的陪伴', body: '把喜欢的日常织进一针一线。', tags: ['#针织玩偶'] }
      ] }) }] } }]
    }), { status: 200 }));
    const provider = new GeminiCopyProvider({
      env: {
        AI_VISION_BASE_URL: 'https://apinebula.example',
        AI_VISION_API_KEY: 'gemini-secret',
        AI_VISION_MODEL: 'gemini-3.1-flash-lite'
      },
      fetchImpl
    });

    await provider.generate(input);

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://apinebula.example/v1/models/gemini-3.1-flash-lite:generateContent?key=gemini-secret');
    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as { contents: Array<{ parts: Array<{ inline_data?: { data: string } }> }> };
    expect(body.contents[0]?.parts.filter((part) => part.inline_data).map((part) => part.inline_data?.data)).toEqual(['ORIGINAL', 'POSTER']);
  });
});
