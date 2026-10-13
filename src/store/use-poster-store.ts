import { create } from 'zustand';
import type { CopyGenerationResult, ImageAsset, GenerationResult, PosterDraft, WizardStep } from '@/domain/project';
import type { SavedProject } from '@/lib/projects/project-library';
import { editVisualImagePrompt, isStructuredImagePrompt, type EditableImagePromptField } from '@/lib/image-prompt-spec';

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
  promptPlan: GenerationResult | null;
  originalPrompts: string[];
  completedPromptPlan: number;
  startDesign: () => void;
  setPromptPlan: (plan: GenerationResult) => void;
  editVisualPrompt: (index: number, field: EditableImagePromptField, text: string) => void;
  resetVisualPrompt: (index: number) => void;
  submitPrompts: () => void;
  setUpload: (upload: ImageAsset | null) => void;
  setReferenceImage: (image: ImageAsset | null) => void;
  setRevisionPrompt: (prompt: string) => void;
  regenerateOne: (draft: PosterDraft, feedback: string) => void;
  retryMissingPoster: (style: PosterDraft['style']) => void;
  restoreProject: (project: SavedProject) => void;
  setCreativeIdea: (creativeIdea: string) => void;
  setKeywords: (keywords: string) => void;
  setForbiddenWords: (forbiddenWords: string) => void;
  setCopyPrompt: (copyPrompt: string) => void;
  startGeneration: () => void;
  openCopyComposer: () => void;
  backToChoose: () => void;
  resumeResults: () => void;
  markExported: () => void;
  setExportResult: (result: { dataUrl: string; filename: string }) => void;
  setCopyResult: (result: CopyGenerationResult | null) => void;
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
  revisionPrompt: '',
  promptPlan: null,
  originalPrompts: [] as string[],
  completedPromptPlan: 0
};

export const usePosterStore = create<PosterStore>((set) => ({
  ...initialState,
  startDesign: () => set((state) => state.upload && (state.step === 'upload' || state.step === 'review' || state.step === 'choose') ? { step:'preparing',generation:null,promptPlan:null,originalPrompts:[],error:null,selectedDraft:null,copyResult:null,copyError:null,exportResult:null,regenerationTarget:null,revisionPrompt:'' } : state),
  setPromptPlan: (plan) => set((state) => state.step === 'preparing' ? {promptPlan:cloneGeneration(plan),originalPrompts:plan.posters.map((poster)=>poster.finalPrompt ?? ''),step:'review',error:null} : state),
  editVisualPrompt: (index,field,text) => set((state) => state.promptPlan && state.step === 'review' ? {promptPlan:{...state.promptPlan,posters:state.promptPlan.posters.map((poster,i)=>i===index?{...poster,finalPrompt:editVisualImagePrompt(poster.finalPrompt ?? '',field,text) ?? poster.finalPrompt}:poster)}} : state),
  resetVisualPrompt: (index) => set((state) => state.promptPlan && state.step === 'review' ? {promptPlan:{...state.promptPlan,posters:state.promptPlan.posters.map((poster,i)=>i===index?{...poster,finalPrompt:state.originalPrompts[index] ?? poster.finalPrompt}:poster)}} : state),
  submitPrompts: () => set((state) => state.step === 'review' && state.promptPlan?.posters.every((poster)=>isStructuredImagePrompt(poster.finalPrompt)) ? {step:'generating',error:null,regenerationTarget:null,revisionPrompt:''} : state),
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
        promptPlan: null,
        ...(state.step === 'choose' ? { generation: null } : {})
      };
    }),
  regenerateOne: (draft, feedback) => set((state) => {
    if (state.step !== 'choose' || !state.upload || !state.generation || !feedback.trim() || !state.generation.posters.some((poster) => poster.style === draft.style)) return state;
    return { step: 'generating', regenerationTarget: cloneDraft(draft), revisionPrompt: feedback.trim(), error: null, promptPlan:null };
  }),
  retryMissingPoster: (style) => set((state) => {
    const missing = state.promptPlan?.posters.find((poster) => poster.style === style);
    if (state.step !== 'choose' || !state.upload || !state.generation || !missing || state.generation.posters.some((poster) => poster.style === style)) return state;
    return { step: 'generating', regenerationTarget: cloneDraft(missing), revisionPrompt: '', error: null };
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
    copyResult: project.copyResult ? cloneCopyResult(project.copyResult) : null,
    promptPlan: project.promptPlan ? cloneGeneration(project.promptPlan) : null,
    originalPrompts: [...(project.originalPrompts ?? [])]
  }),
  openCopyComposer: () =>
    set((state) =>
      state.step === 'choose' && state.upload && state.generation?.posters.length
        ? { step: 'copy', copyError: null }
        : state
    ),
  backToChoose: () =>
    set((state) => (state.step === 'copy' ? { step: 'choose', copyError: null } : state)),
  resumeResults: () => set((state) => state.step === 'upload' && state.generation ? { step: 'choose', error: null } : state),
  markExported: () =>
    set((state) => (state.step === 'choose' || state.step === 'edit' ? { step: 'exported' } : state)),
  setExportResult: (exportResult) => set({ exportResult }),
  setCopyResult: (copyResult) =>
    set((state) => (state.step === 'copy' ? { copyResult: copyResult ? cloneCopyResult(copyResult) : null, copyError: null } : state)),
  setCopyError: (copyError) => set((state) => (state.step === 'copy' ? { copyError } : state)),
  clearCopyError: () => set({ copyError: null }),
  continueEditing: () => set((state) => (state.step === 'exported' ? { step: 'edit' } : state)),
  failGeneration: (message) =>
    set((state) =>
      state.step === 'preparing' ? {step:'upload',error:message} : state.step === 'generating'
        ? state.regenerationTarget && state.generation
          ? { step: 'choose', error: message, regenerationTarget: null }
          : state.promptPlan ? {step:'review',error:message}
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
        const existing = state.generation.posters.some((poster) => poster.style === replacement.style);
        const order = state.promptPlan?.posters.map((poster) => poster.style) ?? [];
        const posters = (existing
          ? state.generation.posters.map((poster) => poster.style === replacement.style ? cloneDraft(replacement) : poster)
          : [...state.generation.posters, cloneDraft(replacement)]
        ).sort((a, b) => order.indexOf(a.style) - order.indexOf(b.style));
        const stillMissing = state.promptPlan?.posters.some((poster) => !posters.some((ready) => ready.style === poster.style)) ?? false;
        const slotIndex = state.promptPlan?.posters.findIndex((poster) => poster.style === replacement.style) ?? -1;
        const failedLabel = slotIndex >= 0 ? `动态方案 ${String.fromCharCode(65 + slotIndex)}方向` : '';
        return {
          generation: { ...state.generation, posters, warnings: (state.generation.warnings ?? []).filter((warning) => !failedLabel || !warning.includes(failedLabel)) },
          ...(selectedChanged ? { selectedDraft: cloneDraft(replacement), copyResult: null, copyError: null, exportResult: null } : {}),
          step: 'choose', error: null, regenerationTarget: null, revisionPrompt: '',
          promptPlan: stillMissing ? state.promptPlan : null,
          originalPrompts: stillMissing ? state.originalPrompts : [],
          completedPromptPlan: state.promptPlan && !stillMissing ? state.completedPromptPlan + 1 : state.completedPromptPlan
        };
      }
      const stillMissing = state.promptPlan?.posters.some((poster) => !generation.posters.some((ready) => ready.style === poster.style)) ?? false;
      return { generation: cloneGeneration(generation), step: 'choose', error: null, promptPlan:stillMissing ? state.promptPlan : null,originalPrompts:stillMissing ? state.originalPrompts : [],selectedDraft:null,copyResult:null,copyError:null,exportResult:null,completedPromptPlan:state.promptPlan&&!stillMissing?state.completedPromptPlan+1:state.completedPromptPlan };
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
      if (state.step === 'review' || state.step === 'preparing') return {step:'upload',error:null};
      if (state.step === 'generating') {
        if (state.regenerationTarget && state.generation) return { step: 'choose', regenerationTarget: null, error: null };
        if (state.promptPlan) return {step:'review',error:null};
        return { step: 'upload', generation: null, selectedDraft: null, copyResult: null, copyError: null, exportResult: null };
      }
      if (state.step === 'copy') return { step: 'choose', copyError: null };
      if (state.step === 'edit') return { step: 'choose' };
      if (state.step === 'choose') {
        return { step: 'upload', error: null };
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
