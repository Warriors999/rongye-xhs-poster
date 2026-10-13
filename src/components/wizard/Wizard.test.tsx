import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ImageAsset } from '@/domain/project';
import { createEmptyDraft, defaultResearchSummary } from '@/domain/project';
import { projectLibrary } from '@/lib/projects/project-library';
import { usePosterStore } from '@/store/use-poster-store';
import { Wizard } from './Wizard';

const upload: ImageAsset = {
  id: 'wizard-upload',
  dataUrl: 'data:image/jpeg;base64,wizard',
  width: 3,
  height: 4,
  source: 'upload'
};

describe('Wizard', () => {
  beforeEach(() => { usePosterStore.getState().clearSession(); vi.stubGlobal('scrollTo', vi.fn()); });

  afterEach(() => vi.unstubAllGlobals());

  it('renders the brand launch screen before the upload home', async () => {
    render(<Wizard />);

    expect(screen.getByRole('heading', { name: '把每只玩偶，做成一张好看的图。' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /进入绒页/ })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '主要导航' })).not.toBeInTheDocument();
    expect(screen.queryByText('带上你的玩偶')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /进入绒页/ }));
    await screen.findByText('暂时无法读取本地作品。');
    expect(screen.getByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).toBeInTheDocument();
    expect(screen.queryByText('此步骤将在下一阶段完成')).not.toBeInTheDocument();
  });

  it('dispatches the generating step to the generation screen', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    render(<Wizard />);

    expect(screen.getByRole('heading', { name: '正在识别玩偶' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).not.toBeInTheDocument();
  });

  it('keeps the pending generation request alive while browsing the library', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      signal = options.signal;
      return new Promise<Response>(() => undefined);
    }));
    render(<Wizard />);
    fireEvent.click(screen.getByRole('button', { name: '我的作品' }));
    expect(signal?.aborted).toBe(false);
    expect(screen.queryByRole('heading', { name: '正在识别玩偶' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '创作' }));
    expect(screen.getByRole('heading', { name: '正在识别玩偶' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows a back button on inner pages and returns without clearing the result', async () => {
    render(<Wizard />);
    fireEvent.click(screen.getByRole('button', { name: /进入绒页/ }));
    act(() => {
      usePosterStore.getState().setUpload(upload);
      usePosterStore.getState().startGeneration();
      usePosterStore.getState().setGeneration({ analysis: { subject: '兔子', colors: ['白'], material: '毛线', details: [] }, research: defaultResearchSummary, posters: [{ ...createEmptyDraft(), image: upload }] });
    });
    fireEvent.click(screen.getByRole('button', { name: '返回上一级' }));
    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().generation?.posters).toHaveLength(1);
    expect(screen.getByRole('button', { name: '继续查看本次结果' })).toBeInTheDocument();
    await screen.findByText('暂时无法读取本地作品。');
  });

  it('offers the last auto-saved result after reopening the site', async () => {
    const project = {
      version: 1 as const, id: 'latest', savedAt: Date.now(), title: '针织兔子',
      upload, referenceImage: null, creativeIdea: '春日', keywords: '', forbiddenWords: '',
      generation: { analysis: { subject: '针织兔子', colors: ['白'], material: '毛线', details: [] }, research: defaultResearchSummary, posters: [{ ...createEmptyDraft(), image: upload }] },
      selectedDraft: null, copyPrompt: '', copyResult: null
    };
    const list = vi.spyOn(projectLibrary, 'list').mockResolvedValue([project]);
    render(<Wizard />);
    fireEvent.click(screen.getByRole('button', { name: /进入绒页/ }));
    fireEvent.click(await screen.findByRole('button', { name: '继续上次生成结果' }));
    expect(usePosterStore.getState().step).toBe('choose');
    expect(usePosterStore.getState().generation?.posters).toHaveLength(1);
    list.mockRestore();
  });
});
