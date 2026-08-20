import type { PosterDraft } from '@/domain/project';

export function PosterPreview({ draft }: { draft: PosterDraft }) {
  return (
    <div className="poster-preview" data-ratio="3:4">
      {draft.image.dataUrl ? (
        <img className="poster-preview-image" src={draft.image.dataUrl} alt="AI 生成的完整微海报" style={{ objectFit: 'contain' }} />
      ) : (
        <div className="poster-image-placeholder" aria-label="AI 生成的完整微海报">未生成成功</div>
      )}
    </div>
  );
}
