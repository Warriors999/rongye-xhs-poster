// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { COPY_FORMAT_ERROR, GeminiCopyProvider, OpenAICopyProvider } from './copy-provider';

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

  it('rejects an incomplete model response instead of inventing missing choices', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        copies: [
          { title: '窗边的小兔子', description: '今天的手作记录。', hashtags: ['#针织玩偶'] }
        ]
      }) } }]
    }), { status: 200 }));
    const provider = new OpenAICopyProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'key', AI_VISION_MODEL: 'vision-model' },
      fetchImpl
    });

    await expect(provider.generate(input)).rejects.toThrow(COPY_FORMAT_ERROR);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries when choices repeat the same title and body', async () => {
    const candidate = { angle: '手作记录', title: '今天的小兔子', body: '把喜欢留在今天。', tags: ['#针织玩偶'] };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ variants: [candidate, candidate, candidate] }) } }]
    }), { status: 200 }));
    const provider = new OpenAICopyProvider({ env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'key', AI_VISION_MODEL: 'vision-model' }, fetchImpl });

    await expect(provider.generate(input)).rejects.toThrow(COPY_FORMAT_ERROR);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('preserves a timeout error so the API can report a retryable timeout', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
    const provider = new OpenAICopyProvider({ env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'key', AI_VISION_MODEL: 'vision-model' }, fetchImpl, timeoutMs: 5 });

    await expect(provider.generate(input)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('uses the native Gemini protocol with two inline image parts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ variants: [
        { angle: '陪伴感', title: '软乎乎的陪伴', body: '把喜欢的日常织进一针一线。', tags: ['#针织玩偶'] },
        { angle: '手作记录', title: '一针一线的今天', body: '今天又完成了新的玩偶。', tags: ['#手作'] },
        { angle: '生活分享', title: '窗边的小伙伴', body: '和小兔子一起度过午后。', tags: ['#日常'] }
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

  it('sends the original plus three selected posters in one Gemini copy request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ variants: [
        { angle: '合集', title: '三张一起发', body: '三张海报记录同一只玩偶。', tags: ['#针织玩偶'] },
        { angle: '记录', title: '不同画面里的它', body: '从不同角度看看这只玩偶。', tags: ['#手作'] },
        { angle: '分享', title: '今天的三幅画面', body: '选了三张图分享今天的手作。', tags: ['#日常'] }
      ] }) }] } }]
    }), { status: 200 }));
    const provider = new GeminiCopyProvider({ env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'gemini-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' }, fetchImpl });
    const posters = ['lifestyle', 'story', 'editorial'].map((style, index) => ({
      style: style as 'lifestyle' | 'story' | 'editorial',
      image: { ...input.posterImage, dataUrl: `data:image/png;base64,POSTER${index}` },
      copy: input.selectedPosterCopy
    }));
    await provider.generate({ ...input, posters });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body)) as { contents: Array<{ parts: Array<{ inline_data?: { data: string } }> }> };
    expect(body.contents[0].parts.filter((part) => part.inline_data).map((part) => part.inline_data?.data)).toEqual(['ORIGINAL', 'POSTER0', 'POSTER1', 'POSTER2']);
  });

  it('shrinks large poster images before forwarding them to the vision model', async () => {
    const originalBytes = await sharp(randomBytes(720 * 960 * 3), { raw: { width: 720, height: 960, channels: 3 } }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${originalBytes.toString('base64')}`;
    const variants = [
      { angle: '陪伴', title: '窗边的小兔子', body: '它陪我过了一个下午。', tags: ['#针织'] },
      { angle: '记录', title: '今天完成一只兔子', body: '把今天的手作过程记下来。', tags: ['#手作'] },
      { angle: '分享', title: '软乎乎的一天', body: '想把这份柔软分享出去。', tags: ['#日常'] }
    ];
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ variants }) }] } }] }), { status: 200 }));
    const provider = new GeminiCopyProvider({ env: { AI_VISION_BASE_URL: 'https://example.test', AI_VISION_API_KEY: 'key', AI_VISION_MODEL: 'vision' }, fetchImpl });

    await provider.generate({ ...input, posterImage: { ...input.posterImage, dataUrl } });

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body)) as { contents: Array<{ parts: Array<{ inline_data?: { mime_type: string; data: string } }> }> };
    const sent = body.contents[0].parts.find((part) => part.inline_data?.mime_type === 'image/jpeg')?.inline_data;
    expect(sent).toBeDefined();
    expect(Buffer.from(sent!.data, 'base64').length).toBeLessThan(originalBytes.length / 3);
  });
});
