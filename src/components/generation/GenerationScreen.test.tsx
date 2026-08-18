import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GenerationResult, ImageAsset } from '@/domain/project';
import { createEmptyDraft } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';
import { GenerationScreen } from './GenerationScreen';

const upload: ImageAsset = {
  id: 'generation-upload',
  dataUrl: 'data:image/jpeg;base64,generation',
  width: 600,
  height: 800,
  source: 'upload'
};

function createGeneration(): GenerationResult {
  return {
    analysis: {
      subject: '针织兔子',
      colors: ['奶油白'],
      material: '棉线',
      details: ['长耳朵']
    },
    posters: [
      createEmptyDraft(),
      { ...createEmptyDraft(), style: 'daily' },
      { ...createEmptyDraft(), style: 'series' }
    ]
  };
}

describe('GenerationScreen', () => {
  beforeEach(() => {
    usePosterStore.getState().resetSession();
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().setKeywords('春日');
    usePosterStore.getState().setForbiddenWords('塑料');
    usePosterStore.getState().setCreativeIdea('复古玩具店橱窗，暖黄色灯光');
    usePosterStore.getState().startGeneration();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the three generation stages in sequence without a percentage', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));

    render(<GenerationScreen />);

    expect(screen.getByRole('heading', { name: '正在识别玩偶' })).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByRole('heading', { name: '正在生成文案' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1800);
    });
    expect(screen.getByRole('heading', { name: '正在制作 3 套方案' })).toBeInTheDocument();
  });

  it('sends the upload fields as FormData and enters choose after success', async () => {
    const generation = createGeneration();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(generation), { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<GenerationScreen />);

    await waitFor(() => expect(usePosterStore.getState().step).toBe('choose'));
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/generate');
    expect(options.method).toBe('POST');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.body).toBeInstanceOf(FormData);
    const form = options.body as FormData;
    expect(form.get('imageDataUrl')).toBe(upload.dataUrl);
    expect(form.get('width')).toBe(String(upload.width));
    expect(form.get('height')).toBe(String(upload.height));
    expect(form.get('keywords')).toBe('春日');
    expect(form.get('forbiddenWords')).toBe('塑料');
    expect(form.get('creativeIdea')).toBe('复古玩具店橱窗，暖黄色灯光');
  });

  it('keeps the upload inputs after a failure and can retry', async () => {
    const generation = createGeneration();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络暂时不可用'))
      .mockResolvedValueOnce(new Response(JSON.stringify(generation), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<GenerationScreen />);

    const retry = await screen.findByRole('button', { name: '重新生成' });
    expect(usePosterStore.getState()).toMatchObject({
      step: 'upload',
      upload,
      keywords: '春日',
      forbiddenWords: '塑料',
      error: '网络暂时不可用'
    });

    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(usePosterStore.getState().step).toBe('choose'));
  });

  it('aborts the request when leaving the generating screen', () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<GenerationScreen />);
    expect(signal).toBeDefined();

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
