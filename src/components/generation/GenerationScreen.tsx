'use client';

import { useEffect, useRef, useState } from 'react';
import type { GenerationResult, ImageAsset, PosterDraft } from '@/domain/project';
import { StatusBanner } from '@/components/common/StatusBanner';
import { imageSourceToDataUrl } from '@/lib/projects/image-source';
import { createPendingGenerationTask, pendingGeneration, type PendingGenerationTask } from '@/lib/projects/pending-generation';
import { taskStatusResponseSchema } from '@/server/async/task-response';
import { usePosterStore } from '@/store/use-poster-store';

const phases = [
  '正在识别玩偶',
  '正在理解你的想法',
  '正在研究视觉参考',
  '正在形成 3 个设计方向',
  '正在生成 3 张微海报',
  '正在整理图片与下载'
] as const;
const phaseIndexes: Record<string, number> = {
  queued: 0,
  recognizing: 0,
  understanding: 1,
  researching: 2,
  designing: 3,
  generating: 4,
  checking: 5,
  completed: 5
};

function errorMessageFromResponse(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const error = body.error;
  const safeMessages = new Set([
    '请求体过大，请压缩后重试',
    '请求格式无效',
    '请求参数无效，请检查图片、关键词和禁止词',
    '图片文件过大，请压缩后重试',
    '生成服务超时，请重试',
    '生成服务暂时不可用，请重试',
    '图片美化服务暂时不可用，请重试',
    '图片美化结果格式异常，请重试'
  ]);
  return typeof error === 'string' && safeMessages.has(error) ? error : null;
}

class FinishedTaskError extends Error {}
type TaskResult = NonNullable<ReturnType<typeof taskStatusResponseSchema.parse>['result']>;

async function readJson(response: Response): Promise<unknown> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.ok ? '生成结果格式异常，请重试' : '生成服务暂时不可用，请重试');
  }

  return body;
}

async function readTaskSubmission(response: Response): Promise<string> {
  const body = await readJson(response);
  if (!response.ok || response.status !== 202 || typeof body !== 'object' || body === null || !('taskId' in body) || typeof body.taskId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.taskId) || !('status' in body) || body.status !== 'queued') {
    throw new Error(errorMessageFromResponse(body) ?? '生成服务暂时不可用，请重试');
  }
  return body.taskId;
}

async function generationFromTaskResult(result: TaskResult, signal: AbortSignal, imageCache: Map<string, PosterDraft>): Promise<GenerationResult> {
  if (result.posters.some((poster) => !poster.design)) throw new Error('生成结果格式异常，请重试');
  const posters: PosterDraft[] = [];
  let firstError: unknown;
  for (const poster of result.posters) {
    const cached = imageCache.get(poster.image.assetUrl);
    if (cached) { posters.push(cached); continue; }
    try {
      const dataUrl = await imageSourceToDataUrl(poster.image.assetUrl, { signal });
      const draft: PosterDraft = {
        ...poster,
        image: {
          id: poster.image.id,
          dataUrl,
          width: poster.image.width,
          height: poster.image.height,
          source: poster.image.source,
          ...(poster.image.mode ? { mode: poster.image.mode } : {})
        }
      };
      imageCache.set(poster.image.assetUrl, draft);
      posters.push(draft);
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
  return {
    analysis: result.analysis,
    research: result.research,
    warnings: result.warnings,
    posters
  };
}

async function readTaskStatus(response: Response) {
  const body = await readJson(response);
  if (response.status === 404) throw new FinishedTaskError('任务不存在或已过期，请重新生成');
  if (!response.ok) throw new Error(errorMessageFromResponse(body) ?? '生成服务暂时不可用，请重试');
  const parsed = taskStatusResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error('生成结果格式异常，请重试');
  if (parsed.data.status === 'failed') throw new FinishedTaskError(parsed.data.error ?? '生成服务暂时不可用，请重试');
  if (parsed.data.status === 'succeeded' && !parsed.data.result) throw new Error('生成结果格式异常，请重试');
  return parsed.data;
}

function appendGenerationInput(form: FormData, upload: ImageAsset, keywords: string, forbiddenWords: string, creativeIdea: string, referenceImage: ImageAsset | null, target: PosterDraft | null, revisionPrompt: string) {
  form.append(target ? 'originalImageDataUrl' : 'imageDataUrl', upload.dataUrl);
  form.append('width', String(upload.width));
  form.append('height', String(upload.height));
  form.append('keywords', keywords);
  form.append('forbiddenWords', forbiddenWords);
  form.append('creativeIdea', creativeIdea);
  if (referenceImage) {
    form.append('referenceImageDataUrl', referenceImage.dataUrl);
    form.append('referenceWidth', String(referenceImage.width));
    form.append('referenceHeight', String(referenceImage.height));
  }
  if (target) {
    form.append('targetStyle', target.style);
    form.append('revisionPrompt', revisionPrompt);
    form.append('selectedPosterDesign', JSON.stringify(target.design));
    form.append('selectedPosterCopy', JSON.stringify(target.copy));
  }
}

function userFacingGenerationError(error: unknown): string {
  if (!(error instanceof Error)) return '生成服务暂时不可用，请重试';
  if (/failed to fetch|networkerror|网络|network/i.test(error.message)) {
    return error.message === '网络暂时不可用' ? error.message : '网络连接中断，请检查网络后重试';
  }
  return error.message || '生成服务暂时不可用，请重试';
}

function isTemporaryTaskReadError(error: unknown): boolean {
  return !(error instanceof FinishedTaskError) && (error instanceof TypeError || (error instanceof Error && /network|fetch|网络|暂时不可用|暂时无法读取/i.test(error.message)));
}

function matchesSubmittedTask(task: PendingGenerationTask, input: { upload: ImageAsset; keywords: string; forbiddenWords: string; creativeIdea: string; referenceImage: ImageAsset | null; target: PosterDraft | null; revisionPrompt: string }, promptPlan: GenerationResult | null): boolean {
  const saved = task.snapshot;
  return saved.upload.dataUrl === input.upload.dataUrl
    && saved.keywords === input.keywords
    && saved.forbiddenWords === input.forbiddenWords
    && saved.creativeIdea === input.creativeIdea
    && saved.referenceImage?.dataUrl === input.referenceImage?.dataUrl
    && saved.regenerationTarget?.style === input.target?.style
    && saved.revisionPrompt === input.revisionPrompt
    && JSON.stringify(saved.regenerationTarget?.design) === JSON.stringify(input.target?.design)
    && JSON.stringify(saved.regenerationTarget?.copy) === JSON.stringify(input.target?.copy)
    && JSON.stringify(saved.promptPlan?.posters.map((poster) => poster.finalPrompt)) === JSON.stringify(promptPlan?.posters.map((poster) => poster.finalPrompt));
}

export function GenerationScreen() {
  const step = usePosterStore((state) => state.step);
  const upload = usePosterStore((state) => state.upload);
  const keywords = usePosterStore((state) => state.keywords);
  const forbiddenWords = usePosterStore((state) => state.forbiddenWords);
  const creativeIdea = usePosterStore((state) => state.creativeIdea);
  const referenceImage = usePosterStore((state) => state.referenceImage);
  const regenerationTarget = usePosterStore((state) => state.regenerationTarget);
  const revisionPrompt = usePosterStore((state) => state.revisionPrompt);
  const promptPlan = usePosterStore((state) => state.promptPlan);
  const error = usePosterStore((state) => state.error);
  const setGeneration = usePosterStore((state) => state.setGeneration);
  const failGeneration = usePosterStore((state) => state.failGeneration);
  const startGeneration = usePosterStore((state) => state.startGeneration);
  const goBack = usePosterStore((state) => state.goBack);
  const confirmBack = () => {
    if (window.confirm('图片任务已经提交。返回后将停止等待，服务端可能继续处理。确定返回吗？')) goBack();
  };
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [recoveryWarning, setRecoveryWarning] = useState<string | null>(null);
  const shownPhases = regenerationTarget ? phases.map((phase, index) => index === 3 ? '正在调整这一张的设计' : index === 4 ? '正在重做这张海报' : phase) : phases;
  const inputRef = useRef<{ upload: ImageAsset; keywords: string; forbiddenWords: string; creativeIdea: string; referenceImage: ImageAsset | null; target: PosterDraft | null; revisionPrompt: string } | null>(null);

  inputRef.current = upload ? { upload, keywords, forbiddenWords, creativeIdea, referenceImage, target: regenerationTarget, revisionPrompt } : null;

  useEffect(() => {
    if (step !== 'generating') return;

    const controller = new AbortController();
    const input = inputRef.current;
    setPhaseIndex(0);
    setRecoveryWarning(null);
    let pollTimer: number | undefined;
    let active = true;
    let readFailures = 0;
    let completedResult: TaskResult | null = null;
    const imageCache = new Map<string, PosterDraft>();

    if (input) {
      const form = new FormData();
      appendGenerationInput(form, input.upload, input.keywords, input.forbiddenWords, input.creativeIdea, input.referenceImage, input.target, input.revisionPrompt);
      if(promptPlan)form.set('approvedPlan',JSON.stringify({...promptPlan,posters:promptPlan.posters.map(({image,layers,...poster})=>poster)}));

      const deliverGeneration = (taskId: string, generation: GenerationResult): void => {
        const previous = usePosterStore.getState().generation;
        setGeneration(generation);
        const next = usePosterStore.getState();
        if (next.step === 'choose' && !next.error && next.generation && next.generation !== previous) {
          pendingGeneration.markDelivered(taskId, next.generation);
        }
      };

      const keepAvailableImages = (taskId: string): boolean => {
        if (!completedResult) return false;
        const posters = completedResult.posters.flatMap((poster) => {
          const cached = imageCache.get(poster.image.assetUrl);
          return cached ? [cached] : [];
        });
        if (posters.length === 0) return false;
        deliverGeneration(taskId, {
          analysis: completedResult.analysis,
          research: completedResult.research,
          posters,
          warnings: [...(completedResult.warnings ?? []), '部分图片暂时无法读取，已保留收到的图片。']
        });
        return true;
      };

      const handlePollError = (taskId: string, pollError: unknown): void => {
        if (!active || controller.signal.aborted) return;
        if (isTemporaryTaskReadError(pollError) && readFailures < 15) {
          readFailures += 1;
          schedulePoll(taskId);
        } else if (!keepAvailableImages(taskId)) {
          if (!isTemporaryTaskReadError(pollError)) void pendingGeneration.clear().catch(() => undefined);
          failGeneration(userFacingGenerationError(pollError));
        }
      };

      const schedulePoll = (taskId: string): void => {
        pollTimer = window.setTimeout(() => {
          void pollTask(taskId).catch((pollError: unknown) => handlePollError(taskId, pollError));
        }, 2_000);
      };

      const pollTask = async (taskId: string): Promise<void> => {
        if (!active || controller.signal.aborted) return;
        const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { signal: controller.signal });
        const status = await readTaskStatus(response);
        if (!active || controller.signal.aborted) return;
        setPhaseIndex(phaseIndexes[status.phase] ?? 0);
        if (status.status === 'succeeded' && status.result) {
          completedResult = status.result;
          const generation = await generationFromTaskResult(status.result, controller.signal, imageCache);
          if (active && !controller.signal.aborted) deliverGeneration(taskId, generation);
          return;
        }
        readFailures = 0;
        schedulePoll(taskId);
      };

      void (async () => {
        const previous = await pendingGeneration.read().catch(() => undefined);
        if (!active || controller.signal.aborted) return;
        if (previous && matchesSubmittedTask(previous, input, promptPlan)) {
          try { await pollTask(previous.taskId); } catch (pollError) { handlePollError(previous.taskId, pollError); }
          return;
        }
        if (previous) await pendingGeneration.clear().catch(() => undefined);
        const response = await fetch(input.target ? '/api/regenerate' : promptPlan ? '/api/render' : '/api/generate', {
          method: 'POST',
          body: form,
          signal: controller.signal
        });
        const taskId = await readTaskSubmission(response);
        if (!active || controller.signal.aborted) return;
        const state = usePosterStore.getState();
        try {
          await pendingGeneration.save(createPendingGenerationTask(taskId, {
            upload: input.upload,
            referenceImage: input.referenceImage,
            creativeIdea: input.creativeIdea,
            keywords: input.keywords,
            forbiddenWords: input.forbiddenWords,
            promptPlan: state.promptPlan,
            originalPrompts: state.originalPrompts,
            generation: state.generation,
            selectedDraft: state.selectedDraft,
            regenerationTarget: state.regenerationTarget,
            revisionPrompt: input.revisionPrompt
          }));
        } catch {
          if (active && !controller.signal.aborted) setRecoveryWarning('当前浏览器无法保存任务，请保持页面打开直到生成完成。');
        }
        if (active && !controller.signal.aborted) {
          try { await pollTask(taskId); } catch (pollError) { handlePollError(taskId, pollError); }
        }
      })().catch((requestError: unknown) => {
        if (!active || controller.signal.aborted) return;
        failGeneration(userFacingGenerationError(requestError));
      });
    }

    return () => {
      active = false;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
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
        <p className="kicker">{regenerationTarget ? '正在调整这一张' : promptPlan ? '按你确认的提示词生图' : 'AI 正在准备你的海报'}</p>
        <div className="generation-upload-wrap">
          <img className="generation-upload-preview" src={upload.dataUrl} alt="已上传的玩偶照片" />
        </div>
        <h1 id="generation-title" aria-live="polite">{shownPhases[phaseIndex]}</h1>
        <p className="generation-intro">{regenerationTarget ? '按你的建议调整，其他海报已经保留。' : '根据原图、想法与参考，完成场景、文字和排版。'}</p>
        <StatusBanner message={recoveryWarning} />
        <ol className="generation-phases" aria-label="生成阶段">
          {shownPhases.map((phase, index) => (
            <li key={phase} className={index === phaseIndex ? 'generation-phase active' : index < phaseIndex ? 'generation-phase complete' : 'generation-phase'}>
              <span className="generation-phase-marker" aria-hidden="true">{index < phaseIndex ? '✓' : index + 1}</span>
              <span>{phase}</span>
            </li>
          ))}
        </ol>
        <button className="secondary-button generation-back-button" type="button" onClick={confirmBack}>返回修改</button>
      </section>
    </main>
  );
}
