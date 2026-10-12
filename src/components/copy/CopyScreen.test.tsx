import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyDraft, defaultResearchSummary, type GenerationResult, type ImageAsset } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';
import { CopyScreen } from './CopyScreen';

const upload: ImageAsset = {
  id: 'copy-upload',
  dataUrl: 'data:image/png;base64,ORIGINAL',
  width: 600,
  height: 800,
  source: 'upload'
};

const generation: GenerationResult = {
  analysis: { subject: '针织兔子', colors: ['奶油白'], material: '棉线', details: ['长耳朵'] },
  research: { ...defaultResearchSummary, sources: [{ title: '内置设计知识库' }] },
  posters: [{
    ...createEmptyDraft(),
    style: 'story',
    image: { ...upload, id: 'story', dataUrl: 'data:image/png;base64,POSTER', width: 768, height: 1024 },
    copy: { title: '窗边的小伙伴', description: '把温柔放进每一针里。', tags: ['#针织玩偶'] }
  }]
};

describe('CopyScreen', () => {
  beforeEach(() => {
    usePosterStore.getState().clearSession();
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().selectDraft(generation.posters[0]!);
    usePosterStore.getState().openCopyComposer();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the model when the optional copy page is opened', () => {
    render(<CopyScreen />);

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '生成小红书文案' })).toBeInTheDocument();
  });

  it('aborts a departing request and ignores its late response after opening another poster', async () => {
    let finish: (response: Response) => void = () => undefined;
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const first = render(<CopyScreen />);
    fireEvent.click(screen.getByRole('button', { name: '生成小红书文案' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    first.unmount();
    usePosterStore.getState().backToChoose();
    usePosterStore.getState().selectDraft({ ...generation.posters[0], style: 'lifestyle', image: { ...upload, id: 'other-poster' } });
    usePosterStore.getState().openCopyComposer();
    render(<CopyScreen />);
    await act(async () => { finish(new Response(JSON.stringify({ variants: [{ angle: '旧请求', title: '旧海报文案', body: '不应覆盖新海报', tags: ['#手作'] }] }), { status: 200 })); });
    expect(usePosterStore.getState().copyResult).toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText('旧海报文案')).not.toBeInTheDocument();
  });

  it('sends both images only after explicit confirmation and renders the returned options', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      variants: [
        { angle: '陪伴感', title: '窗边有个软乎乎的朋友', body: '把温柔收进手里。', tags: ['#针织玩偶'] },
        { angle: '手作记录', title: '把一针一线留在今天', body: '慢慢织，慢慢记录。', tags: ['#手作日常'] },
        { angle: '生活分享', title: '今天也被小可爱治愈', body: '自然光下的柔软日常。', tags: ['#治愈日常'] }
      ]
    }), { status: 200 }));
    render(<CopyScreen />);

    fireEvent.change(screen.getByLabelText('你想让文案怎么写？'), { target: { value: '像朋友分享，不要营销腔' } });
    fireEvent.click(screen.getByRole('button', { name: '生成小红书文案' }));

    await waitFor(() => expect(screen.getByText('窗边有个软乎乎的朋友')).toBeInTheDocument());
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/copy', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get('originalImageDataUrl')).toBe(upload.dataUrl);
    expect(form.get('posterImageDataUrl')).toBe('data:image/png;base64,POSTER');
    expect(form.get('prompt')).toBe('像朋友分享，不要营销腔');
    expect(screen.getAllByRole('button', { name: /复制这组文案/ })).toHaveLength(3);
  });

  it('keeps the selected poster flow intact when copy generation fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: '文案生成服务暂时不可用，请重试' }), { status: 502 }));
    render(<CopyScreen />);

    fireEvent.click(screen.getByRole('button', { name: '生成小红书文案' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('文案生成服务暂时不可用，请重试'));
    expect(usePosterStore.getState().step).toBe('copy');
    expect(usePosterStore.getState().generation?.posters).toHaveLength(1);
  });
});
