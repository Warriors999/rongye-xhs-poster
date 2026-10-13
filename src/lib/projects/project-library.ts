import type { CopyGenerationResult, GenerationResult, ImageAsset, PosterDraft } from '@/domain/project';
import { cloneDraft, cloneGeneration } from '@/store/use-poster-store';
import { imageSourceToDataUrl } from './image-source';

export const MAX_SAVED_PROJECTS = 12;
export const LATEST_AUTO_RESULT_ID = 'latest-auto-result';

export interface ProjectSnapshotInput {
  upload: ImageAsset | null;
  referenceImage: ImageAsset | null;
  creativeIdea: string;
  keywords: string;
  forbiddenWords: string;
  generation: GenerationResult | null;
  selectedDraft: PosterDraft | null;
  copyPrompt: string;
  copyResult: CopyGenerationResult | null;
  promptPlan?: GenerationResult | null;
  originalPrompts?: string[];
}

export interface SavedProject extends Omit<ProjectSnapshotInput, 'upload' | 'generation'> {
  version: 1;
  id: string;
  savedAt: number;
  title: string;
  upload: ImageAsset;
  generation: GenerationResult;
}

export async function createProjectSnapshot(input: ProjectSnapshotInput): Promise<SavedProject> {
  if (!input.upload || !input.generation || input.generation.posters.length === 0) throw new Error('请先生成海报再保存作品');
  const cache = new Map<string, Promise<string>>();
  const inlineImage = async (image: ImageAsset): Promise<ImageAsset> => {
    if (!cache.has(image.dataUrl)) cache.set(image.dataUrl, imageSourceToDataUrl(image.dataUrl));
    return { ...image, dataUrl: await cache.get(image.dataUrl)! };
  };
  const generation = cloneGeneration(input.generation);
  for (const poster of generation.posters) poster.image = await inlineImage(poster.image);
  const selectedDraft = input.selectedDraft ? cloneDraft(input.selectedDraft) : null;
  if (selectedDraft) selectedDraft.image = await inlineImage(selectedDraft.image);
  const promptPlan = input.promptPlan ? cloneGeneration(input.promptPlan) : null;
  if (promptPlan) for (const poster of promptPlan.posters) poster.image = await inlineImage(poster.image);
  return {
    version: 1,
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    title: input.creativeIdea.trim().slice(0, 40) || input.generation.analysis.subject || '我的海报',
    upload: await inlineImage(input.upload),
    referenceImage: input.referenceImage ? await inlineImage(input.referenceImage) : null,
    creativeIdea: input.creativeIdea,
    keywords: input.keywords,
    forbiddenWords: input.forbiddenWords,
    generation,
    selectedDraft,
    copyPrompt: input.copyPrompt,
    copyResult: input.copyResult ? { variants: input.copyResult.variants.map((variant) => ({ ...variant, tags: [...variant.tags] })) } : null,
    promptPlan,
    originalPrompts: [...(input.originalPrompts ?? [])]
  };
}

export interface ProjectStorage {
  readAll: () => Promise<SavedProject[]>;
  replaceAll: (projects: SavedProject[]) => Promise<void>;
  mutate?: (change: (projects: SavedProject[]) => SavedProject[]) => Promise<void>;
}

export function createProjectLibrary(storage: ProjectStorage) {
  let pending: Promise<void> = Promise.resolve();
  const mutate = (change: (projects: SavedProject[]) => SavedProject[]) => {
    const next = pending.then(async () => storage.mutate ? storage.mutate(change) : storage.replaceAll(change(await storage.readAll())));
    pending = next.catch(() => undefined);
    return next;
  };
  return {
    list: async () => { await pending; return (await storage.readAll()).sort((a, b) => b.savedAt - a.savedAt); },
    save: (project: SavedProject) => mutate((projects) => {
      const latest = projects.find((saved) => saved.id === LATEST_AUTO_RESULT_ID);
      const manual = [project, ...projects.filter((saved) => saved.id !== project.id && saved.id !== LATEST_AUTO_RESULT_ID)]
        .sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_SAVED_PROJECTS);
      return latest ? [latest, ...manual] : manual;
    }),
    saveLatest: (project: SavedProject) => mutate((projects) => [
      { ...project, id: LATEST_AUTO_RESULT_ID },
      ...projects.filter((saved) => saved.id !== LATEST_AUTO_RESULT_ID)
    ]),
    remove: (id: string) => mutate((projects) => projects.filter((project) => project.id !== id))
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('当前浏览器不支持本地作品库')); return; }
    const request = indexedDB.open('rongye-project-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本地作品库，请检查浏览器存储权限'));
    request.onblocked = () => reject(new Error('请关闭其他绒页页面后再试'));
  });
}

async function mutateStoredProjects(change: (projects: SavedProject[]) => SavedProject[]): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const projects = change(request.result as SavedProject[]);
          store.clear();
          projects.forEach((project) => store.put(project));
        } catch { transaction.abort(); }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('作品保存失败，浏览器空间可能不足，请删除旧作品后再试'));
      transaction.onabort = () => reject(new Error('作品保存失败，浏览器空间可能不足，请删除旧作品后再试'));
    });
  } finally { database.close(); }
}

const indexedDbStorage: ProjectStorage = {
  readAll: async () => {
    const database = await openDatabase();
    try {
      return await new Promise<SavedProject[]>((resolve, reject) => {
        const request = database.transaction('projects', 'readonly').objectStore('projects').getAll();
        request.onsuccess = () => resolve(request.result as SavedProject[]);
        request.onerror = () => reject(new Error('作品读取失败，请重试'));
      });
    } finally { database.close(); }
  },
  replaceAll: (projects) => mutateStoredProjects(() => projects),
  mutate: mutateStoredProjects
};

export const projectLibrary = createProjectLibrary(indexedDbStorage);
