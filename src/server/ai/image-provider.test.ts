import { describe, expect, it, vi } from 'vitest';
import { ImageProvider, IMAGE_FORMAT_ERROR, IMAGE_PROVIDER_UNAVAILABLE_ERROR } from './image-provider';
import { designPresets } from '@/lib/design-system';

const image = {
  id: 'upload-1',
  dataUrl: 'data:image/jpeg;base64,AAAA',
  width: 898,
  height: 1600,
  source: 'upload' as const
};

describe('ImageProvider', () => {
  it('sends an image edit request and returns a beautified image asset', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: 'iVBORw0KGgoAAA' }]
    }), { status: 200 }));
    const provider = new ImageProvider({
      env: {
        AI_IMAGE_BASE_URL: 'https://example.test/v1',
        AI_IMAGE_API_KEY: 'image-secret',
        AI_IMAGE_MODEL: 'gpt-image-2'
      },
      fetchImpl
    });

    const result = await provider.beautify({ image, mode: 'studio' });

    expect(result).toMatchObject({
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAA',
      width: 898,
      height: 1600,
      source: 'beautified',
      mode: 'studio'
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer image-secret' },
        body: expect.any(FormData),
        signal: expect.any(AbortSignal)
      })
    );
    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = request.body as FormData;
    expect(body.get('model')).toBe('gpt-image-2');
    expect(body.get('size')).toBe('1024x1536');
    expect(body.get('prompt')).toEqual(expect.stringContaining('同一个真实编织玩偶')); 
    expect(body.get('prompt')).toEqual(expect.stringContaining('不得改变主体的外形、比例、姿态、颜色、针织纹理'));
  });

  it('maps upstream errors and malformed image responses to safe errors', async () => {
    const unavailable = new ImageProvider({
      env: { AI_IMAGE_BASE_URL: 'https://example.test/v1', AI_IMAGE_API_KEY: 'secret', AI_IMAGE_MODEL: 'gpt-image-2' },
      fetchImpl: vi.fn().mockResolvedValue(new Response('upstream secret', { status: 503 }))
    });
    await expect(unavailable.beautify({ image, mode: 'craft' })).rejects.toThrow(IMAGE_PROVIDER_UNAVAILABLE_ERROR);

    const malformed = new ImageProvider({
      env: { AI_IMAGE_BASE_URL: 'https://example.test/v1', AI_IMAGE_API_KEY: 'secret', AI_IMAGE_MODEL: 'gpt-image-2' },
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    });
    await expect(malformed.beautify({ image, mode: 'craft' })).rejects.toThrow(IMAGE_FORMAT_ERROR);
  });

  it('sends the structured design brief and exact Chinese copy for a complete micro-poster', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: 'complete-poster' }]
    }), { status: 200 }));
    const provider = new ImageProvider({
      env: { AI_IMAGE_BASE_URL: 'https://example.test/v1', AI_IMAGE_API_KEY: 'image-secret', AI_IMAGE_MODEL: 'gpt-image-2' },
      fetchImpl
    });

    await provider.beautify({
      image,
      mode: 'studio',
      poster: {
        style: 'cute',
        copy: { title: '织进日常', description: '一只认真生活的小伙伴。', tags: ['#针织玩偶', '#手作日常'] },
        design: designPresets.cute
      }
    });

    const [, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const prompt = String((request.body as FormData).get('prompt'));
    expect(prompt).toContain('完整的 3:4 竖版中文微海报');
    expect(prompt).toContain('织进日常');
    expect(prompt).toContain('抽象纸张色块');
    expect(prompt).toContain('不是普通照片美化');
    expect(prompt).toContain('不得改变上传玩偶的身份');
    expect(prompt).toContain('允许少量有明确设计意义的英文');
    expect(prompt).toContain('严禁自行编造或绘制商品名称、人物姓名、品牌名、价格');
    expect(prompt).not.toContain('纸质价格签');
    expect(prompt).not.toContain('不要文字');
  });

  it('rejects incomplete configuration before making a request', async () => {
    const fetchImpl = vi.fn();
    const provider = new ImageProvider({ env: {}, fetchImpl });

    await expect(provider.beautify({ image, mode: 'original' })).rejects.toThrow(IMAGE_PROVIDER_UNAVAILABLE_ERROR);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
