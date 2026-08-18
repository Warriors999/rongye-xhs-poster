import { describe, expect, it, vi } from 'vitest';
import { exportPoster, EXPORT_UNSUPPORTED_MESSAGE } from './export-poster';

describe('exportPoster', () => {
  it('exports a 1200x1600-equivalent PNG', async () => {
    const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,poster');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const result = await exportPoster({ toDataURL }, 'png');

    expect(toDataURL).toHaveBeenCalledWith({ mimeType: 'image/png', pixelRatio: 1200 / 360 });
    expect(result.dataUrl).toContain('data:image/png');
    expect(result.filename).toMatch(/^knitting-poster-\d+\.png$/);
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it('uses high quality JPEG settings', async () => {
    const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,poster');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const result = await exportPoster({ toDataURL }, 'jpg');

    expect(toDataURL).toHaveBeenCalledWith({ mimeType: 'image/jpeg', quality: 0.92, pixelRatio: 1200 / 360 });
    expect(result.filename).toMatch(/\.jpg$/);
    click.mockRestore();
  });

  it('returns a useful fallback error when the stage is unavailable', async () => {
    await expect(exportPoster(null, 'png')).rejects.toThrow(EXPORT_UNSUPPORTED_MESSAGE);
  });
});
