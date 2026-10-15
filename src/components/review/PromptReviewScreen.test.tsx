import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { createEmptyDraft, defaultResearchSummary } from '@/domain/project';
import { formatDesignedImagePrompt } from '@/lib/image-prompt-spec';
import { usePosterStore } from '@/store/use-poster-store';
import { PromptReviewScreen } from './PromptReviewScreen';

const copy = { title: '柔软的一天', description: '把喜欢留在今天。', tags: ['#针织玩偶'] };
const prompt = formatDesignedImagePrompt({
  subject: '原图中的奶油白针织兔子，长耳朵和开衫可见',
  composition: '兔子靠左，右侧留出标题空间',
  visualLanguage: '真实针织质感的摄影海报',
  colorLighting: '深蓝背景，柔和侧光',
  preserve: '兔子的脸、姿态和纽扣位置保持原样'
}, copy)!;

describe('PromptReviewScreen', () => {
  beforeEach(() => {
    usePosterStore.getState().clearSession();
    const draft = createEmptyDraft();
    usePosterStore.setState({
      step: 'review',
      upload: { id: 'upload', dataUrl: 'data:image/png;base64,AAAA', width: 768, height: 1024, source: 'upload' },
      promptPlan: {
        analysis: { subject: '针织兔子', colors: ['奶油白'], material: '毛线', details: ['长耳朵'] },
        research: defaultResearchSummary,
        posters: [{ ...draft, copy, finalPrompt: prompt }]
      },
      originalPrompts: [prompt]
    });
  });

  it('shows only three editable visual descriptions and blocks an empty description', () => {
    render(<PromptReviewScreen />);
    const submit = screen.getByRole('button', { name: '按当前提示词生成 1 张' });
    expect(submit).toBeEnabled();
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: '构图与场景' })).toHaveValue('兔子靠左，右侧留出标题空间');
    expect(screen.getByRole('textbox', { name: '视觉风格与氛围' })).toHaveValue('真实针织质感的摄影海报');
    expect(screen.getByRole('textbox', { name: '配色与光线' })).toHaveValue('深蓝背景，柔和侧光');
    fireEvent.change(screen.getByRole('textbox', { name: '构图与场景' }), { target: { value: '' } });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('请填写三个视觉描述');
  });

  it('restores the original prompt on the first touch while the editor has focus', () => {
    render(<PromptReviewScreen />);
    const editor = screen.getByRole('textbox', { name: '构图与场景' });
    fireEvent.change(editor, { target: { value: '兔子靠右，左边留白' } });
    editor.focus();
    fireEvent.touchStart(screen.getByRole('button', { name: '恢复模型原稿' }));
    expect(editor).toHaveValue('兔子靠左，右侧留出标题空间');
  });

  it('submits a design task once and polls for the finished prompt plan', async () => {
    const current = usePosterStore.getState();
    const plan = { ...current.promptPlan!, posters: current.promptPlan!.posters.map((poster) => ({ ...poster, image: current.upload! })) };
    usePosterStore.setState({ step: 'preparing', promptPlan: null });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'test-design-client-123', status: 'running' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'succeeded', result: plan }), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      render(<PromptReviewScreen />);
      await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(usePosterStore.getState().step).toBe('review'));
      expect(fetchImpl.mock.calls[0][0]).toBe('/api/design');
      expect(fetchImpl.mock.calls[1][0]).toBe('/api/design/test-design-client-123');
      expect((fetchImpl.mock.calls[0][1].body as FormData).get('requestId')).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the paid design task when one status poll loses network', async () => {
    const current = usePosterStore.getState();
    const plan = { ...current.promptPlan!, posters: current.promptPlan!.posters.map((poster) => ({ ...poster, image: current.upload! })) };
    usePosterStore.setState({ step: 'preparing', promptPlan: null });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'test-design-client-456', status: 'running' }), { status: 202 }))
      .mockRejectedValueOnce(new Error('temporary offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'succeeded', result: plan }), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      render(<PromptReviewScreen />);
      await waitFor(() => expect(usePosterStore.getState().step).toBe('review'), { timeout: 5_000 });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 6_000);

  it('reuses the same request ID if the submission response is lost', async () => {
    const current = usePosterStore.getState();
    const plan = { ...current.promptPlan!, posters: current.promptPlan!.posters.map((poster) => ({ ...poster, image: current.upload! })) };
    usePosterStore.setState({ step: 'preparing', promptPlan: null });
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('submission response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'test-design-client-789', status: 'running' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'succeeded', result: plan }), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      render(<PromptReviewScreen />);
      await waitFor(() => expect(usePosterStore.getState().step).toBe('review'), { timeout: 4_000 });
      expect(fetchImpl.mock.calls[0][0]).toBe('/api/design');
      expect(fetchImpl.mock.calls[1][0]).toBe('/api/design');
      expect((fetchImpl.mock.calls[0][1].body as FormData).get('requestId')).toBe((fetchImpl.mock.calls[1][1].body as FormData).get('requestId'));
    } finally {
      vi.unstubAllGlobals();
    }
  }, 5_000);
});
