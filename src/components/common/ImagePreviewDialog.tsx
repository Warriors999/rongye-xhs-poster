'use client';

import { useEffect, useRef } from 'react';

export function ImagePreviewDialog({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return <dialog
    ref={dialogRef}
    className="image-preview-dialog"
    aria-label={`${title}大图预览`}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <button ref={closeRef} className="image-preview-close" type="button" aria-label="关闭大图预览" onClick={onClose}>关闭 <span aria-hidden="true">×</span></button>
    <img src={src} alt={`${title}完整海报`} width="1086" height="1448" />
    <div className="image-preview-caption">{title}</div>
  </dialog>;
}
