import { describe, expect, it, vi } from 'vitest';
import { downloadDataUrl, posterFilename } from './render-poster';

describe('downloadDataUrl', () => {
  it('downloads image data URLs and sanitizes the filename', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadDataUrl('data:image/png;base64,AAAA', '../我的海报:01.exe');

    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('..-我的海报-01.exe.png');
    expect(anchor.href).toContain('data:image/png;base64,AAAA');
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it('rejects non-image data URLs before creating a download link', () => {
    const createElement = vi.spyOn(document, 'createElement');

    expect(() => downloadDataUrl('data:text/html,<script>alert(1)</script>', 'unsafe.html')).toThrow('海报图片格式异常，请重试');
    expect(createElement).not.toHaveBeenCalledWith('a');
    createElement.mockRestore();
  });
});

describe('posterFilename', () => {
  it('keeps valid directions stable and uses a safe default for invalid styles', () => {
    expect(posterFilename('story', 1)).toBe('绒页-story-2.png');
    expect(posterFilename('../../bad' as never, 0)).toBe('绒页-海报-1.png');
    expect(posterFilename('story')).toBe('绒页-story.png');
  });
});
