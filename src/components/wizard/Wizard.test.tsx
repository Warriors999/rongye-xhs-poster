import { fireEvent, render, screen } from '@testing-library/react';
import type { ImageAsset } from '@/domain/project';
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
});
