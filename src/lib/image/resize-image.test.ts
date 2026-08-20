import { normalizeImage } from './resize-image';

describe('normalizeImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects unsupported image formats', async () => {
    const file = new File(['text'], 'note.gif', { type: 'image/gif' });

    await expect(normalizeImage(file)).rejects.toThrow('请选择 JPG、PNG 或 WebP 图片');
  });

  it('rejects images larger than 12MB before decoding', async () => {
    const file = new File([new Uint8Array(12 * 1024 * 1024 + 1)], 'large.jpg', {
      type: 'image/jpeg'
    });

    await expect(normalizeImage(file)).rejects.toThrow('图片不能超过 12MB');
  });

  it('scales a decoded image to the 1600px long edge and exports JPEG quality 0.92', async () => {
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,normalized');
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 2400,
      height: 1200,
      close: vi.fn()
    })));

    const asset = await normalizeImage(new File(['photo'], 'doll.jpg', { type: 'image/jpeg' }));

    expect(asset).toMatchObject({ width: 1600, height: 800, source: 'upload' });
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.92);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
  });

  it('reports a readable error when image decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));

    await expect(normalizeImage(new File(['bad'], 'broken.jpg', { type: 'image/jpeg' }))).rejects.toThrow(
      '图片无法读取，请换一张图片'
    );
  });

  it('closes an ImageBitmap when canvas drawing fails', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2400, height: 1200, close })));
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(() => { throw new Error('canvas failed'); }) })),
      toDataURL: vi.fn()
    } as unknown as HTMLCanvasElement);

    await expect(normalizeImage(new File(['photo'], 'doll.jpg', { type: 'image/jpeg' }))).rejects.toThrow(
      '图片无法读取，请换一张图片'
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('falls back to Image when createImageBitmap cannot decode and revokes its object URL', async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bitmap failed')));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL });
    class SuccessfulImage {
      naturalWidth = 2400;
      naturalHeight = 1200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', SuccessfulImage);
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,fallback')
    } as unknown as HTMLCanvasElement);

    const asset = await normalizeImage(new File(['photo'], 'doll.jpg', { type: 'image/jpeg' }));

    expect(asset).toMatchObject({ width: 1600, height: 800, source: 'upload' });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('converts a canvas export failure to the readable image error', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })));
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => { throw new Error('export failed'); })
    } as unknown as HTMLCanvasElement);

    await expect(normalizeImage(new File(['photo'], 'doll.jpg', { type: 'image/jpeg' }))).rejects.toThrow(
      '图片无法读取，请换一张图片'
    );
  });
});
