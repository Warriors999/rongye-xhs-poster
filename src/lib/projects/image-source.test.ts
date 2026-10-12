import { imageSourceToDataUrl, MAX_IMAGE_BYTES } from './image-source';

describe('local image source', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="pink"/></svg>';
  function stubSvgRasterizer() {
    const revoke = vi.fn();
    const create = vi.fn(() => 'blob:svg-preview');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    vi.stubGlobal('Image', class { naturalWidth = 1200; naturalHeight = 1600; onload: (() => void) | null = null; set src(_source: string) { queueMicrotask(() => this.onload?.()); } });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    return { create, revoke, drawImage };
  }

  it('rasterizes a same-origin mock SVG into PNG before saving', async () => {
    const renderer = stubSvgRasterizer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(svg, { headers: { 'content-type': 'image/svg+xml' } })));
    expect(await imageSourceToDataUrl('/api/tasks/task-local-1?asset=story')).toBe('data:image/png;base64,AAAA');
    expect(renderer.drawImage).toHaveBeenCalledOnce();
    expect(renderer.revoke).toHaveBeenCalledWith('blob:svg-preview');
  });

  it('rasterizes a legacy inline mock SVG into PNG', async () => {
    stubSvgRasterizer();
    expect(await imageSourceToDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)).toBe('data:image/png;base64,AAAA');
  });

  it('rejects executable or externally linked SVG before rasterization', async () => {
    const renderer = stubSvgRasterizer();
    await expect(imageSourceToDataUrl('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).rejects.toThrow('格式异常');
    await expect(imageSourceToDataUrl('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>'))).rejects.toThrow('格式异常');
    expect(renderer.create).not.toHaveBeenCalled();
  });

  it('inlines an expiring same-origin task image', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await imageSourceToDataUrl('/api/tasks/task-local-1?asset=story')).toBe('data:image/png;base64,iVBORw==');
    expect(fetcher).toHaveBeenCalledWith('/api/tasks/task-local-1?asset=story', { credentials: 'same-origin' });
  });

  it('rejects external, executable, and oversized sources before downloading', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(imageSourceToDataUrl('https://example.com/poster.png')).rejects.toThrow('地址异常');
    await expect(imageSourceToDataUrl('data:image/svg+xml,<svg/>')).rejects.toThrow('格式异常');
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(new Response('large', { headers: { 'content-type': 'image/png', 'content-length': String(MAX_IMAGE_BYTES + 1) } }));
    await expect(imageSourceToDataUrl('/api/tasks/task-local-1?asset=story')).rejects.toThrow('过大');
  });
});
