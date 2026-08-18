'use client';

import { useEffect, useRef, useState } from 'react';
import type { GenerationResult, ImageAsset } from '@/domain/project';
import { StatusBanner } from '@/components/common/StatusBanner';
import { usePosterStore } from '@/store/use-poster-store';

const phases = ['正在识别玩偶', '正在生成文案', '正在制作 3 套方案'] as const;
const firstPhaseDuration = 1200;
const secondPhaseDuration = 1800;

function errorMessageFromResponse(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error = body.error;
  return typeof error === 'string' && error.trim() ? error : null;
}

async function readGenerationResponse(response: Response): Promise<GenerationResult> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.ok ? '生成结果格式异常，请重试' : '生成服务暂时不可用，请重试');
  }

  if (!response.ok) {
    throw new Error(errorMessageFromResponse(body) ?? '生成服务暂时不可用，请重试');
  }

  if (typeof body !== 'object' || body === null || !('posters' in body) || !Array.isArray(body.posters)) {
    throw new Error('生成结果格式异常，请重试');
  }
  return body as GenerationResult;
}

function appendGenerationInput(form: FormData, upload: ImageAsset, keywords: string, forbiddenWords: string, creativeIdea: string) {
  form.append('imageDataUrl', upload.dataUrl);
  form.append('width', String(upload.width));
  form.append('height', String(upload.height));
  form.append('keywords', keywords);
  form.append('forbiddenWords', forbiddenWords);
  form.append('creativeIdea', creativeIdea);
}

function userFacingGenerationError(error: unknown): string {
  if (!(error instanceof Error)) return '生成服务暂时不可用，请重试';
  if (/failed to fetch|networkerror|网络|network/i.test(error.message)) {
    return error.message === '网络暂时不可用' ? error.message : '网络连接中断，请检查网络后重试';
  }
  return error.message || '生成服务暂时不可用，请重试';
}

export function GenerationScreen() {
  const step = usePosterStore((state) => state.step);
  const upload = usePosterStore((state) => state.upload);
  const keywords = usePosterStore((state) => state.keywords);
  const forbiddenWords = usePosterStore((state) => state.forbiddenWords);
  const creativeIdea = usePosterStore((state) => state.creativeIdea);
  const error = usePosterStore((state) => state.error);
  const setGeneration = usePosterStore((state) => state.setGeneration);
  const failGeneration = usePosterStore((state) => state.failGeneration);
  const startGeneration = usePosterStore((state) => state.startGeneration);
  const goBack = usePosterStore((state) => state.goBack);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const inputRef = useRef<{ upload: ImageAsset; keywords: string; forbiddenWords: string; creativeIdea: string } | null>(null);

  inputRef.current = upload ? { upload, keywords, forbiddenWords, creativeIdea } : null;

  useEffect(() => {
    if (step !== 'generating') return;

    const controller = new AbortController();
    const input = inputRef.current;
    setPhaseIndex(0);

    const phaseOneTimer = window.setTimeout(() => setPhaseIndex(1), firstPhaseDuration);
    const phaseTwoTimer = window.setTimeout(() => setPhaseIndex(2), firstPhaseDuration + secondPhaseDuration);

    if (input) {
      const form = new FormData();
      appendGenerationInput(form, input.upload, input.keywords, input.forbiddenWords, input.creativeIdea);

      void fetch('/api/generate', {
        method: 'POST',
        body: form,
        signal: controller.signal
      })
        .then(readGenerationResponse)
        .then((generation) => {
          if (!controller.signal.aborted) setGeneration(generation);
        })
        .catch((requestError: unknown) => {
          if (controller.signal.aborted) return;
          failGeneration(userFacingGenerationError(requestError));
        });
    }

    return () => {
      window.clearTimeout(phaseOneTimer);
      window.clearTimeout(phaseTwoTimer);
      controller.abort();
    };
  }, [step, failGeneration, setGeneration]);

  if (error) {
    return (
      <main className="app-shell generation-shell">
        <section className="generation-card" aria-labelledby="generation-error-title">
          <p className="kicker">先保留你的原图</p>
          <h1 id="generation-error-title">这次生成没有完成</h1>
          {upload && <img className="generation-upload-preview" src={upload.dataUrl} alt="已上传的玩偶照片" />}
          <StatusBanner message={error} />
          <div className="generation-actions">
            <button className="primary-button" type="button" onClick={startGeneration}>重新生成</button>
            <button className="secondary-button" type="button" onClick={goBack}>返回修改</button>
          </div>
        </section>
      </main>
    );
  }

  if (!upload) {
    return <main className="placeholder-screen"><p>请先上传玩偶照片</p></main>;
  }

  return (
    <main className="app-shell generation-shell">
      <section className="generation-card" aria-labelledby="generation-title">
        <p className="kicker">AI 正在准备你的海报</p>
        <div className="generation-upload-wrap">
          <img className="generation-upload-preview" src={upload.dataUrl} alt="已上传的玩偶照片" />
        </div>
        <h1 id="generation-title" aria-live="polite">{phases[phaseIndex]}</h1>
        <p className="generation-intro">会保留玩偶的主体轮廓和细节，同时完成背景、美化、文案和排版。</p>
        <ol className="generation-phases" aria-label="生成阶段">
          {phases.map((phase, index) => (
            <li key={phase} className={index === phaseIndex ? 'generation-phase active' : index < phaseIndex ? 'generation-phase complete' : 'generation-phase'}>
              <span className="generation-phase-marker" aria-hidden="true">{index < phaseIndex ? '✓' : index + 1}</span>
              <span>{phase}</span>
            </li>
          ))}
        </ol>
        <button className="secondary-button generation-back-button" type="button" onClick={goBack}>返回修改</button>
      </section>
    </main>
  );
}
