import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from '@/server/ai/provider';
import { MockProvider } from '@/server/ai/mock-provider';
import { OpenAICompatibleProvider } from '@/server/ai/openai-compatible-provider';
import { GeminiProvider } from '@/server/ai/gemini-provider';

const input = { image: { id: 'upload', dataUrl: 'data:image/png;base64,AAAA', width: 768, height: 1024, source: 'upload' as const }, keywords: '', forbiddenWords: '' };

const validCompletion = {
  analysis: { subject: '针织玩偶', colors: ['奶油白'], material: '针织', details: ['纽扣'] },
  posters: Array.from({ length: 3 }, (_, index) => ({
    style: ['cute', 'daily', 'series'][index],
    image: input.image,
    copy: { title: `标题 ${index}`, description: '描述', tags: ['#针织玩偶'] },
    background: '#f8e5df',
    layers: { stickers: {} }
  }))
};

describe('AI providers', () => {
  let originalProvider: string | undefined;

  beforeEach(() => {
    originalProvider = process.env.AI_PROVIDER;
  });

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
    vi.unstubAllEnvs();
  });

  it('returns the mock provider when AI_PROVIDER is missing', () => {
    delete process.env.AI_PROVIDER;
    expect(getProvider()).toBeInstanceOf(MockProvider);
  });

  it('returns the mock provider when configured', () => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    expect(getProvider()).toBeInstanceOf(MockProvider);
  });

  it('returns the real provider when configured as openai-compatible', () => {
    vi.stubEnv('AI_PROVIDER', 'openai-compatible');
    expect(getProvider()).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('returns the Gemini provider when the vision protocol is google', () => {
    vi.stubEnv('AI_PROVIDER', 'openai-compatible');
    vi.stubEnv('AI_VISION_PROTOCOL', 'google');
    expect(getProvider()).toBeInstanceOf(GeminiProvider);
  });

  it('rejects an unknown provider instead of falling back to mock', () => {
    vi.stubEnv('AI_PROVIDER', 'unsupported-provider');
    expect(() => getProvider()).toThrow('AI_PROVIDER 配置不受支持');
  });

  it('passes injected config and dependencies to the openai-compatible provider', () => {
    const fetchImpl = vi.fn();
    const provider = getProvider({
      env: {
        AI_PROVIDER: 'openai-compatible',
        AI_BASE_URL: 'https://example.test/v1',
        AI_API_KEY: 'test-key',
        AI_VISION_MODEL: 'vision-model',
        AI_IMAGE_MODEL: 'image-model'
      },
      fetchImpl,
      timeoutMs: 1234
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('returns three deterministic styles with distinct colors and layouts', async () => {
    const result = await new MockProvider().generate(input);
    expect(result.posters.map((poster) => poster.style)).toEqual(['cute', 'daily', 'series']);
    expect(result.posters.map((poster) => poster.background)).toEqual(['#f8e5df', '#f3ead9', '#dfe9df']);
    expect(new Set(result.posters.map((poster) => poster.layers.title?.y)).size).toBe(3);
    expect(result.posters.every((poster) => poster.image.dataUrl === input.image.dataUrl)).toBe(true);
  });

  it('returns a validated response from an injected fetch implementation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validCompletion) } }] }), { status: 200 }));
    const provider = new OpenAICompatibleProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'test-key', AI_VISION_MODEL: 'vision-model', AI_IMAGE_MODEL: 'image-model' },
      fetchImpl
    });

    await expect(provider.generate(input)).resolves.toMatchObject({ posters: expect.any(Array) });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  it('prefers the dedicated vision key over the legacy shared key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validCompletion) } }] }), { status: 200 }));
    const provider = new OpenAICompatibleProvider({
      env: {
        AI_BASE_URL: 'https://example.test/v1',
        AI_API_KEY: 'legacy-key',
        AI_VISION_API_KEY: 'vision-key',
        AI_IMAGE_MODEL: 'image-model',
        AI_VISION_MODEL: 'vision-model'
      },
      fetchImpl
    });

    await provider.generate(input);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer vision-key' }) })
    );
  });

  it.each([
    ['non-2xx response', new Response('upstream secret body', { status: 503 }), '生成服务暂时不可用，请重试'],
    ['non-JSON response', new Response('not json', { status: 200 }), '生成结果格式异常，请重试']
  ])('maps %s without exposing upstream data', async (_name, response, message) => {
    const provider = new OpenAICompatibleProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'secret-api-key', AI_VISION_MODEL: 'vision-model', AI_IMAGE_MODEL: 'image-model' },
      fetchImpl: vi.fn().mockResolvedValue(response)
    });

    const error = await provider.generate(input).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(message);
    expect((error as Error).message).not.toContain('secret-api-key');
    expect((error as Error).message).not.toContain('upstream secret body');
  });

  it('waits for a failed response body to be cancelled before returning', async () => {
    let signalCancelStarted!: () => void;
    let releaseCancel!: () => void;
    const cancelStarted = new Promise<void>((resolve) => { signalCancelStarted = resolve; });
    const cancelReleased = new Promise<void>((resolve) => { releaseCancel = resolve; });
    const response = new Response(new ReadableStream<Uint8Array>(), { status: 503 });
    const cancelSpy = vi.spyOn(response.body!, 'cancel').mockImplementation(async () => {
      signalCancelStarted();
      await cancelReleased;
    });
    const provider = new OpenAICompatibleProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'secret-api-key', AI_VISION_MODEL: 'vision-model', AI_IMAGE_MODEL: 'image-model' },
      fetchImpl: vi.fn().mockResolvedValue(response)
    });

    const resultPromise = provider.generate(input);
    await cancelStarted;
    expect(cancelSpy).toHaveBeenCalledOnce();
    releaseCancel();
    await expect(resultPromise).rejects.toThrow('生成服务暂时不可用，请重试');
  });

  it('maps network failures to a safe temporary-unavailable error', async () => {
    const provider = new OpenAICompatibleProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'secret-api-key', AI_VISION_MODEL: 'vision-model', AI_IMAGE_MODEL: 'image-model' },
      fetchImpl: vi.fn().mockRejectedValue(new Error('network secret-api-key'))
    });

    const error = await provider.generate(input).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('生成服务暂时不可用，请重试');
    expect((error as Error).message).not.toContain('secret-api-key');
  });

  it('aborts and maps a timed out request', async () => {
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const provider = new OpenAICompatibleProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'secret-api-key', AI_VISION_MODEL: 'vision-model', AI_IMAGE_MODEL: 'image-model' },
      fetchImpl,
      timeoutMs: 5
    });

    await expect(provider.generate(input)).rejects.toThrow('生成服务暂时不可用，请重试');
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('times out when the response body never finishes after headers arrive', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => new Promise<never>(() => undefined)
    } as unknown as Response);
    const provider = new OpenAICompatibleProvider({
      env: { AI_BASE_URL: 'https://example.test/v1', AI_API_KEY: 'secret-api-key', AI_VISION_MODEL: 'vision-model', AI_IMAGE_MODEL: 'image-model' },
      fetchImpl,
      timeoutMs: 5
    });

    const startedAt = Date.now();
    await expect(provider.generate(input)).rejects.toThrow('生成服务暂时不可用，请重试');
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
