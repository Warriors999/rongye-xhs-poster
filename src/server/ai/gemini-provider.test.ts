import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './gemini-provider';

const input = {
  image: {
    id: 'upload',
    dataUrl: 'data:image/png;base64,AAAA',
    width: 768,
    height: 1024,
    source: 'upload' as const
  },
  keywords: '春日针织',
  forbiddenWords: '夸大'
};

const completion = {
  analysis: {
    subject: '针织兔子',
    colors: ['奶油白'],
    material: '棉线',
    details: ['长耳朵']
  },
  posters: [
    { style: 'cute', copy: { title: '软乎乎的春天', description: '一只认真生活的小伙伴。', tags: ['#针织玩偶'] } },
    { style: 'daily', copy: { title: '今天也在手作', description: '一针一线，记录温柔日常。', tags: ['#手作日常'] } },
    { style: 'series', copy: { title: '针织小伙伴 01', description: '把小小陪伴收集起来。', tags: ['#系列玩偶'] } }
  ]
};

describe('GeminiProvider', () => {
  it('calls the native Gemini endpoint with inline image data and parses JSON text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(completion) }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: {
        AI_VISION_BASE_URL: 'https://apinebula.example',
        AI_VISION_API_KEY: 'vision-secret',
        AI_VISION_MODEL: 'gemini-3.1-flash-lite'
      },
      fetchImpl
    });

    const result = await provider.generate(input);

    expect(result.posters).toHaveLength(3);
    expect(result.posters[0].copy.title).toBe('软乎乎的春天');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://apinebula.example/v1/models/gemini-3.1-flash-lite:generateContent?key=vision-secret',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.any(String),
        signal: expect.any(AbortSignal)
      })
    );
    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.contents[0].parts).toEqual(expect.arrayContaining([
      { text: expect.stringContaining('针织玩偶') },
      { inline_data: { mime_type: 'image/png', data: 'AAAA' } }
    ]));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('maps a native Gemini error to a safe provider error', async () => {
    const provider = new GeminiProvider({
      env: {
        AI_VISION_BASE_URL: 'https://apinebula.example',
        AI_VISION_API_KEY: 'vision-secret',
        AI_VISION_MODEL: 'gemini-3.1-flash-lite'
      },
      fetchImpl: vi.fn().mockResolvedValue(new Response('secret upstream error', { status: 403 }))
    });

    await expect(provider.generate(input)).rejects.toThrow('生成服务暂时不可用，请重试');
  });

  it('normalizes Gemini plan-shaped output into the three poster drafts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        analysis: { subject: '钩针水母', color: '浅蓝', material: '毛线', details: '卷曲触手' },
        plans: [
          { copy: { title: '深海里的蓝色梦境', description: '软糯的手作水母。', tag: '#钩针玩偶 #治愈系' } },
          { copy: { title: '今日份手作', description: '把温柔锁进每一针里。', tag: '#手作日常' } },
          { copy: { title: '海洋系列 01', description: '极简针法，无限治愈。', tag: '#海洋系列' } }
        ]
      }) }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    const result = await provider.generate(input);

    expect(result.analysis.subject).toBe('钩针水母');
    expect(result.posters.map((poster) => poster.copy.title)).toEqual(['深海里的蓝色梦境', '今日份手作', '针织小伙伴']);
    expect(result.posters[0].copy.tags).toEqual(['#钩针玩偶', '#治愈系']);
  });

  it('accepts a JSON object followed by an extra closing brace from the relay', async () => {
    const malformedJson = JSON.stringify(completion) + '}';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: malformedJson }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    await expect(provider.generate(input)).resolves.toMatchObject({ posters: expect.any(Array) });
  });

  it('accepts a JSON object wrapped in Markdown fences and explanatory text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: `以下是分析结果：\n\`\`\`json\n${JSON.stringify(completion)}\n\`\`\`\n以上。` }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    await expect(provider.generate(input)).resolves.toMatchObject({ posters: expect.any(Array) });
  });

  it('cleans invalid field types and truncates oversized model text before validation', async () => {
    const oversized = '超长内容'.repeat(100);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        analysis: {
          subject: oversized,
          colors: [oversized, 123, ''],
          material: oversized,
          details: [oversized, false]
        },
        plans: [{ copy: {
          title: oversized,
          description: oversized,
          tags: [`#${oversized}`, 456, '']
        } }]
      }) }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    const result = await provider.generate(input);

    expect(result.analysis.subject).toHaveLength(200);
    expect(result.analysis.colors).toEqual([oversized.slice(0, 40)]);
    expect(result.analysis.material).toHaveLength(200);
    expect(result.analysis.details).toEqual([oversized.slice(0, 200)]);
    expect(result.posters[0].copy.title).toHaveLength(36);
    expect(result.posters[0].copy.description).toHaveLength(60);
    expect(result.posters[0].copy.tags).toEqual([`#${oversized}`.slice(0, 40)]);
  });

  it('replaces invented prices, dates and numbered names with short safe copy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        analysis: {},
        posters: [
          { copy: { title: '限时特价 128 元', description: '2026.08.18 上新', tags: ['#新品', '#针织玩偶'] } },
          { copy: { title: '手作日常', description: '把温柔放进每一针里。', tags: ['#手作日常'] } },
          { copy: { title: '系列 01', description: '记录小小陪伴。', tags: ['#系列玩偶'] } }
        ]
      }) }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    const result = await provider.generate(input);

    expect(result.posters[0].copy).toEqual({ title: '软乎乎的一天', description: '把可爱带在身边。', tags: ['#针织玩偶'] });
    expect(result.posters[1].copy.tags).toEqual(['#手作日常']);
    expect(result.posters[2].copy.title).toBe('针织小伙伴');
  });

  it('uses safe analysis defaults when the model sends empty arrays', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        analysis: { subject: '  ', colors: [], material: '', details: [] },
        plans: []
      }) }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    const result = await provider.generate(input);

    expect(result.analysis).toEqual({
      subject: '图片中的针织玩偶',
      colors: ['以图片为准'],
      material: '针织纹理（以图片为准）',
      details: ['保留主体轮廓和关键配件']
    });
  });

  it('accepts a trailing comma in the JSON object without making another model call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"analysis": {}, "plans": [],}' }] } }]
    }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    await expect(provider.generate(input)).resolves.toMatchObject({ analysis: { subject: '图片中的针织玩偶' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries one transient upstream response but does not retry a format error', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(completion) }] } }]
      }), { status: 200 }));
    const provider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl
    });

    await expect(provider.generate(input)).resolves.toMatchObject({ posters: expect.any(Array) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const invalidFetch = vi.fn().mockResolvedValue(new Response('not JSON', { status: 200 }));
    const invalidProvider = new GeminiProvider({
      env: { AI_VISION_BASE_URL: 'https://apinebula.example', AI_VISION_API_KEY: 'vision-secret', AI_VISION_MODEL: 'gemini-3.1-flash-lite' },
      fetchImpl: invalidFetch
    });

    await expect(invalidProvider.generate(input)).rejects.toThrow('生成结果格式异常，请重试');
    expect(invalidFetch).toHaveBeenCalledTimes(1);
  });
});
