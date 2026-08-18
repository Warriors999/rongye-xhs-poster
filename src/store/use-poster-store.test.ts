import { createEmptyDraft, type GenerationResult, type ImageAsset } from '@/domain/project';
import { usePosterStore } from './use-poster-store';

const upload: ImageAsset = {
  id: 'upload-1',
  dataUrl: 'data:image/png;base64,upload',
  width: 3,
  height: 4,
  source: 'upload'
};

const generation: GenerationResult = {
  analysis: {
    subject: '针织兔子',
    colors: ['奶油白'],
    material: '棉线',
    details: ['长耳朵']
  },
  posters: [createEmptyDraft()]
};

describe('poster store', () => {
  beforeEach(() => {
    usePosterStore.getState().resetSession();
    usePosterStore.getState().setUpload(upload);
  });

  it('starts in upload', () => {
    expect(usePosterStore.getState().step).toBe('upload');
  });

  it('starts generation and clears an existing error', () => {
    usePosterStore.getState().setError('生成失败');

    usePosterStore.getState().startGeneration();

    expect(usePosterStore.getState().step).toBe('generating');
    expect(usePosterStore.getState().error).toBeNull();
  });

  it('sets generation and moves to choose', () => {
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);

    expect(usePosterStore.getState().generation).toEqual(generation);
    expect(usePosterStore.getState().generation).not.toBe(generation);
    expect(usePosterStore.getState().step).toBe('choose');
  });

  it('selects a draft while staying on the choice screen', () => {
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().selectDraft(generation.posters[0]);

    expect(usePosterStore.getState().selectedDraft).toEqual(generation.posters[0]);
    expect(usePosterStore.getState().selectedDraft).not.toBe(generation.posters[0]);
    expect(usePosterStore.getState().selectedDraft).not.toBe(usePosterStore.getState().generation?.posters[0]);
    expect(usePosterStore.getState().step).toBe('choose');
  });

  it('follows the wizard back transitions', () => {
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().goBack();
    expect(usePosterStore.getState().step).toBe('upload');

    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().goBack();
    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().generation).toEqual(generation);

    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    expect(usePosterStore.getState().step).toBe('choose');

    usePosterStore.getState().selectDraft(generation.posters[0]);
    usePosterStore.getState().goBack();
    expect(usePosterStore.getState().step).toBe('upload');

    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().selectDraft(generation.posters[0]);
    usePosterStore.getState().markExported();
    expect(usePosterStore.getState().step).toBe('exported');
    usePosterStore.getState().goBack();
    expect(usePosterStore.getState().step).toBe('upload');
  });

  it('runs the public API from generating through a failed generation back to upload', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().setCreativeIdea('复古玩具店橱窗');
    usePosterStore.getState().setKeywords('兔子');
    usePosterStore.getState().setForbiddenWords('塑料');
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().failGeneration('生成服务暂时不可用');
    const state = usePosterStore.getState();

    expect(state.step).toBe('upload');
    expect(state.error).toBe('生成服务暂时不可用');
    expect(state.upload).toBe(upload);
    expect(state.creativeIdea).toBe('复古玩具店橱窗');
    expect(state.keywords).toBe('兔子');
    expect(state.forbiddenWords).toBe('塑料');
  });

  it('clears generation and selection after a failed generation', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().failGeneration('失败');

    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().generation).toBeNull();
    expect(usePosterStore.getState().selectedDraft).toBeNull();
  });

  it('requires an upload before starting generation', () => {
    usePosterStore.getState().resetSession();
    usePosterStore.getState().startGeneration();
    expect(usePosterStore.getState().step).toBe('upload');
  });

  it('clears the previous generation and selection when regenerating from choose', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().startGeneration();

    expect(usePosterStore.getState().step).toBe('generating');
    expect(usePosterStore.getState().generation).toBeNull();
    expect(usePosterStore.getState().selectedDraft).toBeNull();
  });

  it('can regenerate directly from the choice screen', () => {
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().selectDraft(generation.posters[0]);
    usePosterStore.getState().startGeneration();
    expect(usePosterStore.getState().step).toBe('generating');
  });

  it('only accepts generation results while generating', () => {
    usePosterStore.getState().setGeneration(generation);
    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().generation).toBeNull();

    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().setGeneration({ ...generation, analysis: { ...generation.analysis, subject: '替换' } });
    expect(usePosterStore.getState().generation).toEqual(generation);
  });

  it('only selects drafts while choosing', () => {
    usePosterStore.getState().selectDraft(generation.posters[0]);
    expect(usePosterStore.getState().step).toBe('upload');

    usePosterStore.getState().startGeneration();
    usePosterStore.getState().selectDraft(generation.posters[0]);
    expect(usePosterStore.getState().step).toBe('generating');
  });

  it('only fails generation while generating', () => {
    usePosterStore.getState().failGeneration('非法失败');
    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().error).toBeNull();

    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().failGeneration('非法失败');
    expect(usePosterStore.getState().step).toBe('choose');
    expect(usePosterStore.getState().error).toBeNull();
  });

  it('runs the complete public wizard flow to exported and back to upload', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    expect(usePosterStore.getState().step).toBe('generating');
    usePosterStore.getState().setGeneration(generation);
    expect(usePosterStore.getState().step).toBe('choose');
    usePosterStore.getState().selectDraft(generation.posters[0]);
    expect(usePosterStore.getState().step).toBe('choose');
    usePosterStore.getState().markExported();
    expect(usePosterStore.getState().step).toBe('exported');
    usePosterStore.getState().goBack();
    expect(usePosterStore.getState().step).toBe('upload');
    expect(usePosterStore.getState().generation).toBeNull();
    expect(usePosterStore.getState().selectedDraft).toBeNull();
    expect(usePosterStore.getState().error).toBeNull();
  });

  it('marks a selected choice as exported for legacy callers', () => {
    usePosterStore.getState().markExported();
    expect(usePosterStore.getState().step).toBe('upload');

    usePosterStore.getState().startGeneration();
    usePosterStore.getState().markExported();
    expect(usePosterStore.getState().step).toBe('generating');

    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().markExported();
    expect(usePosterStore.getState().step).toBe('exported');

    usePosterStore.getState().selectDraft(generation.posters[0]);
    usePosterStore.getState().markExported();
    expect(usePosterStore.getState().step).toBe('exported');

    usePosterStore.getState().markExported();
    expect(usePosterStore.getState().step).toBe('exported');
  });

  it('allows regeneration from choose through the public API', () => {
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().startGeneration();

    expect(usePosterStore.getState().step).toBe('generating');
  });

  it('clears error and selection when entering generating', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().setError('旧错误');
    usePosterStore.getState().startGeneration();

    expect(usePosterStore.getState().error).toBeNull();
    expect(usePosterStore.getState().selectedDraft).toBeNull();
  });

  it('sets and clears an error through the public API', () => {
    usePosterStore.getState().setError('错误');
    expect(usePosterStore.getState().error).toBe('错误');

    usePosterStore.getState().clearError();
    expect(usePosterStore.getState().error).toBeNull();
  });

  it('updates upload and text setters through the public API', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().setKeywords('春日');
    usePosterStore.getState().setForbiddenWords('夸大');

    const state = usePosterStore.getState();
    expect(state.upload).toBe(upload);
    expect(state.keywords).toBe('春日');
    expect(state.forbiddenWords).toBe('夸大');
  });

  it('accepts an editor updater for the selected draft', () => {
    const draft = createEmptyDraft();
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration({ ...generation, posters: [draft] });
    usePosterStore.getState().selectDraft(draft);

    usePosterStore.getState().updateDraft((current) => ({
      ...current,
      background: '#fff'
    }));

    expect(usePosterStore.getState().selectedDraft?.background).toBe('#fff');
  });

  it('does not let external or in-place updater mutations leak into store data', () => {
    usePosterStore.getState().startGeneration();
    const externalGeneration = { ...generation, posters: [createEmptyDraft()] };
    usePosterStore.getState().setGeneration(externalGeneration);
    const externalPoster = externalGeneration.posters[0];
    externalPoster.copy.tags.push('#外部修改');
    externalPoster.layers.title!.text = '外部修改';

    const stored = usePosterStore.getState().generation!.posters[0];
    expect(stored.copy.tags).not.toContain('#外部修改');
    expect(stored.layers.title!.text).not.toBe('外部修改');

    usePosterStore.getState().selectDraft(stored);
    usePosterStore.getState().updateDraft((draft) => {
      draft.copy.title = '原地修改';
      draft.layers.title!.text = '原地修改';
      return draft;
    });

    expect(usePosterStore.getState().generation!.posters[0].copy.title).not.toBe('原地修改');
    expect(usePosterStore.getState().generation!.posters[0].layers.title!.text).not.toBe('原地修改');
  });

  it('resets the complete session', () => {
    usePosterStore.getState().setUpload(upload);
    usePosterStore.getState().setCreativeIdea('复古玩具店橱窗');
    usePosterStore.getState().setKeywords('兔子');
    usePosterStore.getState().setForbiddenWords('塑料');
    usePosterStore.getState().startGeneration();
    usePosterStore.getState().setGeneration(generation);
    usePosterStore.getState().selectDraft(createEmptyDraft());
    usePosterStore.getState().setError('错误');

    usePosterStore.getState().resetSession();
    const state = usePosterStore.getState();

    expect(state.step).toBe('upload');
    expect(state.upload).toBeNull();
    expect(state.creativeIdea).toBe('');
    expect(state.keywords).toBe('');
    expect(state.forbiddenWords).toBe('');
    expect(state.generation).toBeNull();
    expect(state.selectedDraft).toBeNull();
    expect(state.error).toBeNull();
  });
});
