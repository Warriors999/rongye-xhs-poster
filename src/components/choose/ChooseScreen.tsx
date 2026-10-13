'use client';

import { useEffect, useState } from 'react';
import { PosterPreview } from '@/components/poster/PosterPreview';
import { defaultResearchSummary, type PosterDraft, type PosterStyle } from '@/domain/project';
import { posterFilename, saveImage } from '@/lib/export/render-poster';
import { imageSourceToDataUrl } from '@/lib/projects/image-source';
import { createProjectSnapshot, projectLibrary } from '@/lib/projects/project-library';
import { pendingGeneration } from '@/lib/projects/pending-generation';
import { usePosterStore } from '@/store/use-poster-store';

const styleNames: Record<PosterStyle, string> = { cute: '可爱种草', daily: '手作日常', series: '系列账号', lifestyle: '动态方案 A', story: '动态方案 B', editorial: '动态方案 C' };

function PosterOption({ draft, selected, busy, onSelect, onSave, onRemake }: {
  draft: PosterDraft;
  selected: boolean;
  busy: boolean;
  onSelect: (draft: PosterDraft) => void;
  onSave: () => void;
  onRemake: (feedback: string) => void;
}) {
  const [remaking, setRemaking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const name = draft.design?.label?.trim() || styleNames[draft.style];
  return (
    <article className={selected ? 'poster-option selected' : 'poster-option'}>
      <button className="poster-select-button" type="button" onClick={() => onSelect(draft)} aria-label={`选择${name}`} aria-pressed={selected}>
        <PosterPreview draft={draft} />
      </button>
      <div className="poster-option-copy">
        <strong>{name}</strong>
        <p>{draft.designNote || draft.design?.concept || '保留真实主体，突出清晰的视觉重心。'}</p>
      </div>
      <div className="poster-option-actions">
        <button className="poster-save-button primary-button" type="button" onClick={onSave} disabled={busy}>{busy ? '正在准备…' : '下载这张'}</button>
        <button className="secondary-button" type="button" onClick={() => setRemaking((current) => !current)} disabled={busy}>调整这张</button>
      </div>
      {remaking && <form className="remake-form" onSubmit={(event) => { event.preventDefault(); if (feedback.trim()) onRemake(feedback); }}>
        <label htmlFor={`revision-${draft.style}`}>想怎么调整这张？</label>
        <textarea id={`revision-${draft.style}`} className="revision-input" value={feedback} maxLength={500} rows={3} onChange={(event) => setFeedback(event.target.value)} placeholder="例如：背景更干净，标题大一点，保留玩偶原貌" />
        <p>只调整这一张，其他海报会保留。</p>
        <button className="primary-button" type="submit" disabled={!feedback.trim() || busy}>只重做这张</button>
      </form>}
      <details className="prompt-details">
        <summary>查看生成提示词</summary>
        <p>{draft.finalPrompt || '这份作品没有保存生成提示词。新生成的作品会显示完整提示词。'}</p>
      </details>
    </article>
  );
}

export function ChooseScreen() {
  const upload = usePosterStore((state) => state.upload);
  const generation = usePosterStore((state) => state.generation);
  const promptPlan = usePosterStore((state) => state.promptPlan);
  const selectedDraft = usePosterStore((state) => state.selectedDraft);
  const error = usePosterStore((state) => state.error);
  const selectDraft = usePosterStore((state) => state.selectDraft);
  const setExportResult = usePosterStore((state) => state.setExportResult);
  const regenerateOne = usePosterStore((state) => state.regenerateOne);
  const retryMissingPoster = usePosterStore((state) => state.retryMissingPoster);
  const startGeneration = usePosterStore((state) => state.startDesign);
  const openCopyComposer = usePosterStore((state) => state.openCopyComposer);
  const goBack = usePosterStore((state) => state.goBack);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [downloadedKeys, setDownloadedKeys] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!upload || !generation?.posters.length) return;
    let active = true;
    const snapshot = usePosterStore.getState();
    setProjectNotice('正在自动暂存最近一次结果…');
    void createProjectSnapshot(snapshot)
      .then(async (project) => {
        if (!active) return;
        await projectLibrary.saveLatest(project);
        await pendingGeneration.clearAfterSavedGeneration(generation).catch(() => undefined);
      })
      .then(() => { if (active) setProjectNotice('已自动暂存最近一次结果，仅此浏览器可恢复。'); })
      .catch(() => { if (active) setProjectNotice('自动暂存失败，请先下载图片。'); });
    return () => { active = false; };
  }, [generation, upload]);

  if (!generation) return <main className="placeholder-screen"><p>还没有可选择的海报方案</p></main>;
  const posters = Array.isArray(generation.posters) ? generation.posters : [];
  const posterCount = posters.length;
  const missingPosters = promptPlan?.posters.map((poster, index) => ({ poster, index }))
    .filter(({ poster }) => !posters.some((ready) => ready.style === poster.style)) ?? [];
  const research = generation.research ?? defaultResearchSummary;
  const allDownloaded = posterCount > 0 && posters.every((poster) => downloadedKeys.includes(poster.image.id));

  const saveOne = async (draft: PosterDraft, index: number) => {
    if (savingKey) return;
    setSavingKey(draft.style);
    setSaveError(null);
    setSaveNotice(null);
    selectDraft(draft);
    try {
      const dataUrl = await imageSourceToDataUrl(draft.image.dataUrl);
      const filename = posterFilename(draft.style, index);
      const result = await saveImage(dataUrl, filename);
      if (result !== 'cancelled') {
        setExportResult({ dataUrl, filename });
        setDownloadedKeys((current) => [...new Set([...current, draft.image.id])]);
        setSaveNotice(result === 'shared' ? '已打开系统分享，请在系统菜单中保存图片。' : '已发起下载，可在浏览器下载记录中查看。');
      }
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : '下载失败，请长按图片保存');
    } finally { setSavingKey(null); }
  };

  const saveAll = async () => {
    if (savingKey) return;
    setSavingKey('all');
    setSaveError(null);
    try {
      for (const [index, draft] of posters.entries()) {
        const dataUrl = await imageSourceToDataUrl(draft.image.dataUrl);
        const filename = posterFilename(draft.style, index);
        await saveImage(dataUrl, filename, { preferShare: false });
        setExportResult({ dataUrl, filename });
        setDownloadedKeys((current) => [...new Set([...current, draft.image.id])]);
      }
      setSaveNotice('已发起全部图片下载，可在浏览器下载记录中查看。');
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : '下载失败，请长按图片保存');
    } finally { setSavingKey(null); }
  };

  return (
    <main className="app-shell choose-shell">
      <section className="choose-card" aria-labelledby="choose-title">
        <div className="choose-heading">
          <div><p className="kicker">{posterCount > 0 ? `AI 已经做好 ${posterCount} 张` : 'AI 生成没有完成'}</p><h1 id="choose-title">{posterCount > 0 ? '找到你喜欢的那一张' : '这次没有生成合格的海报'}</h1></div>
          {upload && <img className="choose-upload-thumb" src={upload.dataUrl} alt="上传的玩偶照片小预览" />}
        </div>
        <p className="choose-intro">{posterCount > 0 ? '选中海报，下载或提出调整建议。本次结果会自动暂存到当前浏览器。' : '原图和创作想法已经保留，可以重新生成一次。'}</p>
        {(error || saveError) && <p className="save-error" role="alert">{error || saveError}</p>}
        {saveNotice && <p className="library-notice" role="status">{saveNotice}</p>}
        {projectNotice && <p className="library-notice" role="status" aria-label="作品保存状态">{projectNotice}</p>}
        {generation.warnings && generation.warnings.length > 0 && <div className="choose-warnings" role="status" aria-label="生成提示">{generation.warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}</div>}
        {missingPosters.length > 0 && <div className="missing-posters"><p>已完成的图片保留在这里。失败的方案可以单独补生成，不会重新生成其他图片。</p>{missingPosters.map(({ poster, index }) => <button key={poster.style} className="secondary-button" type="button" onClick={() => retryMissingPoster(poster.style)}>只补生成方案 {String.fromCharCode(65 + index)}</button>)}</div>}
        {posterCount > 0 ? <div className="poster-options">{posters.map((draft, index) => <PosterOption key={draft.image.id + draft.style} draft={draft} selected={selectedDraft?.style === draft.style} busy={Boolean(savingKey)} onSelect={selectDraft} onSave={() => void saveOne(draft, index)} onRemake={(feedback) => regenerateOne(draft, feedback)} />)}</div> : <div className="choose-empty" role="status"><p>暂时没有可下载的海报，请重新生成。</p></div>}
        {posterCount > 0 && <div className="choose-actions">
          <button className="secondary-button save-all-button" type="button" onClick={() => void saveAll()} disabled={Boolean(savingKey)}>{savingKey === 'all' ? `正在准备 ${posterCount} 张图片…` : allDownloaded ? `已发起全部 ${posterCount} 张下载` : `全部下载 ${posterCount} 张`}</button>
          <button className="secondary-button copy-entry-button" type="button" aria-label="生成小红书文案" onClick={openCopyComposer} disabled={Boolean(savingKey)}>用本次 {posterCount} 张生成文案</button>
        </div>}
        <details className="prompt-details research-details"><summary>查看本次设计依据</summary><p className="research-note">参考研究：{research.composition} 配色：{research.palette}</p></details>
        <div className="choose-actions"><button className="text-button choose-back-button" type="button" onClick={goBack}>换一张照片</button><button className="text-button regenerate-button" type="button" onClick={startGeneration}>{posterCount ? '重新生成全部方案' : '不喜欢？重新生成'}</button></div>
        <p className="privacy-note">最近一次结果自动保存在此浏览器；清除浏览器数据后无法恢复，请下载喜欢的图片。生成发布文案为可选操作。</p>
      </section>
    </main>
  );
}
