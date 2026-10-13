'use client';

import { useEffect, useRef, useState } from 'react';
import { copyGenerationResponseSchema } from '@/server/ai/contracts';
import type { CopyGenerationResult } from '@/domain/project';
import { usePosterStore } from '@/store/use-poster-store';

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

function errorMessageFromBody(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('error' in body) || typeof body.error !== 'string') {
    return '文案生成服务暂时不可用，请重试';
  }
  return body.error;
}

export function CopyScreen() {
  const upload = usePosterStore((state) => state.upload);
  const generation = usePosterStore((state) => state.generation);
  const keywords = usePosterStore((state) => state.keywords);
  const creativeIdea = usePosterStore((state) => state.creativeIdea);
  const copyPrompt = usePosterStore((state) => state.copyPrompt);
  const copyResult = usePosterStore((state) => state.copyResult);
  const copyError = usePosterStore((state) => state.copyError);
  const setCopyPrompt = usePosterStore((state) => state.setCopyPrompt);
  const setCopyResult = usePosterStore((state) => state.setCopyResult);
  const setCopyError = usePosterStore((state) => state.setCopyError);
  const backToChoose = usePosterStore((state) => state.backToChoose);
  const [busy, setBusy] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedCopyIndex, setSelectedCopyIndex] = useState<number | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<string[]>(() => generation?.posters.map((poster) => poster.style) ?? []);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  if (!upload || !generation?.posters.length) {
    return <main className="placeholder-screen"><p>请先生成海报</p></main>;
  }

  const selectedPosters = generation.posters.filter((poster) => selectedStyles.includes(poster.style));
  const togglePoster = (style: string) => {
    setSelectedStyles((current) => current.includes(style) ? current.filter((item) => item !== style) : [...current, style]);
    setSelectedCopyIndex(null);
    setCopyResult(null);
    setCopyError('');
  };

  const generateCopy = async () => {
    if (busy || selectedPosters.length === 0) return;
    setBusy(true);
    setSelectedCopyIndex(null);
    setCopyError('');
    const controller = new AbortController();
    requestRef.current = controller;
    const currentRequest = () => {
      const state = usePosterStore.getState();
      return !controller.signal.aborted && requestRef.current === controller && state.step === 'copy' && state.upload?.dataUrl === upload.dataUrl && state.generation === generation;
    };
    try {
      const posterDataUrls = await Promise.all(selectedPosters.map((poster) => imageSourceToDataUrl(poster.image.dataUrl)));
      if (!currentRequest()) return;
      const form = new FormData();
      form.append('originalImageDataUrl', upload.dataUrl);
      form.append('originalWidth', String(upload.width));
      form.append('originalHeight', String(upload.height));
      form.append('posters', JSON.stringify(selectedPosters.map((poster, index) => ({
        imageDataUrl: posterDataUrls[index], width: poster.image.width, height: poster.image.height,
        style: poster.style, copy: poster.copy
      }))));
      form.append('keywords', keywords);
      form.append('creativeIdea', creativeIdea);
      form.append('prompt', copyPrompt);

      const response = await fetch('/api/copy', { method: 'POST', body: form, signal: controller.signal });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error('文案生成结果格式异常，请重试');
      }
      if (!response.ok) throw new Error(errorMessageFromBody(body));
      const parsed = copyGenerationResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error('文案生成结果格式异常，请重试');
      if (currentRequest()) setCopyResult(parsed.data as CopyGenerationResult);
    } catch (error) {
      if (currentRequest()) setCopyError(error instanceof Error ? error.message : '文案生成服务暂时不可用，请重试');
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setBusy(false); }
    }
  };

  const copyVariant = async (index: number, variant: CopyGenerationResult['variants'][number]) => {
    const text = `${variant.title}\n\n${variant.body}\n\n${variant.tags.join(' ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => current === index ? null : current), 1600);
    } catch {
      setCopyError('复制失败，请长按文字手动复制');
    }
  };

  return (
    <main className="app-shell copy-shell">
      <section className="copy-card" aria-labelledby="copy-title">
        <div className="copy-heading">
          <div>
            <p className="kicker">可选步骤 · 不生成不收费</p>
            <h1 id="copy-title">为这组海报写文案</h1>
          </div>
          <div className="copy-thumbnails">
            <img src={upload.dataUrl} alt="原始玩偶照片" />
            {selectedPosters.map((poster, index) => <img key={poster.style} src={poster.image.dataUrl} alt={`已选中的第 ${index + 1} 张 AI 海报`} />)}
          </div>
        </div>
        <button className="text-button choose-back-button" type="button" onClick={backToChoose}>返回海报选择</button>
        <p className="copy-intro">默认使用本次全部成图。你可以勾选 1–3 张，让 AI 为这一组图片写一篇可发布的小红书文案，并给出 3 种写法。</p>
        <fieldset className="copy-select-grid"><legend>选择要一起发布的海报</legend>{generation.posters.map((poster, index) => <label className="copy-select-option" key={poster.style}>
          <input type="checkbox" checked={selectedStyles.includes(poster.style)} disabled={busy} onChange={() => togglePoster(poster.style)} aria-label={`选择方案 ${String.fromCharCode(65 + index)}`} />
          <img src={poster.image.dataUrl} alt="" /><span>方案 {String.fromCharCode(65 + index)}</span>
        </label>)}</fieldset>
        <label className="field-label" htmlFor="copy-prompt">你想让文案怎么写？</label>
        <textarea
          id="copy-prompt"
          className="copy-prompt-input"
          value={copyPrompt}
          onChange={(event) => setCopyPrompt(event.target.value)}
          maxLength={500}
          placeholder="例如：像朋友分享手作日常，真诚、轻松，有陪伴感，不要营销腔。"
        />
        {copyError && <p className="save-error" role="alert">{copyError}</p>}
        <button className="primary-button copy-generate-button" type="button" onClick={generateCopy} disabled={busy || selectedPosters.length === 0}>
          {busy ? '正在生成 3 组文案…' : copyResult ? '重新生成文案' : '生成小红书文案'}
        </button>
        {copyResult && <div className="copy-results" aria-label="文案结果">
          {copyResult.variants.map((variant, index) => (
            <article className={selectedCopyIndex === index ? 'copy-option selected' : 'copy-option'} key={`${variant.angle}-${index}`}>
              <button className="copy-option-choice" type="button" aria-label={`选择文案方案 ${String.fromCharCode(65 + index)}`} aria-pressed={selectedCopyIndex === index} onClick={() => setSelectedCopyIndex(index)}>
                <span className="copy-option-topline"><span>{variant.angle}</span><span>方案 {String.fromCharCode(65 + index)}</span></span>
                <strong>{variant.title}</strong>
                <span className="copy-option-body">{variant.body}</span>
                <span className="copy-tags">{variant.tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
              </button>
            </article>
          ))}
          <button className="primary-button copy-copy-button" type="button" disabled={selectedCopyIndex === null} onClick={() => { if (selectedCopyIndex !== null) void copyVariant(selectedCopyIndex, copyResult.variants[selectedCopyIndex]); }}>
            {copiedIndex === selectedCopyIndex && selectedCopyIndex !== null ? '已复制' : '复制选中文案'}
          </button>
        </div>}
        <p className="privacy-note">原始图片和勾选的海报只用于本次文案生成，不会影响已暂存的海报。</p>
      </section>
    </main>
  );
}
