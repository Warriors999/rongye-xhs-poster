import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyDraft, defaultResearchSummary, type GenerationResult, type ImageAsset } from '@/domain/project';
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
  const createPoster = (style: 'lifestyle' | 'story' | 'editorial', designNote: string) => ({
    ...createEmptyDraft(),
    style,
    image: { ...upload, id: `${style}-poster`, dataUrl: `data:image/png;base64,${style}` },
    designNote
  });
  return {
    analysis: { subject: '针织兔子', colors: ['奶油白'], material: '棉线', details: ['长耳朵'] },
    research: { ...defaultResearchSummary, composition: '参考图采用单一主体和清晰留白。', sources: defaultResearchSummary.sources.map((source) => ({ ...source })) },
    warnings: ['其中一张海报未通过检查，已保留其余合格结果。'],
    posters: [
      createPoster('lifestyle', '以生活方式摄影表现手作陪伴感。'),
      createPoster('story', '用前中后景组织一个轻量故事。'),
      createPoster('editorial', '用留白和字体层级建立编辑秩序。')
    ]
  };
}

function taskResultFromGeneration(generation = createGeneration()) {
  return {
    ...generation,
    posters: generation.posters.map((poster) => ({
      ...poster,
      image: {
        id: poster.image.id,
        assetKey: `tasks/task-poll-1/assets/${poster.style}`,
        assetUrl: `/api/tasks/task-poll-1?asset=${poster.style}`,
        contentType: 'image/png',
        width: poster.image.width,
        height: poster.image.height,
        source: 'beautified' as const
      }
    }))
  };
}

describe('GenerationScreen', () => {
  beforeEach(() => {
    usePosterStore.getState().clearSession();
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

  it('shows six server-driven stages without inventing a percentage', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    render(<GenerationScreen />);
    expect(screen.getByRole('heading', { name: '正在识别玩偶' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText('正在形成 3 个设计方向')).toBeInTheDocument();
    expect(screen.getByText('正在生成 3 张微海报')).toBeInTheDocument();
    expect(screen.getByText('正在整理图片与下载')).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it('warns before leaving an in-flight image request', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirm);
    render(<GenerationScreen />);
    fireEvent.click(screen.getByRole('button', { name: '返回修改' }));
    expect(usePosterStore.getState().step).toBe('generating');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '返回修改' }));
    expect(usePosterStore.getState().step).toBe('upload');
  });

  it('submits a single redo with its original photo, reference, selected design and feedback', async () => {
    usePosterStore.getState().setGeneration(createGeneration());
    const before = usePosterStore.getState().generation!;
    usePosterStore.getState().setReferenceImage({ ...upload, id: 'reference', dataUrl: 'data:image/png;base64,ref' });
    usePosterStore.getState().regenerateOne(before.posters[1], '背景更简单，保留文字');
    const result = taskResultFromGeneration({ ...createGeneration(), posters: [{ ...before.posters[1], image: { ...upload, id: 'new-story' } }] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-redo-1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-redo-1', status: 'succeeded', phase: 'completed', progress: 100, warnings: [], expiresAt: Date.now() + 60_000, result }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<GenerationScreen />);
    expect(screen.getByText('正在重做这张海报')).toBeInTheDocument();
    expect(screen.queryByText('正在生成 3 张微海报')).not.toBeInTheDocument();
    await waitFor(() => expect(usePosterStore.getState().step).toBe('choose'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/regenerate');
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('originalImageDataUrl')).toBe(upload.dataUrl);
    expect(form.get('referenceImageDataUrl')).toBe('data:image/png;base64,ref');
    expect(form.get('targetStyle')).toBe('story');
    expect(form.get('revisionPrompt')).toBe('背景更简单，保留文字');
    expect(JSON.parse(form.get('selectedPosterDesign') as string)).toEqual(before.posters[1].design);
    expect(JSON.parse(form.get('selectedPosterCopy') as string)).toEqual(before.posters[1].copy);
    expect(usePosterStore.getState().generation?.posters).toHaveLength(3);
    expect(usePosterStore.getState().generation?.posters[0]).toBe(before.posters[0]);
  });

  it('submits a 202 task, polls every two seconds, and enters choose after success', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-poll-1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-poll-1', status: 'running', phase: 'researching', progress: 35, warnings: [], expiresAt: Date.now() + 60_000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-poll-1', status: 'succeeded', phase: 'completed', progress: 100, warnings: [], expiresAt: Date.now() + 60_000, result: taskResultFromGeneration() }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<GenerationScreen />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/generate', '/api/tasks/task-poll-1', '/api/tasks/task-poll-1']);
    expect(usePosterStore.getState().step).toBe('choose');
    expect(usePosterStore.getState().generation?.posters[0].image.dataUrl).toBe('/api/tasks/task-poll-1?asset=lifestyle');
  });

  it('rejects a succeeded task without research and preserves all retry inputs', async () => {
    const result = taskResultFromGeneration();
    const { research: _research, ...invalidResult } = result;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-invalid-1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-invalid-1', status: 'succeeded', phase: 'completed', progress: 100, warnings: [], expiresAt: Date.now() + 60_000, result: invalidResult }), { status: 200 })));

    render(<GenerationScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('生成结果格式异常，请重试');
    expect(usePosterStore.getState()).toMatchObject({ step: 'upload', upload, keywords: '春日', forbiddenWords: '塑料', creativeIdea: '复古玩具店橱窗，暖黄色灯光' });
  });

  it('rejects a task poster with an unsafe asset URL', async () => {
    const result = taskResultFromGeneration();
    result.posters[0].image.assetUrl = 'javascript:alert(1)';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-invalid-2', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-invalid-2', status: 'succeeded', phase: 'completed', progress: 100, warnings: [], expiresAt: Date.now() + 60_000, result }), { status: 200 })));

    render(<GenerationScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('生成结果格式异常，请重试');
    expect(usePosterStore.getState().step).toBe('upload');
  });

  it('keeps the upload inputs after a failed task and can retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-failed-1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-failed-1', status: 'failed', phase: 'failed', progress: 100, warnings: [], error: '生成服务暂时不可用，请重试', expiresAt: Date.now() + 60_000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-retry-1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-retry-1', status: 'succeeded', phase: 'completed', progress: 100, warnings: [], expiresAt: Date.now() + 60_000, result: taskResultFromGeneration() }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<GenerationScreen />);
    const retry = await screen.findByRole('button', { name: '重新生成' });
    expect(usePosterStore.getState()).toMatchObject({ step: 'upload', upload, keywords: '春日', forbiddenWords: '塑料', creativeIdea: '复古玩具店橱窗，暖黄色灯光' });
    fireEvent.click(retry);
    await waitFor(() => expect(usePosterStore.getState().step).toBe('choose'));
  });

  it('aborts submission or polling when leaving the generating screen', () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      signal = options.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<GenerationScreen />);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
