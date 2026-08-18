import {
  addSticker,
  moveLayer,
  removeLayer,
  resetDraft,
  updateTextLayer
} from './editor';
import { createEmptyDraft } from './project';

describe('poster editor model', () => {
  it('moves a layer while preserving its type and unrelated fields', () => {
    const draft = createEmptyDraft();
    const moved = moveLayer(draft, 'title', 42, 84);

    expect(moved.layers.title).toEqual({ ...draft.layers.title, x: 42, y: 84 });
    expect(moved.layers.title?.type).toBe('text');
    expect(moved.copy).toEqual(draft.copy);
    expect(moved.background).toBe(draft.background);
  });

  it('updates title text and color without changing font size', () => {
    const draft = createEmptyDraft();
    const updated = updateTextLayer(draft, 'title', { text: '新的标题', fill: '#ff0000' });

    if (updated.layers.title?.type !== 'text' || draft.layers.title?.type !== 'text') {
      throw new Error('title layer must be text');
    }
    expect(updated.layers.title.text).toBe('新的标题');
    expect(updated.layers.title.fill).toBe('#ff0000');
    expect(updated.layers.title.fontSize).toBe(draft.layers.title.fontSize);
  });

  it('adds and removes a sticker without removing text layers', () => {
    const draft = createEmptyDraft();
    const withSticker = addSticker(draft, '🧶');
    const sticker = Object.values(withSticker.layers.stickers)[0];

    expect(sticker).toBeDefined();
    expect(withSticker.layers.title?.type).toBe('text');

    const withoutSticker = removeLayer(withSticker, sticker!.id);
    expect(Object.keys(withoutSticker.layers.stickers)).toEqual([]);
    expect(withoutSticker.layers.title?.type).toBe('text');
    expect(withoutSticker.layers.description?.type).toBe('text');
  });

  it('safely returns the same draft when a layer is missing', () => {
    const draft = createEmptyDraft();

    expect(moveLayer(draft, 'sticker-missing', 1, 2)).toBe(draft);
    const withoutTitle = removeLayer(draft, 'title');
    expect(updateTextLayer(withoutTitle, 'title', { text: '无效' })).toBe(withoutTitle);
    expect('title' in withoutTitle.layers).toBe(false);
    expect(removeLayer(draft, 'sticker-missing')).toBe(draft);
  });

  it('resets a draft to the default draft', () => {
    const draft = createEmptyDraft();
    const changed = updateTextLayer(addSticker(draft, '⭐'), 'title', { text: '改过' });

    expect(resetDraft(changed)).toEqual(createEmptyDraft());
  });

  it('creates a default image asset with a type-level 3:4 shape', () => {
    const draft = createEmptyDraft();

    expect(draft.image.id).toBe('empty');
    expect(draft.image.dataUrl).toBe('');
    expect(draft.image.width).toBe(3);
    expect(draft.image.height).toBe(4);
    expect(draft.image.source).toBe('upload');
  });
});
