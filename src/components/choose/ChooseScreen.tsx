'use client';

import { useState } from 'react';
import { PosterPreview } from '@/components/poster/PosterPreview';
import { defaultResearchSummary, type PosterDraft, type PosterStyle } from '@/domain/project';
import { downloadDataUrl, posterFilename } from '@/lib/export/render-poster';
import { usePosterStore } from '@/store/use-poster-store';

const styleInfo: Record<PosterStyle, { name: string; description: string; fallbackNote: string }> = {
  cute: {
    name: '可爱种草',
    description: '主体更突出，适合新品展示和第一眼吸引关注。',
    fallbackNote: '以主体保真为前提，强调清晰视觉重心。'
  },
  daily: {
    name: '手作日常',
    description: '温柔的手作氛围，适合记录创作过程和生活片段。',
    fallbackNote: '用真实材质和轻量生活场景营造陪伴感。'
  },
  series: {
    name: '系列账号',
    description: '版式更稳定，适合连续发布同系列玩偶内容。',
    fallbackNote: '用稳定的信息层级保持系列发布的一致性。'
  },
  lifestyle: {
    name: '动态方案 A',
    description: '根据这次上传图片和创作想法独立发散的视觉方案。',
    fallbackNote: '根据主体、想法和参考资料动态形成的设计判断。'
  },
  story: {
    name: '动态方案 B',
    description: '根据这次上传图片和创作想法独立发散的视觉方案。',
    fallbackNote: '根据主体、想法和参考资料动态形成的设计判断。'
  },
  editorial: {
    name: '动态方案 C',
    description: '根据这次上传图片和创作想法独立发散的视觉方案。',
    fallbackNote: '根据主体、想法和参考资料动态形成的设计判断。'
  }
};

const TASK_ASSET_URL = /^\/api\/tasks\/[A-Za-z0-9_-]{8,100}\?asset=(?:lifestyle|story|editorial|cute|daily|series)$/;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function imageSourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:image/')) return source;
  if (!TASK_ASSET_URL.test(source)) throw new Error('海报图片地址异常，请重试');
  const response = await fetch(source, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('海报图片暂时无法读取，请重试');
  const contentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  if (!/^image\/[a-z0-9.+-]+$/i.test(contentType)) throw new Error('海报图片格式异常，请重试');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('海报图片格式异常，请重试');
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

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
  const fallbackInfo = styleInfo[draft.style];
  const info = {
    ...fallbackInfo,
    name: draft.design?.label?.trim() || fallbackInfo.name,
    description: draft.design?.concept?.trim() || fallbackInfo.description
  };

  return (
    <article className={selected ? 'poster-option selected' : 'poster-option'}>
      <button className="poster-select-button" type="button" onClick={() => onSelect(draft)} aria-label={`选择${info.name}`} aria-pressed={selected}>
        <PosterPreview draft={draft} />
      </button>
      <div className="poster-option-copy">
        <div>
          <strong>{info.name}</strong>
          <span>{info.description}</span>
          <span className="poster-option-note">{draft.designNote || info.fallbackNote}</span>
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
  const openCopyComposer = usePosterStore((state) => state.openCopyComposer);
  const goBack = usePosterStore((state) => state.goBack);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!generation) {
    return <main className="placeholder-screen"><p>还没有可选择的海报方案</p></main>;
  }

  const posters = Array.isArray(generation.posters) ? generation.posters : [];
  const posterCount = posters.length;
  const research = generation.research ?? defaultResearchSummary;
  const allSaved = posterCount > 0 && savedKeys.length === posterCount;

  const saveOne = async (draft: PosterDraft, index: number) => {
    const key = draft.style;
    if (savingKey) return;
    setSavingKey(key);
    setSaveError(null);
    selectDraft(draft);
    try {
      const dataUrl = await imageSourceToDataUrl(draft.image.dataUrl);
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
      for (const [index, draft] of posters.entries()) {
        const dataUrl = await imageSourceToDataUrl(draft.image.dataUrl);
        const filename = posterFilename(draft.style, index);
        setExportResult({ dataUrl, filename });
        downloadDataUrl(dataUrl, filename);
      }
      setSavedKeys(posters.map((draft) => draft.style));
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
            <p className="kicker">{posterCount > 0 ? `AI 已经做好 ${posterCount} 张` : 'AI 生成没有完成'}</p>
            <h1 id="choose-title">{posterCount > 0 ? '选一张，直接保存' : '这次没有生成合格的海报'}</h1>
          </div>
          {upload && <img className="choose-upload-thumb" src={upload.dataUrl} alt="上传的玩偶照片小预览" />}
        </div>
        <button className="text-button choose-back-button" type="button" onClick={goBack}>换一张照片</button>
        <p className="choose-intro">{posterCount > 0 ? `这 ${posterCount} 套方案都保留真实玩偶，AI 已直接完成背景、视觉元素、中文文案和排版。点击海报可选中，再保存你喜欢的版本。` : '原图和创作想法已经保留，可以重新生成一次。'}</p>
        <p className="research-note">参考研究：{research.composition} 配色：{research.palette}</p>
        {generation.warnings && generation.warnings.length > 0 && (
          <div className="choose-warnings" role="status" aria-label="生成提示">
            {generation.warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}
          </div>
        )}
        {saveError && <p className="save-error" role="alert">{saveError}</p>}
        {posterCount > 0 ? <div className="poster-options">
          {posters.map((draft, index) => (
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
        </div> : <div className="choose-empty" role="status"><p>暂时没有可保存的海报，请重新生成。</p></div>}
        {posterCount > 0 && <button className="secondary-button save-all-button" type="button" onClick={saveAll} disabled={Boolean(savingKey)}>
          {savingKey === 'all' ? `正在准备 ${posterCount} 张图片…` : allSaved ? `已保存全部 ${posterCount} 张` : `全部保存 ${posterCount} 张`}
        </button>}
        {posterCount > 0 && <button className="primary-button copy-entry-button" type="button" aria-label="生成小红书文案" onClick={openCopyComposer} disabled={!selectedDraft || Boolean(savingKey)}>
          {selectedDraft ? '生成小红书文案' : '先选择一张海报，再生成文案'}
        </button>}
        <button className="text-button regenerate-button" type="button" onClick={startGeneration}>不喜欢？重新生成</button>
        <p className="privacy-note">海报保存不受文案功能影响；只有点击下一步并再次确认生成时，才会调用文案模型。</p>
      </section>
    </main>
  );
}
