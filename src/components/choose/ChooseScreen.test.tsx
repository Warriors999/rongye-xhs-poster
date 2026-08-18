import { fireEvent, render, screen } from '@testing-library/react';
import type { GenerationResult, ImageAsset } from '@/domain/project';
import { createEmptyDraft } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';
import { ChooseScreen } from './ChooseScreen';

const upload: ImageAsset = {
  id: 'choose-upload',
  dataUrl: 'data:image/jpeg;base64,choose',
  width: 3,
  height: 4,
  source: 'upload'
};

const generation: GenerationResult = {
  analysis: { subject: '针织兔子', colors: ['奶油白'], material: '棉线', details: ['长耳朵'] },
  posters: [
    { ...createEmptyDraft(), style: 'cute', image: upload },
    { ...createEmptyDraft(), style: 'daily', image: upload },
    { ...createEmptyDraft(), style: 'series', image: upload }
  ]
};

describe('ChooseScreen', () => {
  beforeEach(() => {
    usePosterStore.getState().resetSession();
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
  });

  it('shows three named poster choices with direct save actions', () => {
    render(<ChooseScreen />);

    expect(screen.getByText('可爱种草')).toBeInTheDocument();
    expect(screen.getByText('手作日常')).toBeInTheDocument();
    expect(screen.getByText('系列账号')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /保存这张/ })).toHaveLength(3);
    expect(screen.getByText('主体更突出，适合新品展示和第一眼吸引关注。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部保存' })).toBeInTheDocument();
  });

  it('selects a card without opening an editor and regenerates from the choice page', () => {
    render(<ChooseScreen />);

    fireEvent.click(screen.getByRole('button', { name: '选择手作日常方案' }));
    expect(usePosterStore.getState().step).toBe('choose');
    expect(usePosterStore.getState().selectedDraft?.style).toBe('daily');

    fireEvent.click(screen.getByRole('button', { name: '不喜欢？重新生成' }));
    expect(usePosterStore.getState().step).toBe('generating');
    expect(usePosterStore.getState().generation).toBeNull();
  });

  it('returns to upload without discarding the generated choices', () => {
    render(<ChooseScreen />);

    fireEvent.click(screen.getByRole('button', { name: '换一张照片' }));

    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().generation?.posters).toHaveLength(3);
  });
});
