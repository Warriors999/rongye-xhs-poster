import { createPendingGenerationTask, isCurrentPendingGenerationTask } from './pending-generation';
import { pendingGeneration } from './pending-generation';
import { createEmptyDraft, defaultResearchSummary } from '@/domain/project';

const upload = { id: 'photo', dataUrl: 'data:image/png;base64,AAAA', width: 3, height: 4, source: 'upload' as const };
const snapshot = {
  upload,
  referenceImage: null,
  creativeIdea: '暖光',
  keywords: '针织',
  forbiddenWords: '',
  promptPlan: null,
  originalPrompts: [],
  generation: null,
  selectedDraft: null,
  regenerationTarget: null,
  revisionPrompt: ''
};

it('accepts only a recent submitted task with the input needed to resume without POST', () => {
  const current = createPendingGenerationTask('task-12345678', snapshot, 10_000);
  expect(isCurrentPendingGenerationTask(current, 10_001)).toBe(true);
  expect(isCurrentPendingGenerationTask(current, 10_000 + 30 * 60 * 1000)).toBe(false);
  expect(isCurrentPendingGenerationTask({ ...current, taskId: '../other-task' }, 10_001)).toBe(false);
  expect(isCurrentPendingGenerationTask({ ...current, snapshot: { ...snapshot, upload: null } }, 10_001)).toBe(false);
});

it('clears only the task whose delivered result was saved to the browser', async () => {
  const task = createPendingGenerationTask('task-12345678', snapshot);
  const result = { analysis: { subject: '兔子', colors: ['白'], material: '毛线', details: [] }, research: defaultResearchSummary, posters: [createEmptyDraft()] };
  const read = vi.spyOn(pendingGeneration, 'read').mockResolvedValue(task);
  const clear = vi.spyOn(pendingGeneration, 'clear').mockResolvedValue(undefined);
  try {
    pendingGeneration.markDelivered(task.taskId, result);
    await pendingGeneration.clearAfterSavedGeneration({ ...result });
    expect(clear).not.toHaveBeenCalled();
    await pendingGeneration.clearAfterSavedGeneration(result);
    expect(clear).toHaveBeenCalledOnce();
  } finally { read.mockRestore(); clear.mockRestore(); }
});
