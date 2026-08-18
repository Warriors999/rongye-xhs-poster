'use client';

import type { LayerId, PosterDraft } from '@/domain/project';
import { addSticker, removeLayer, updateStickerScale } from '@/domain/editor';

export const STICKERS = ['♡', '✦', '☁', '☺', '手作日记'] as const;

type StickerControlsProps = {
  draft: PosterDraft;
  selectedStickerId: LayerId | null;
  onChange: (draft: PosterDraft) => void;
  onSelectSticker: (layerId: LayerId | null) => void;
};

export function StickerControls({ draft, selectedStickerId, onChange, onSelectSticker }: StickerControlsProps) {
  const stickers = Object.values(draft.layers.stickers);
  const selected = selectedStickerId?.startsWith('sticker-') ? draft.layers.stickers[selectedStickerId] : undefined;

  return (
    <section className="editor-panel" aria-label="表情编辑">
      <p className="panel-label">添加一点手作语气</p>
      <div className="sticker-picker">
        {STICKERS.map((sticker) => (
          <button key={sticker} className="sticker-button" type="button" onClick={() => {
            const next = addSticker(draft, sticker);
            const newest = Object.keys(next.layers.stickers).at(-1) as LayerId | undefined;
            onChange(next);
            onSelectSticker(newest ?? null);
          }}>{sticker}</button>
        ))}
      </div>
      {selected && (
        <div className="sticker-actions">
          <span className="control-label">当前：{selected.emoji}</span>
          <button className="secondary-small-button" type="button" onClick={() => onChange(updateStickerScale(draft, selected.id, Math.max(.6, selected.scale - .2)))}>缩小</button>
          <button className="secondary-small-button" type="button" onClick={() => onChange(updateStickerScale(draft, selected.id, Math.min(2, selected.scale + .2)))}>放大</button>
          <button className="text-button danger-text" type="button" onClick={() => { onChange(removeLayer(draft, selected.id)); onSelectSticker(null); }}>删除</button>
        </div>
      )}
      {stickers.length > 0 && <p className="editor-hint">点选画布上的表情可以移动它</p>}
    </section>
  );
}
