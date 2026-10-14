'use client';

import { useRef, useState, type TouchEvent } from 'react';
import { ImagePreviewDialog } from '@/components/common/ImagePreviewDialog';

const posters = [
  { src: '/home-posters/deep-sea.webp', full: '/home-posters/deep-sea-full.webp', title: '深海之梦' },
  { src: '/home-posters/fiber-dream.webp', full: '/home-posters/fiber-dream-full.webp', title: '织物造梦' },
  { src: '/home-posters/summer-story.webp', full: '/home-posters/summer-story-full.webp', title: '夏日物语' }
] as const;

export function HomePosterStack() {
  const [front, setFront] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickUntil = useRef(0);

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const point = event.touches[0];
    if (point) touchStart.current = { x: point.clientX, y: point.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    const point = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    ignoreClickUntil.current = Date.now() + 450;
    setFront((current) => (current + (dx < 0 ? 1 : posters.length - 1)) % posters.length);
  };

  return <>
    <div className="upload-photo-stack" role="region" aria-label="示例海报" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStart.current = null; }}>
      {posters.map((poster, index) => {
        const distance = (index - front + posters.length) % posters.length;
        const position = distance === 0 ? 'front' : distance === 1 ? 'right' : 'left';
        return (
          <button
            key={poster.src}
            className="stack-card"
            data-position={position}
            type="button"
            aria-label={`查看${poster.title}示例海报`}
            aria-current={position === 'front' ? 'true' : undefined}
            onClick={() => {
              if (Date.now() < ignoreClickUntil.current) return;
              if (front === index) setPreview(index);
              else setFront(index);
            }}
          >
            <img src={poster.src} alt={`示例海报：${poster.title}`} width="360" height="480" decoding="async" />
          </button>
        );
      })}
      <span className="stack-plus" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
      <span className="visually-hidden" aria-live="polite">当前展示：{posters[front].title}</span>
    </div>
    {preview !== null && <ImagePreviewDialog src={posters[preview].full} title={posters[preview].title} onClose={() => setPreview(null)} />}
  </>;
}
