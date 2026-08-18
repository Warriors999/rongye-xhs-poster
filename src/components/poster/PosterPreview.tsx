import type { PosterDraft } from '@/domain/project';

export function PosterPreview({ draft }: { draft: PosterDraft }) {
  return (
    <div className="poster-preview" data-ratio="3:4" style={{ aspectRatio: '3 / 4', backgroundColor: draft.background }}>
      {draft.image.dataUrl ? (
        <img className="poster-preview-image" src={draft.image.dataUrl} alt="海报中的针织玩偶照片" />
      ) : (
        <div className="poster-image-placeholder" aria-label="海报中的针织玩偶照片">玩偶图片</div>
      )}
    </div>
  );
}
