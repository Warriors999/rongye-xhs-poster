import { createEmptyDraft, defaultResearchSummary, type GenerationResult } from '@/domain/project';
import { createProjectLibrary, createProjectSnapshot, type ProjectStorage, type SavedProject } from './project-library';

const image = { id: 'upload', dataUrl: 'data:image/png;base64,AAAA', width: 3, height: 4, source: 'upload' as const };
const generation: GenerationResult = { analysis: { subject: '兔子', colors: ['白'], material: '毛线', details: [] }, research: defaultResearchSummary, posters: [{ ...createEmptyDraft(), image: { ...image, dataUrl: '/api/tasks/task-local-1?asset=lifestyle' } }] };

describe('project library', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('captures all input and output images as durable data URLs before saving', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })));
    const snapshot = await createProjectSnapshot({ upload: image, referenceImage: image, creativeIdea: '春日', keywords: '兔子', forbiddenWords: '塑料', generation, selectedDraft: generation.posters[0], copyPrompt: '轻松', copyResult: { variants: [{ angle: '日常', title: '兔子', body: '你好', tags: ['#手作'] }] } });
    expect(snapshot.generation.posters[0].image.dataUrl).toBe('data:image/png;base64,iVBORw==');
    expect(snapshot.selectedDraft?.image.dataUrl).toBe(snapshot.generation.posters[0].image.dataUrl);
    expect(snapshot.referenceImage).toEqual(image);
    expect(snapshot).toMatchObject({ creativeIdea: '春日', keywords: '兔子', forbiddenWords: '塑料', copyPrompt: '轻松' });
    generation.posters[0].copy.tags.push('#外部');
    expect(snapshot.generation.posters[0].copy.tags).not.toContain('#外部');
  });

  it('stores and reopens the latest 12 works and removes a deleted work', async () => {
    let records: SavedProject[] = [];
    const storage: ProjectStorage = { readAll: async () => structuredClone(records), replaceAll: async (next) => { records = structuredClone(next); } };
    const library = createProjectLibrary(storage);
    const base = await createProjectSnapshot({ upload: image, referenceImage: null, creativeIdea: '', keywords: '', forbiddenWords: '', generation: { ...generation, posters: [{ ...createEmptyDraft(), image }] }, selectedDraft: null, copyPrompt: '', copyResult: null });
    for (let index = 0; index < 14; index++) await library.save({ ...base, id: `saved-${index}`, savedAt: index });
    const reopened = createProjectLibrary(storage);
    expect((await reopened.list()).map((project) => project.id)).toEqual(Array.from({ length: 12 }, (_, index) => `saved-${13 - index}`));
    await reopened.remove('saved-8');
    expect((await library.list()).some((project) => project.id === 'saved-8')).toBe(false);
    expect(await library.list()).toHaveLength(11);
  });

  it('uses atomic storage mutation so two independent pages retain each other’s saves', async () => {
    let records: SavedProject[] = [];
    let transaction: Promise<void> = Promise.resolve();
    const storage: ProjectStorage = {
      readAll: async () => structuredClone(records),
      replaceAll: async (next) => { await Promise.resolve(); records = structuredClone(next); },
      mutate: (change) => {
        const next = transaction.then(() => { records = structuredClone(change(records)); });
        transaction = next;
        return next;
      }
    };
    const base = await createProjectSnapshot({ upload: image, referenceImage: null, creativeIdea: '', keywords: '', forbiddenWords: '', generation: { ...generation, posters: [{ ...createEmptyDraft(), image }] }, selectedDraft: null, copyPrompt: '', copyResult: null });
    const firstPage = createProjectLibrary(storage);
    const secondPage = createProjectLibrary(storage);
    await Promise.all([firstPage.save({ ...base, id: 'page-one', savedAt: 1 }), secondPage.save({ ...base, id: 'page-two', savedAt: 2 })]);
    expect((await firstPage.list()).map((project) => project.id)).toEqual(['page-two', 'page-one']);
  });
});
