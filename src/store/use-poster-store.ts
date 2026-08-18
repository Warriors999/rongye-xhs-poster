import { create } from 'zustand';
import type { ImageAsset, GenerationResult, PosterDraft, WizardStep } from '@/domain/project';

export function cloneDraft(draft: PosterDraft): PosterDraft {
  return {
    ...draft,
    image: { ...draft.image },
    copy: { ...draft.copy, tags: [...draft.copy.tags] },
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

export function cloneGeneration(generation: GenerationResult): GenerationResult {
  return {
    analysis: {
      ...generation.analysis,
      colors: [...generation.analysis.colors],
      details: [...generation.analysis.details]
    },
    posters: generation.posters.map(cloneDraft)
  };
}

export interface PosterStore {
  step: WizardStep;
  upload: ImageAsset | null;
  creativeIdea: string;
  keywords: string;
  forbiddenWords: string;
  generation: GenerationResult | null;
  selectedDraft: PosterDraft | null;
  exportResult: { dataUrl: string; filename: string } | null;
  error: string | null;
  setUpload: (upload: ImageAsset | null) => void;
  setCreativeIdea: (creativeIdea: string) => void;
  setKeywords: (keywords: string) => void;
  setForbiddenWords: (forbiddenWords: string) => void;
  startGeneration: () => void;
  markExported: () => void;
  setExportResult: (result: { dataUrl: string; filename: string }) => void;
  continueEditing: () => void;
  failGeneration: (message: string) => void;
  setGeneration: (generation: GenerationResult) => void;
  selectDraft: (draft: PosterDraft) => void;
  updateDraft: (updater: (draft: PosterDraft) => PosterDraft) => void;
  goBack: () => void;
  clearError: () => void;
  setError: (message: string) => void;
  resetSession: () => void;
}

const initialState = {
  step: 'upload' as const,
  upload: null,
  creativeIdea: '',
  keywords: '',
  forbiddenWords: '',
  generation: null,
  selectedDraft: null,
  exportResult: null,
  error: null
};

export const usePosterStore = create<PosterStore>((set) => ({
  ...initialState,
  setUpload: (upload) => set({ upload }),
  setCreativeIdea: (creativeIdea) => set({ creativeIdea }),
  setKeywords: (keywords) => set({ keywords }),
  setForbiddenWords: (forbiddenWords) => set({ forbiddenWords }),
  startGeneration: () =>
    set((state) => {
      if ((state.step !== 'upload' && state.step !== 'choose') || !state.upload) return state;
      return {
        step: 'generating',
        error: null,
        selectedDraft: null,
        exportResult: null,
        ...(state.step === 'choose' ? { generation: null } : {})
      };
    }),
  markExported: () =>
    set((state) => (state.step === 'choose' || state.step === 'edit' ? { step: 'exported' } : state)),
  setExportResult: (exportResult) => set({ exportResult }),
  continueEditing: () => set((state) => (state.step === 'exported' ? { step: 'edit' } : state)),
  failGeneration: (message) =>
    set((state) =>
      state.step === 'generating'
        ? { step: 'upload', error: message, generation: null, selectedDraft: null, exportResult: null }
        : state
    ),
  setGeneration: (generation) =>
    set((state) =>
      state.step === 'generating'
        ? { generation: cloneGeneration(generation), step: 'choose', error: null }
        : state
    ),
  selectDraft: (selectedDraft) =>
    set((state) =>
      state.step === 'choose'
        ? { selectedDraft: cloneDraft(selectedDraft), error: null }
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
        return { step: 'upload', generation: null, selectedDraft: null, exportResult: null };
      }
      if (state.step === 'edit') return { step: 'choose' };
      if (state.step === 'choose') return { step: 'upload' };
      if (state.step === 'exported') {
        return { step: 'upload', generation: null, selectedDraft: null, exportResult: null, error: null };
      }
      return state;
    }),
  clearError: () => set({ error: null }),
  setError: (error) => set({ error }),
  resetSession: () => set(initialState)
}));
