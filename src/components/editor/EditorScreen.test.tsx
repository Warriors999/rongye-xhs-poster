import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyDraft } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';
import { EditorScreen } from './EditorScreen';

vi.mock('./PosterStage', () => ({
  PosterStage: () => <div data-testid="poster-stage">3:4 海报画布</div>
}));

describe('EditorScreen', () => {
  beforeEach(() => {
    usePosterStore.getState().clearSession();
    usePosterStore.setState({ step: 'edit', selectedDraft: createEmptyDraft() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ image: { ...createEmptyDraft().image, dataUrl: 'data:image/png;base64,BBBB', source: 'beautified', mode: 'studio' } }), { status: 200 })));
  });

  it('shows a 3:4 poster and updates title text', () => {
    render(<EditorScreen />);
    expect(screen.getByTestId('poster-stage')).toHaveTextContent('3:4');

    fireEvent.change(screen.getByLabelText('文字内容'), { target: { value: '我的针织小兔' } });
    expect(usePosterStore.getState().selectedDraft?.layers.title?.text).toBe('我的针织小兔');
  });

  it('adds a heart sticker from the sticker tool', () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole('button', { name: /表情/ }));
    fireEvent.click(screen.getByRole('button', { name: '♡' }));

    expect(Object.values(usePosterStore.getState().selectedDraft!.layers.stickers).map((item) => item.emoji)).toContain('♡');
  });

  it('switches background without resetting copy', async () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole('button', { name: /背景/ }));
    fireEvent.click(screen.getByRole('button', { name: /奶油棚拍/ }));

    await waitFor(() => expect(usePosterStore.getState().selectedDraft?.image.mode).toBe('studio'));
    const next = usePosterStore.getState().selectedDraft!;
    expect(next.image.mode).toBe('studio');
    expect(next.copy.title).toBe('今天也要可可爱爱');
  });

  it('restores the AI draft and returns to choosing', () => {
    render(<EditorScreen />);
    fireEvent.change(screen.getByLabelText('文字内容'), { target: { value: '改过的标题' } });
    fireEvent.click(screen.getByRole('button', { name: '恢复 AI 初始方案' }));
    expect(usePosterStore.getState().selectedDraft?.layers.title?.text).toBe('今天也要可可爱爱');

    fireEvent.click(screen.getByRole('button', { name: '返回方案选择' }));
    expect(usePosterStore.getState().step).toBe('choose');
  });
});
