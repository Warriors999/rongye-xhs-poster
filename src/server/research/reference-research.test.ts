import { describe, expect, it, vi } from 'vitest';
import { getReferenceResearcher } from '@/server/ai/provider';
import { researchSummarySchema } from '@/server/ai/contracts';
import { ReferenceResearcher } from './reference-research';

const input = {
  keywords: '春天 手作 玩偶 '.repeat(40),
  creativeIdea: '我想要自然、轻盈、像童话一样的微海报 '.repeat(40)
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('ReferenceResearcher', () => {
  it.each(['春天', '自然', '童话', '复古', '手作', '居家', '治愈'])('uses a local design rule for %s when remote research is not configured', async (keyword) => {
    const result = await new ReferenceResearcher({ env: {} }).research({ keywords: keyword });

    expect(result.fallback).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.composition).toBeTruthy();
    expect(result.palette).toBeTruthy();
    expect(result.material).toBeTruthy();
    expect(result.typography).toBeTruthy();
    expect(result.density).toBeTruthy();
    expect(result.composition + result.palette + result.material + result.typography + result.density).not.toMatch(/具体作品|某某品牌|某张图/);
  });

  it('uses the generic local fallback when no keyword rule matches', async () => {
    const result = await new ReferenceResearcher({ env: {} }).research({ keywords: '未收录的主题' });

    expect(result).toMatchObject({
      query: '未收录的主题',
      fallback: true,
      sources: [{ title: '内置设计知识库' }]
    });
  });

  it('uses a stable generic query and skips remote research when inputs are empty', async () => {
    const fetchImpl = vi.fn();
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '   ', creativeIdea: '  ' });

    expect(result).toMatchObject({ query: '针织玩偶微海报设计', fallback: true });
    expect(result.query.length).toBeGreaterThan(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts only truncated keywords and creative idea to the Pinterest research service', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      sources: [{ title: '轻盈手作构图', url: 'https://pinterest.com/pin/123' }],
      insight: {
        composition: '主体偏置，留出一侧呼吸感。',
        palette: '奶油白与低饱和绿色。',
        material: '保留针织纹理与纸张触感。',
        typography: '短标题靠近留白区。',
        density: '低密度，装饰少而有序。'
      }
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search', REFERENCE_RESEARCH_API_KEY: 'secret-key' },
      fetchImpl
    });

    await researcher.research(input);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://research.example.test/search');
    const payload = JSON.parse(String(request.body)) as { query: string; limit: number; platform: string };
    expect(payload.query.length).toBeLessThanOrEqual(200);
    expect(payload.query.length).toBe(200);
    expect(payload.limit).toBe(3);
    expect(payload.platform).toBe('pinterest');
    expect(String(request.body)).not.toContain('secret-key');
    expect(request.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer secret-key',
      'Content-Type': 'application/json'
    }));
  });

  it('returns a cleaned remote summary with at most three legal sources', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      sources: [
        { title: '有效参考 1', url: 'https://pinterest.com/pin/1', ignored: 'remove me' },
        { title: '有效参考 2', url: 'http://example.com/reference' },
        { title: '有效参考 3', url: 'https://example.com/reference-3' },
        { title: '超出上限', url: 'https://example.com/reference-4' },
        { title: '非法协议', url: 'javascript:alert(1)' },
        { title: '超长链接', url: `https://example.com/${'a'.repeat(600)}` },
        { title: '没有链接' }
      ],
      insights: {
        composition: '构图摘要',
        palette: '色彩摘要',
        material: '材质摘要',
        typography: '排版摘要',
        density: '密度摘要',
        sourceSpecificExample: '不要返回具体作品'
      }
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '手作' });

    expect(result).toEqual({
      query: '手作',
      sources: [
        { title: '有效参考 1', url: 'https://pinterest.com/pin/1' },
        { title: '有效参考 2', url: 'http://example.com/reference' },
        { title: '有效参考 3', url: 'https://example.com/reference-3' }
      ],
      composition: '构图摘要',
      palette: '色彩摘要',
      material: '材质摘要',
      typography: '排版摘要',
      density: '密度摘要',
      fallback: false
    });
    expect(JSON.stringify(result)).not.toContain('sourceSpecificExample');
  });

  it('rejects encoded API keys, credentials, and sensitive query parameters while retaining public URLs', async () => {
    const apiKey = 'encoded-secret-key';
    const fetchImpl = vi.fn().mockResolvedValue(response({
      sources: [
        { title: '编码密钥', url: `https://example.com/reference?redirect=${encodeURIComponent(apiKey)}` },
        { title: '账号密码', url: 'https://user:password@example.com/reference' },
        { title: 'accessToken', url: 'https://example.com/reference?accessToken=public-value' },
        { title: '令牌参数', url: 'https://example.com/reference?access_token=public-value' },
        { title: 'apiKey', url: 'https://example.com/reference?apiKey=public-value' },
        { title: '凭据参数', url: 'https://example.com/reference?credential=public-value' },
        { title: '签名参数', url: 'https://example.com/reference?signature=public-value' },
        { title: '短签名参数', url: 'https://example.com/reference?sig=public-value' },
        { title: '片段令牌', url: 'https://example.com/reference#token=public-value' },
        { title: '片段密钥', url: `https://example.com/reference#${encodeURIComponent(apiKey)}` },
        { title: '前缀令牌', url: 'https://example.com/reference?redirectToken=public-value' },
        { title: '连字符令牌', url: 'https://example.com/reference?x-access-token=public-value' },
        { title: '前缀密钥', url: 'https://example.com/reference?clientSecret=public-value' },
        { title: '凭据编号', url: 'https://example.com/reference?credentialId=public-value' },
        { title: '公开参考', url: 'https://example.com/reference?utm_source=pinterest' }
      ],
      insight: {
        composition: '构图摘要',
        palette: '色彩摘要',
        material: '材质摘要',
        typography: '排版摘要',
        density: '密度摘要'
      }
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search', REFERENCE_RESEARCH_API_KEY: apiKey },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '公开参考' });

    expect(result.sources).toEqual([{ title: '公开参考', url: 'https://example.com/reference?utm_source=pinterest' }]);
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });

  it.each([
    ['keyword', 'https://example.com/reference?keyword=handmade'],
    ['signal', 'https://example.com/reference?signal=soft'],
    ['author', 'https://example.com/reference?author=studio']
  ])('retains an ordinary public parameter without false positives: %s', async (_name, url) => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      sources: [{ title: '普通公开参考', url }],
      insight: {
        composition: '构图摘要',
        palette: '色彩摘要',
        material: '材质摘要',
        typography: '排版摘要',
        density: '密度摘要'
      }
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '普通参考' });

    expect(result.sources).toEqual([{ title: '普通公开参考', url }]);
    expect(result.fallback).toBe(false);
  });

  it('bounds remote research text and URLs to the research schema limits', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      sources: [{ title: '标题'.repeat(150), url: `https://example.com/${'a'.repeat(470)}` }],
      insight: {
        composition: '构图'.repeat(150),
        palette: '色彩'.repeat(150),
        material: '材质'.repeat(150),
        typography: '排版'.repeat(150),
        density: '密度'.repeat(150)
      }
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '手作' });

    expect(result.query.length).toBeLessThanOrEqual(200);
    expect(result.sources[0]?.title.length).toBeLessThanOrEqual(200);
    expect(result.sources[0]!.url!.length).toBeLessThanOrEqual(500);
    expect(result.composition.length).toBeLessThanOrEqual(200);
    expect(result.palette.length).toBeLessThanOrEqual(200);
    expect(result.material.length).toBeLessThanOrEqual(200);
    expect(result.typography.length).toBeLessThanOrEqual(200);
    expect(result.density.length).toBeLessThanOrEqual(200);
    expect(researchSummarySchema.safeParse(result).success).toBe(true);
  });

  it('accepts a nested research payload while keeping only design summaries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      data: {
        references: [{ title: '参考', url: 'https://example.com/reference' }],
        designInsight: {
          composition: '从主体轮廓出发组织留白。',
          palette: '使用柔和的邻近色。',
          material: '强调真实手作纹理。',
          typography: '标题和辅助句保持简短。',
          density: '保留清晰的视觉呼吸。'
        }
      }
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    await expect(researcher.research({ keywords: '居家' })).resolves.toMatchObject({
      sources: [{ title: '参考', url: 'https://example.com/reference' }],
      composition: '从主体轮廓出发组织留白。',
      palette: '使用柔和的邻近色。'
    });
  });

  it.each([
    ['timeout', new DOMException('The operation was aborted', 'AbortError')],
    ['5xx', response({ error: 'upstream failed' }, 503)],
    ['invalid JSON', new Response('{not-json', { status: 200 })]
  ])('falls back locally on remote %s', async (_name, failure) => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      if (failure instanceof Response) return Promise.resolve(failure);
      return Promise.reject(failure);
    });
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '治愈' });

    expect(result.fallback).toBe(true);
    expect(result.query).toBe('治愈');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('upstream failed');
  });

  it('cancels a non-2xx response body before using the local fallback', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, body: { cancel } } as unknown as Response);
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '自然' });

    expect(result.fallback).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('aborts a request that exceeds the configured timeout', async () => {
    const fetchImpl = vi.fn((_url: RequestInfo | URL, request?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      request?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')));
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5
    });

    const result = await researcher.research({ keywords: '自然' });

    expect(result.fallback).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('never exposes the research API key in a fallback or success result', async () => {
    const apiKey = 'very-secret/research key';
    const fetchImpl = vi.fn().mockResolvedValue(response({
      sources: [{ title: `参考 ${encodeURIComponent(apiKey)}`, url: 'https://example.com/reference', apiKey }],
      insight: { composition: `摘要 ${encodeURIComponent(apiKey)}` }
    }));
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search', REFERENCE_RESEARCH_API_KEY: apiKey },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '复古' });

    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(JSON.stringify(result)).not.toContain(encodeURIComponent(apiKey));
  });

  it('cancels and falls back when a successful response exceeds the body limit', async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(512 * 1024 + 1)));
      },
      cancel() {
        canceled = true;
      }
    });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, body: stream } as unknown as Response);
    const researcher = new ReferenceResearcher({
      env: { REFERENCE_RESEARCH_URL: 'https://research.example.test/search' },
      fetchImpl
    });

    const result = await researcher.research({ keywords: '手作' });

    expect(result.fallback).toBe(true);
    expect(canceled).toBe(true);
  });
});

describe('reference research provider factory', () => {
  it('returns a locally usable researcher by default', async () => {
    const researcher = getReferenceResearcher({ env: {} });

    expect(researcher).toBeInstanceOf(ReferenceResearcher);
    await expect(researcher.research({ keywords: '手作' })).resolves.toMatchObject({ fallback: true });
  });
});
