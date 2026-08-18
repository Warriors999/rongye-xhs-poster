import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyDraft } from '@/domain/project';
import { BackgroundControls } from './BackgroundControls';

describe('BackgroundControls', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls the image beautify endpoint and applies the returned image', async () => {
    const onChange = vi.fn();
    const draft = createEmptyDraft();
    const sourceImage = { ...draft.image, id: 'source', dataUrl: 'data:image/jpeg;base64,AAAA', width: 898, height: 1600 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      image: { ...sourceImage, id: 'source-studio', dataUrl: 'data:image/png;base64,BBBB', source: 'beautified', mode: 'studio' }
    }), { status: 200 })));

    render(<BackgroundControls draft={draft} sourceImage={sourceImage} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /奶油棚拍/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      background: '#F0E7F2',
      image: expect.objectContaining({ dataUrl: 'data:image/png;base64,BBBB', mode: 'studio', source: 'beautified' })
    })));
    expect(fetch).toHaveBeenCalledWith('/api/beautify', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
  });

  it('restores the original image for the solid fallback without calling AI', () => {
    const onChange = vi.fn();
    const draft = createEmptyDraft();
    const sourceImage = { ...draft.image, id: 'source', dataUrl: 'data:image/jpeg;base64,AAAA', width: 898, height: 1600 };
    render(<BackgroundControls draft={{ ...draft, image: { ...sourceImage, dataUrl: 'data:image/png;base64,BBBB', source: 'beautified', mode: 'studio' } }} sourceImage={sourceImage} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /纯色备用/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      background: '#FFFDF9',
      image: expect.objectContaining({ dataUrl: sourceImage.dataUrl, source: 'upload', mode: undefined })
    }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
