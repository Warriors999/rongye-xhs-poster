'use client';

import { useState } from 'react';
import type { ImageAsset, BeautifyMode, PosterDraft } from '@/domain/project';
import { StatusBanner } from '@/components/common/StatusBanner';

type BackgroundControlsProps = {
  draft: PosterDraft;
  sourceImage?: ImageAsset;
  onChange: (draft: PosterDraft) => void;
};

const OPTIONS: Array<{ mode: BeautifyMode | 'solid'; label: string; description: string; color: string }> = [
  { mode: 'original', label: '原图增强', description: '保留照片氛围', color: '#FFFAF4' },
  { mode: 'craft', label: '温馨手作', description: '毛线与布艺感', color: '#F3EAD9' },
  { mode: 'studio', label: '奶油棚拍', description: '干净粉彩背景', color: '#F0E7F2' },
  { mode: 'solid', label: '纯色备用', description: '让主体更突出', color: '#FFFDF9' }
];

export function BackgroundControls({ draft, sourceImage, onChange }: BackgroundControlsProps) {
  const [busyMode, setBusyMode] = useState<BeautifyMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const originalImage = sourceImage ?? draft.image;
  const selectedMode = draft.image.mode ?? 'original';

  async function selectMode(mode: BeautifyMode | 'solid', color: string) {
    if (busyMode) return;
    setError(null);
    if (mode === 'solid' || mode === 'original') {
      onChange({
        ...draft,
        background: color,
        image: { ...originalImage, mode: mode === 'solid' ? undefined : 'original', source: 'upload' }
      });
      return;
    }

    const optimistic = {
      ...draft,
      background: color,
      image: { ...originalImage, mode, source: 'beautified' as const }
    };
    onChange(optimistic);
    setBusyMode(mode);
    try {
      const form = new FormData();
      form.set('imageDataUrl', originalImage.dataUrl);
      form.set('width', String(originalImage.width));
      form.set('height', String(originalImage.height));
      form.set('mode', mode);
      const response = await fetch('/api/beautify', { method: 'POST', body: form });
      const body = await response.json() as { image?: ImageAsset; error?: string };
      if (!response.ok || !body.image) throw new Error(body.error || '图片美化失败，请重试');
      onChange({ ...draft, background: color, image: body.image });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '图片美化失败，请重试');
      onChange({ ...draft, background: color, image: { ...originalImage, mode: undefined, source: 'upload' } });
    } finally {
      setBusyMode(null);
    }
  }

  return (
    <section className="editor-panel" aria-label="图片和背景" aria-busy={Boolean(busyMode)}>
      <p className="panel-label">选择照片氛围</p>
      <StatusBanner message={error} />
      <div className="background-options">
        {OPTIONS.map((option) => {
          const selected = option.mode === 'solid' ? !draft.image.mode && draft.background === option.color : selectedMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              className={selected ? 'background-option selected' : 'background-option'}
              disabled={Boolean(busyMode)}
              onClick={() => void selectMode(option.mode, option.color)}
            >
              <span className="background-swatch" style={{ background: option.color }} />
              <span><strong>{busyMode === option.mode ? '正在美化…' : option.label}</strong><small>{option.description}</small></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
