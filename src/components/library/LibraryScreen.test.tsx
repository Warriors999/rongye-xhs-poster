import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyDraft, defaultResearchSummary } from '@/domain/project';
import { projectLibrary, type SavedProject } from '@/lib/projects/project-library';
import { usePosterStore } from '@/store/use-poster-store';
import { LibraryScreen } from './LibraryScreen';

vi.mock('@/lib/projects/project-library', () => ({ projectLibrary: { list: vi.fn(), remove: vi.fn() } }));
const image = { id: 'saved-image', dataUrl: 'data:image/png;base64,AAAA', width: 600, height: 800, source: 'upload' as const };
const project: SavedProject = { version: 1, id: 'saved-project', title: '春日兔子', savedAt: Date.now(), upload: image, referenceImage: image, creativeIdea: '春日花园', keywords: '春日', forbiddenWords: '塑料', copyPrompt: '轻松', copyResult: null, selectedDraft: null, generation: { analysis: { subject: '兔子', colors: ['白'], details: [], material: '毛线' }, research: defaultResearchSummary, posters: [{ ...createEmptyDraft(), image, finalPrompt: '春日花园' }] } };

describe('LibraryScreen', () => {
  beforeEach(() => usePosterStore.getState().clearSession());

  it('opens a saved work directly without generating it again', async () => {
    vi.mocked(projectLibrary.list).mockResolvedValue([project]);
    const close = vi.fn();
    render(<LibraryScreen onClose={close} />);
    fireEvent.click(await screen.findByRole('button', { name: '打开春日兔子' }));
    expect(usePosterStore.getState()).toMatchObject({ step: 'choose', creativeIdea: '春日花园', referenceImage: image });
    expect(usePosterStore.getState().generation?.posters[0].finalPrompt).toBe('春日花园');
    expect(close).toHaveBeenCalledOnce();
  });

  it('removes a work and shows the empty library', async () => {
    vi.mocked(projectLibrary.list).mockResolvedValue([project]);
    vi.mocked(projectLibrary.remove).mockResolvedValue(undefined);
    render(<LibraryScreen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '删除春日兔子' }));
    await waitFor(() => expect(screen.getByText('还没有保存的作品')).toBeInTheDocument());
    expect(projectLibrary.remove).toHaveBeenCalledWith('saved-project');
  });
});
