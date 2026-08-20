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
    const image = screen.getByAltText('AI 生成的完整微海报');
    expect(image).toHaveAttribute('src', draft.image.dataUrl);
    expect(image).toHaveStyle({ objectFit: 'contain' });
    expect(screen.queryByText('今天也要可可爱爱')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('表情 ♡')).not.toBeInTheDocument();
  });

  it('shows a failed-generation message when the complete image is empty', () => {
    const draft = createEmptyDraft();

    render(<PosterPreview draft={draft} />);

    expect(screen.getByText('未生成成功')).toBeInTheDocument();
    expect(screen.queryByText('玩偶图片')).not.toBeInTheDocument();
  });
});
