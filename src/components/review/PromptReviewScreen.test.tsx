import { fireEvent, render, screen } from '@testing-library/react';
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

  it('allows a valid model prompt but blocks a broken section order before image submission', () => {
    render(<PromptReviewScreen />);
    const submit = screen.getByRole('button', { name: '按当前提示词生成 1 张' });
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: '方案 A 的提示词' }), { target: { value: prompt.replace('构图：', '布局：') } });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('请保留提示词的八个栏目');
  });
});
