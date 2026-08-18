'use client';

import { useState } from 'react';
import { PosterPreview } from '@/components/poster/PosterPreview';
import type { PosterDraft, PosterStyle } from '@/domain/project';
import { downloadDataUrl, posterFilename } from '@/lib/export/render-poster';
import { usePosterStore } from '@/store/use-poster-store';

const styleInfo: Record<PosterStyle, { name: string; description: string }> = {
  cute: {
    name: '可爱种草',
    description: '主体更突出，适合新品展示和第一眼吸引关注。'
  },
  daily: {
    name: '手作日常',
    description: '温柔的手作氛围，适合记录创作过程和生活片段。'
  },
  series: {
    name: '系列账号',
    description: '版式更稳定，适合连续发布同系列玩偶内容。'
  }
};

function PosterOption({
  draft,
  index,
  selected,
  saving,
  onSelect,
  onSave
}: {
  draft: PosterDraft;
  index: number;
  selected: boolean;
  saving: boolean;
  onSelect: (draft: PosterDraft) => void;
  onSave: (draft: PosterDraft, index: number) => void;
}) {
  const info = styleInfo[draft.style];

  return (
    <article className={selected ? 'poster-option selected' : 'poster-option'}>
      <button className="poster-select-button" type="button" onClick={() => onSelect(draft)} aria-label={`选择${info.name}方案`} aria-pressed={selected}>
        <PosterPreview draft={draft} />
      </button>
      <div className="poster-option-copy">
        <div>
          <strong>{info.name}</strong>
          <span>{info.description}</span>
        </div>
        <button className="poster-save-button primary-button" type="button" onClick={() => onSave(draft, index)} disabled={saving}>
          {saving ? '正在准备…' : '保存这张'}
        </button>
      </div>
    </article>
  );
}

export function ChooseScreen() {
  const upload = usePosterStore((state) => state.upload);
  const generation = usePosterStore((state) => state.generation);
  const selectedDraft = usePosterStore((state) => state.selectedDraft);
  const selectDraft = usePosterStore((state) => state.selectDraft);
  const setExportResult = usePosterStore((state) => state.setExportResult);
  const startGeneration = usePosterStore((state) => state.startGeneration);
  const goBack = usePosterStore((state) => state.goBack);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!generation) {
    return <main className="placeholder-screen"><p>还没有可选择的海报方案</p></main>;
  }

  const saveOne = async (draft: PosterDraft, index: number) => {
    const key = draft.style;
    if (savingKey) return;
    setSavingKey(key);
    setSaveError(null);
    selectDraft(draft);
    try {
      const dataUrl = draft.image.dataUrl;
      const filename = posterFilename(draft.style, index);
      setExportResult({ dataUrl, filename });
      downloadDataUrl(dataUrl, filename);
      setSavedKeys((current) => current.includes(key) ? current : [...current, key]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请长按海报图片保存');
    } finally {
      setSavingKey(null);
    }
  };

  const saveAll = async () => {
    if (savingKey) return;
    setSavingKey('all');
    setSaveError(null);
    try {
      for (const [index, draft] of generation.posters.entries()) {
        const dataUrl = draft.image.dataUrl;
        const filename = posterFilename(draft.style, index);
        setExportResult({ dataUrl, filename });
        downloadDataUrl(dataUrl, filename);
      }
      setSavedKeys(generation.posters.map((draft) => draft.style));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请长按海报图片保存');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <main className="app-shell choose-shell">
      <section className="choose-card" aria-labelledby="choose-title">
        <div className="choose-heading">
          <div>
            <p className="kicker">AI 已经做好 3 张</p>
            <h1 id="choose-title">选一张，直接保存</h1>
          </div>
          {upload && <img className="choose-upload-thumb" src={upload.dataUrl} alt="上传的玩偶照片小预览" />}
        </div>
        <button className="text-button choose-back-button" type="button" onClick={goBack}>换一张照片</button>
        <p className="choose-intro">三套方案都保留真实玩偶，AI 已直接完成背景、视觉元素、中文文案和排版。点击海报可选中，再保存你喜欢的版本。</p>
        {saveError && <p className="save-error" role="alert">{saveError}</p>}
        <div className="poster-options">
          {generation.posters.map((draft, index) => (
            <PosterOption
              key={draft.style}
              draft={draft}
              index={index}
              selected={selectedDraft?.style === draft.style}
              saving={savingKey === draft.style || savingKey === 'all'}
              onSelect={selectDraft}
              onSave={saveOne}
            />
          ))}
        </div>
        <button className="secondary-button save-all-button" type="button" onClick={saveAll} disabled={Boolean(savingKey)}>
          {savingKey === 'all' ? '正在准备 3 张图片…' : savedKeys.length === 3 ? '已保存全部 3 张' : '全部保存'}
        </button>
        <button className="text-button regenerate-button" type="button" onClick={startGeneration}>不喜欢？重新生成</button>
        <p className="privacy-note">文字和排版已经由 AI 直接生成在图片里；不需要再进入编辑页。</p>
      </section>
    </main>
  );
}
