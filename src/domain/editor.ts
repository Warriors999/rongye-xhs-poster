import { createId } from '@/lib/ids';
import {
  createEmptyDraft,
  type LayerId,
  type PosterDraft,
  type StickerLayer,
  type TextLayer
} from './project';

export function moveLayer(draft: PosterDraft, layerId: LayerId, x: number, y: number): PosterDraft {
  if (layerId.startsWith('sticker-')) {
    const layer = draft.layers.stickers[layerId];
    if (!layer) return draft;
    return {
      ...draft,
      layers: {
        ...draft.layers,
        stickers: { ...draft.layers.stickers, [layerId]: { ...layer, x, y } }
      }
    };
  }

  if (!isTextLayerId(layerId)) return draft;
  const layer = draft.layers[layerId];
  if (!layer) return draft;

  return {
    ...draft,
    layers: { ...draft.layers, [layerId]: { ...layer, x, y } }
  };
}

export function updateTextLayer(
  draft: PosterDraft,
  layerId: TextLayer['id'],
  patch: Partial<Pick<TextLayer, 'text' | 'fontFamily' | 'fontSize' | 'fill' | 'align'>>
): PosterDraft {
  const layer = draft.layers[layerId];
  if (!layer || layer.type !== 'text') return draft;

  return {
    ...draft,
    layers: { ...draft.layers, [layerId]: { ...layer, ...patch } }
  };
}

export function addSticker(draft: PosterDraft, emoji: string): PosterDraft {
  const id = createId('sticker');
  const sticker: StickerLayer = { type: 'sticker', id, emoji, x: 360, y: 620, scale: 1 };

  return {
    ...draft,
    layers: { ...draft.layers, stickers: { ...draft.layers.stickers, [id]: sticker } }
  };
}

export function updateStickerScale(draft: PosterDraft, layerId: StickerLayer['id'], scale: number): PosterDraft {
  const layer = draft.layers.stickers[layerId];
  if (!layer) return draft;
  return {
    ...draft,
    layers: {
      ...draft.layers,
      stickers: { ...draft.layers.stickers, [layerId]: { ...layer, scale } }
    }
  };
}

export function removeLayer(draft: PosterDraft, layerId: LayerId): PosterDraft {
  if (layerId.startsWith('sticker-')) {
    if (!draft.layers.stickers[layerId]) return draft;
    const { [layerId]: _removed, ...stickers } = draft.layers.stickers;
    return { ...draft, layers: { ...draft.layers, stickers } };
  }

  if (!isTextLayerId(layerId) || !draft.layers[layerId]) return draft;
  const layers = copyLayers(draft.layers);
  delete layers[layerId];
  return { ...draft, layers };
}

export function resetDraft(_draft: PosterDraft): PosterDraft {
  return createEmptyDraft();
}

function copyLayers(layers: PosterDraft['layers']): PosterDraft['layers'] {
  const copy: PosterDraft['layers'] = { stickers: { ...layers.stickers } };
  if (layers.title) copy.title = { ...layers.title };
  if (layers.description) copy.description = { ...layers.description };
  if (layers.tag) copy.tag = { ...layers.tag };
  return copy;
}

function isTextLayerId(layerId: LayerId): layerId is TextLayer['id'] {
  return layerId === 'title' || layerId === 'description' || layerId === 'tag';
}
