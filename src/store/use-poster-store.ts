import { create } from 'zustand';
import type { CopyGenerationResult, ImageAsset, GenerationResult, PosterDraft, WizardStep } from '@/domain/project';
import type { SavedProject } from '@/lib/projects/project-library';

export function cloneDraft(draft: PosterDraft): PosterDraft {
  return {
    ...draft,
    image: { ...draft.image },
    copy: { ...draft.copy, tags: [...draft.copy.tags] },
    design: draft.design
      ? {
          ...draft.design,
          elements: [...draft.design.elements],
          palette: [...draft.design.palette],
          negative: [...draft.design.negative]
        }
      : undefined,
    layers: {
      title: draft.layers.title ? { ...draft.layers.title } : undefined,
      description: draft.layers.description ? { ...draft.layers.description } : undefined,
      tag: draft.layers.tag ? { ...draft.layers.tag } : undefined,
      stickers: Object.fromEntries(
        Object.entries(draft.layers.stickers).map(([id, sticker]) => [id, { ...sticker }])
      )
    }
  };
}

function cloneResearch(research: GenerationResult['research']): GenerationResult['research'] {
  return {
    ...research,
    sources: research.sources.map((source) => ({ ...source }))
  };
}

function cloneCopyResult(result: CopyGenerationResult): CopyGenerationResult {
  return {
    variants: result.variants.map((variant) => ({ ...variant, tags: [...variant.tags] }))
  };
}

export function cloneGeneration(generation: GenerationResult): GenerationResult {
  return {
    analysis: {
      ...generation.analysis,
      colors: [...generation.analysis.colors],
      details: [...generation.analysis.details]
    },
    research: cloneResearch(generation.research),
    posters: generation.posters.map(cloneDraft),
    ...(generation.warnings ? { warnings: [...generation.warnings] } : {})
  };
}

export interface PosterStore {
  step: WizardStep;
  upload: ImageAsset | null;
  referenceImage: ImageAsset | null;
  creativeIdea: string;
  keywords: string;
  forbiddenWords: string;
  generation: GenerationResult | null;
  selectedDraft: PosterDraft | null;
  copyPrompt: string;
  copyResult: CopyGenerationResult | null;
  copyError: string | null;
  exportResult: { dataUrl: string; filename: string } | null;
  error: string | null;
  regenerationTarget: PosterDraft | null;
  revisionPrompt: string;
  setUpload: (upload: ImageAsset | null) => void;
  setReferenceImage: (image: ImageAsset | null) => void;
  setRevisionPrompt: (prompt: string) => void;
  regenerateOne: (draft: PosterDraft, feedback: string) => void;
  restoreProject: (project: SavedProject) => void;
  setCreativeIdea: (creativeIdea: string) => void;
  setKeywords: (keywords: string) => void;
  setForbiddenWords: (forbiddenWords: string) => void;
  setCopyPrompt: (copyPrompt: string) => void;
  startGeneration: () => void;
  openCopyComposer: () => void;
  backToChoose: () => void;
  markExported: () => void;
  setExportResult: (result: { dataUrl: string; filename: string }) => void;
  setCopyResult: (result: CopyGenerationResult) => void;
  setCopyError: (message: string) => void;
  clearCopyError: () => void;
  continueEditing: () => void;
  failGeneration: (message: string) => void;
  setGeneration: (generation: GenerationResult) => void;
  selectDraft: (draft: PosterDraft) => void;
  updateDraft: (updater: (draft: PosterDraft) => PosterDraft) => void;
  goBack: () => void;
  clearError: () => void;
  setError: (message: string) => void;
  resetSession: () => void;
  clearSession: () => void;
}

const initialState = {
  step: 'upload' as const,
  upload: null,
  referenceImage: null,
  creativeIdea: '',
  keywords: '',
  forbiddenWords: '',
  generation: null,
  selectedDraft: null,
  copyPrompt: '',
  copyResult: null,
  copyError: null,
  exportResult: null,
  error: null,
  regenerationTarget: null,
  revisionPrompt: ''
};

export const usePosterStore = create<PosterStore>((set) => ({
  ...initialState,
  setUpload: (upload) => set({ upload }),
  setReferenceImage: (referenceImage) => set({ referenceImage }),
  setRevisionPrompt: (revisionPrompt) => set({ revisionPrompt }),
  setCreativeIdea: (creativeIdea) => set({ creativeIdea }),
  setKeywords: (keywords) => set({ keywords }),
  setForbiddenWords: (forbiddenWords) => set({ forbiddenWords }),
  setCopyPrompt: (copyPrompt) => set({ copyPrompt }),
  startGeneration: () =>
    set((state) => {
      if ((state.step !== 'upload' && state.step !== 'choose') || !state.upload) return state;
      return {
        step: 'generating',
        error: null,
        selectedDraft: null,
        copyResult: null,
        copyError: null,
        exportResult: null,
        regenerationTarget: null,
        revisionPrompt: '',
        ...(state.step === 'choose' ? { generation: null } : {})
      };
    }),
  regenerateOne: (draft, feedback) => set((state) => {
    if (state.step !== 'choose' || !state.upload || !state.generation || !feedback.trim() || !state.generation.posters.some((poster) => poster.style === draft.style)) return state;
    return { step: 'generating', regenerationTarget: cloneDraft(draft), revisionPrompt: feedback.trim(), error: null };
  }),
  restoreProject: (project) => set({
    ...initialState,
    step: 'choose',
    upload: { ...project.upload },
    referenceImage: project.referenceImage ? { ...project.referenceImage } : null,
    creativeIdea: project.creativeIdea,
    keywords: project.keywords,
    forbiddenWords: project.forbiddenWords,
    generation: cloneGeneration(project.generation),
    selectedDraft: project.selectedDraft ? cloneDraft(project.selectedDraft) : null,
    copyPrompt: project.copyPrompt,
    copyResult: project.copyResult ? cloneCopyResult(project.copyResult) : null
  }),
  openCopyComposer: () =>
    set((state) =>
      state.step === 'choose' && state.upload && state.selectedDraft
        ? { step: 'copy', copyError: null }
        : state
    ),
  backToChoose: () =>
    set((state) => (state.step === 'copy' ? { step: 'choose', copyError: null } : state)),
  markExported: () =>
    set((state) => (state.step === 'choose' || state.step === 'edit' ? { step: 'exported' } : state)),
  setExportResult: (exportResult) => set({ exportResult }),
  setCopyResult: (copyResult) =>
    set((state) => (state.step === 'copy' ? { copyResult: cloneCopyResult(copyResult), copyError: null } : state)),
  setCopyError: (copyError) => set((state) => (state.step === 'copy' ? { copyError } : state)),
  clearCopyError: () => set({ copyError: null }),
  continueEditing: () => set((state) => (state.step === 'exported' ? { step: 'edit' } : state)),
  failGeneration: (message) =>
    set((state) =>
      state.step === 'generating'
        ? state.regenerationTarget && state.generation
          ? { step: 'choose', error: message, regenerationTarget: null }
          : { step: 'upload', error: message, generation: null, selectedDraft: null, copyResult: null, copyError: null, exportResult: null, regenerationTarget: null }
        : state
    ),
  setGeneration: (generation) =>
    set((state) => {
      if (state.step !== 'generating') return state;
      if (state.regenerationTarget && state.generation) {
        const replacement = generation.posters.find((poster) => poster.style === state.regenerationTarget!.style);
        if (generation.posters.length !== 1 || !replacement) return { step: 'choose', error: '这张海报没有完成重做，请重试', regenerationTarget: null };
        const selectedChanged = state.selectedDraft?.style === replacement.style;
        return {
          generation: { ...state.generation, posters: state.generation.posters.map((poster) => poster.style === replacement.style ? cloneDraft(replacement) : poster) },
          ...(selectedChanged ? { selectedDraft: cloneDraft(replacement), copyResult: null, copyError: null, exportResult: null } : {}),
          step: 'choose', error: null, regenerationTarget: null, revisionPrompt: ''
        };
      }
      return { generation: cloneGeneration(generation), step: 'choose', error: null };
    }),
  selectDraft: (selectedDraft) =>
    set((state) =>
      state.step === 'choose'
        ? { selectedDraft: cloneDraft(selectedDraft), error: null, ...(state.selectedDraft?.style !== selectedDraft.style ? { copyResult: null, copyError: null } : {}) }
        : state
    ),
  updateDraft: (updater) =>
    set((state) =>
      state.selectedDraft
        ? { selectedDraft: cloneDraft(updater(cloneDraft(state.selectedDraft))) }
        : state
    ),
  goBack: () =>
    set((state) => {
      if (state.step === 'generating') {
        if (state.regenerationTarget && state.generation) return { step: 'choose', regenerationTarget: null, error: null };
        return { step: 'upload', generation: null, selectedDraft: null, copyResult: null, copyError: null, exportResult: null };
      }
      if (state.step === 'copy') return { step: 'choose', copyResult: null, copyError: null };
      if (state.step === 'edit') return { step: 'choose' };
      if (state.step === 'choose') {
        return { step: 'upload', generation: null, selectedDraft: null, copyResult: null, copyError: null, exportResult: null, error: null };
      }
      if (state.step === 'exported') {
        return { step: 'upload', generation: null, selectedDraft: null, copyResult: null, copyError: null, exportResult: null, error: null };
      }
      return state;
    }),
  clearError: () => set({ error: null }),
  setError: (error) => set({ error }),
  resetSession: () =>
    set((state) => ({
      step: 'upload',
      upload: state.upload,
      referenceImage: state.referenceImage,
      creativeIdea: state.creativeIdea,
      keywords: state.keywords,
      forbiddenWords: state.forbiddenWords,
      copyPrompt: state.copyPrompt,
      generation: null,
      selectedDraft: null,
      copyResult: null,
      copyError: null,
      exportResult: null,
      error: null,
      regenerationTarget: null,
      revisionPrompt: ''
    })),
  clearSession: () => set(initialState)
}));
