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
  const selectedDraft = usePosterStore((state) => state.selectedDraft);
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
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  if (!upload || !selectedDraft) {
    return <main className="placeholder-screen"><p>请先选择一张海报</p></main>;
  }

  const generateCopy = async () => {
    if (busy) return;
    setBusy(true);
    setCopyError('');
    const controller = new AbortController();
    requestRef.current = controller;
    const currentRequest = () => {
      const state = usePosterStore.getState();
      return !controller.signal.aborted && requestRef.current === controller && state.step === 'copy' && state.upload?.dataUrl === upload.dataUrl && state.selectedDraft?.image.dataUrl === selectedDraft.image.dataUrl && state.selectedDraft?.style === selectedDraft.style;
    };
    try {
      const posterDataUrl = await imageSourceToDataUrl(selectedDraft.image.dataUrl);
      if (!currentRequest()) return;
      const form = new FormData();
      form.append('originalImageDataUrl', upload.dataUrl);
      form.append('originalWidth', String(upload.width));
      form.append('originalHeight', String(upload.height));
      form.append('posterImageDataUrl', posterDataUrl);
      form.append('posterWidth', String(selectedDraft.image.width));
      form.append('posterHeight', String(selectedDraft.image.height));
      form.append('selectedStyle', selectedDraft.style);
      form.append('selectedPosterCopy', JSON.stringify(selectedDraft.copy));
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
            <h1 id="copy-title">为这张海报写文案</h1>
          </div>
          <div className="copy-thumbnails">
            <img src={upload.dataUrl} alt="原始玩偶照片" />
            <img src={selectedDraft.image.dataUrl} alt="已选中的 AI 海报" />
          </div>
        </div>
        <button className="text-button choose-back-button" type="button" onClick={backToChoose}>返回海报选择</button>
        <p className="copy-intro">AI 会同时看原始玩偶照片和这张海报，再结合你的想法生成 3 组不同方向。你可以保存海报后再决定要不要生成。</p>
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
        <button className="primary-button copy-generate-button" type="button" onClick={generateCopy} disabled={busy}>
          {busy ? '正在生成 3 组文案…' : copyResult ? '重新生成文案' : '生成小红书文案'}
        </button>
        {copyResult && <div className="copy-results" aria-label="文案结果">
          {copyResult.variants.map((variant, index) => (
            <article className="copy-option" key={`${variant.angle}-${index}`}>
              <div className="copy-option-topline"><span>{variant.angle}</span><span>方案 {String.fromCharCode(65 + index)}</span></div>
              <h2>{variant.title}</h2>
              <p>{variant.body}</p>
              <div className="copy-tags">{variant.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <button className="secondary-button copy-copy-button" type="button" onClick={() => void copyVariant(index, variant)}>
                {copiedIndex === index ? '已复制' : '复制这组文案'}
              </button>
            </article>
          ))}
        </div>}
        <p className="privacy-note">原始图片和海报只用于本次文案生成，不会影响已经保存的海报。</p>
      </section>
    </main>
  );
}
