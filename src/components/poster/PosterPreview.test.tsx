import { render, screen } from '@testing-library/react';
import { createEmptyDraft } from '@/domain/project';
import { PosterPreview } from './PosterPreview';

describe('PosterPreview', () => {
  it('renders the AI-composed image as a 3:4 preview without overlaying old layers', () => {
    const draft = createEmptyDraft();
    draft.image = {
      id: 'poster-image',
      dataUrl: 'data:image/png;base64,poster',
      width: 3,
      height: 4,
      source: 'upload'
    };
    draft.layers.stickers = {
      'sticker-heart': { type: 'sticker', id: 'sticker-heart', emoji: '♡', x: 360, y: 620, scale: 1 }
    };

    const { container } = render(<PosterPreview draft={draft} />);
    const preview = container.firstElementChild;

    expect(preview).toHaveClass('poster-preview');
    expect(preview).toHaveAttribute('data-ratio', '3:4');
    expect(preview).toHaveStyle({ backgroundColor: '#FFFAF4' });
    expect(screen.getByAltText('海报中的针织玩偶照片')).toHaveAttribute('src', draft.image.dataUrl);
    expect(screen.queryByText('今天也要可可爱爱')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('表情 ♡')).not.toBeInTheDocument();
  });
});
