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
  beforeEach(() => usePosterStore.getState().resetSession());

  afterEach(() => vi.unstubAllGlobals());

  it('renders the brand launch screen before the upload home', () => {
    render(<Wizard />);

    expect(screen.getByRole('heading', { name: '把每只玩偶，做成一张好看的图。' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /进入绒页/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /进入绒页/ }));
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
});
