import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyDraft, defaultResearchSummary, type GenerationResult, type ImageAsset } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';
import { downloadDataUrl } from '@/lib/export/render-poster';
import { ChooseScreen } from './ChooseScreen';

vi.mock('@/lib/export/render-poster', () => ({
  downloadDataUrl: vi.fn(),
  posterFilename: vi.fn((style: string, index: number) => `绒页-${style}-${index + 1}.png`)
}));

const upload: ImageAsset = {
  id: 'choose-upload',
  dataUrl: 'data:image/jpeg;base64,choose',
  width: 3,
  height: 4,
  source: 'upload'
};

const generation: GenerationResult = {
  analysis: { subject: '针织兔子', colors: ['奶油白'], material: '棉线', details: ['长耳朵'] },
  research: {
    ...defaultResearchSummary,
    composition: '参考图使用单一主体、留白和清晰视觉重心。',
    typography: '短标题与少量辅助文字形成层级。',
    sources: [{ title: '手作海报参考', url: 'https://example.com/reference' }]
  },
  warnings: ['故事叙事方向的图片清晰度需要留意，但不影响其他合格方案。'],
  posters: [
    { ...createEmptyDraft(), style: 'lifestyle', image: { ...upload, id: 'lifestyle', dataUrl: 'data:image/jpeg;base64,lifestyle' }, designNote: '以生活方式摄影表现真实手作陪伴感。' },
    { ...createEmptyDraft(), style: 'story', image: { ...upload, id: 'story', dataUrl: 'data:image/jpeg;base64,story' }, designNote: '用轻量前中后景讲述一个小故事。' },
    { ...createEmptyDraft(), style: 'editorial', image: { ...upload, id: 'editorial', dataUrl: 'data:image/jpeg;base64,editorial' }, designNote: '用留白和字体层级建立编辑秩序。' }
  ]
};

describe('ChooseScreen', () => {
  beforeEach(() => {
    usePosterStore.getState().clearSession();
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
  });

  function replacePosters(posters: GenerationResult['posters']) {
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration({ ...generation, posters });
  }

  it('shows dynamic concept slots, design notes, research notes and warnings', () => {
    render(<ChooseScreen />);

    expect(screen.getByText('动态方案 A')).toBeInTheDocument();
    expect(screen.getByText('动态方案 B')).toBeInTheDocument();
    expect(screen.getByText('动态方案 C')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /保存这张/ })).toHaveLength(3);
    expect(screen.getByText('以生活方式摄影表现真实手作陪伴感。')).toBeInTheDocument();
    expect(screen.getByText('用轻量前中后景讲述一个小故事。')).toBeInTheDocument();
    expect(screen.getByText(/参考研究：参考图使用单一主体/)).toBeInTheDocument();
    expect(screen.getByText('故事叙事方向的图片清晰度需要留意，但不影响其他合格方案。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部保存 3 张' })).toBeInTheDocument();
  });

  it('shows the actual count and warning when only some posters succeed', async () => {
    replacePosters(generation.posters.slice(0, 2));
    render(<ChooseScreen />);

    expect(screen.getByText('AI 已经做好 2 张')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /保存这张/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '全部保存 2 张' })).toBeInTheDocument();
    expect(screen.getByText('故事叙事方向的图片清晰度需要留意，但不影响其他合格方案。')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '全部保存 2 张' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await expect.poll(() => screen.getByRole('button', { name: '已保存全部 2 张' })).toBeTruthy();
  });

  it('shows a retry state without an empty poster list when no posters succeed', () => {
    replacePosters([]);
    render(<ChooseScreen />);

    expect(screen.getByText('这次没有生成合格的海报')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /选择.*方案/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /全部保存/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '不喜欢？重新生成' })).toBeInTheDocument();
  });

  it('selects a card without opening an editor and regenerates from the choice page', () => {
    render(<ChooseScreen />);

    fireEvent.click(screen.getByRole('button', { name: '选择动态方案 B' }));
    expect(usePosterStore.getState().step).toBe('choose');
    expect(usePosterStore.getState().selectedDraft?.style).toBe('story');

    fireEvent.click(screen.getByRole('button', { name: '不喜欢？重新生成' }));
    expect(usePosterStore.getState().step).toBe('generating');
    expect(usePosterStore.getState().generation).toBeNull();
  });

  it('opens the optional copy page only after a poster is selected', () => {
    render(<ChooseScreen />);

    const copyButton = screen.getByRole('button', { name: '生成小红书文案' });
    expect(copyButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '选择动态方案 B' }));
    expect(copyButton).toBeEnabled();
    fireEvent.click(copyButton);

    expect(usePosterStore.getState().step).toBe('copy');
    expect(usePosterStore.getState().selectedDraft?.style).toBe('story');
  });

  it('returns to upload and clears generated research and warnings', () => {
    render(<ChooseScreen />);

    fireEvent.click(screen.getByRole('button', { name: '换一张照片' }));

    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().generation).toBeNull();
  });

  it('downloads the generated image data directly without composing a canvas image', async () => {
    vi.mocked(downloadDataUrl).mockClear();
    render(<ChooseScreen />);

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '保存这张' })[0]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await expect.poll(() => vi.mocked(downloadDataUrl).mock.calls.length).toBe(1);
    await waitFor(() => expect(screen.getByRole('button', { name: '全部保存 3 张' })).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '全部保存 3 张' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await expect.poll(() => vi.mocked(downloadDataUrl).mock.calls.length).toBe(4);

    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/jpeg;base64,lifestyle', '绒页-lifestyle-1.png');
    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/jpeg;base64,story', '绒页-story-2.png');
    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/jpeg;base64,editorial', '绒页-editorial-3.png');
  });

  it('converts a same-origin task asset to a data URL before downloading', async () => {
    vi.mocked(downloadDataUrl).mockClear();
    const assetPosters = generation.posters.map((poster) => ({ ...poster, image: { ...poster.image, dataUrl: `/api/tasks/task-asset-1?asset=${poster.style}` } }));
    replacePosters(assetPosters);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } })));
    render(<ChooseScreen />);

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '保存这张' })[0]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await expect.poll(() => vi.mocked(downloadDataUrl).mock.calls.length).toBe(1);
    expect(vi.mocked(downloadDataUrl).mock.calls[0][0]).toMatch(/^data:image\/png;base64,/);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/tasks/task-asset-1?asset=lifestyle', { credentials: 'same-origin' });
  });
});
