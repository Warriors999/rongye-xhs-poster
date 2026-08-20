export type RetryMode = 'provider' | 'business';

export interface RetryBudget {
  remaining: number;
}

export interface AICallOptions {
  signal?: AbortSignal;
  /** Business orchestration owns retries when set to `business`. */
  retryMode?: RetryMode;
  retryBudget?: RetryBudget;
}

export interface CombinedSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

export function createCombinedSignal(externalSignal: AbortSignal | undefined, timeoutMs: number, timeoutMessage: string): CombinedSignal {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromExternal = () => {
    if (!controller.signal.aborted) controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  if (!controller.signal.aborted && timeoutMs > 0) {
    timer = setTimeout(() => {
      const error = new Error(timeoutMessage);
      error.name = 'TimeoutError';
      controller.abort(error);
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer !== undefined) clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  };
}

export function createAbortError(message = '请求已取消'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw createAbortError();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export function consumeRetryBudget(budget: RetryBudget | undefined): boolean {
  if (!budget || budget.remaining <= 0) return false;
  budget.remaining -= 1;
  return true;
}

export function createRetryBudget(maxRetries = 1): RetryBudget {
  return { remaining: Math.max(0, Math.floor(maxRetries)) };
}

export async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<T>((_, reject) => {
    onAbort = () => reject(signal.reason ?? createAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export async function withDeadline<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return raceWithAbort(operation(), signal);
}

export async function readResponseBodyWithAbort(response: Response, signal: AbortSignal, maxBytes = 512 * 1024): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await raceWithAbort(reader.read(), signal);
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) throw new Error('响应内容过大');
      chunks.push(decoder.decode(result.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* response details stay private */ }
  }
}
