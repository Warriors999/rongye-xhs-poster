import { generatePosters } from '@/server/generation/generate-posters';
import type { GenerateResponse } from '@/server/ai/contracts';

const DESIGN_TIMEOUT_MS = 600_000;
const TASK_TTL_MS = 20 * 60_000;
const TASK_ID = /^[A-Za-z0-9_-]{8,100}$/;

export type DesignTask = {
  taskId: string;
  status: 'running' | 'succeeded' | 'failed';
  expiresAt: number;
  result?: GenerateResponse;
  error?: string;
};

export function createDesignTaskService(generate: typeof generatePosters = generatePosters) {
  const tasks = new Map<string, DesignTask>();

  return {
    submit(taskId: string, input: Parameters<typeof generatePosters>[0]) {
      if (!TASK_ID.test(taskId)) throw new Error('请求编号无效');
      const existing = tasks.get(taskId);
      if (existing) return { taskId, status: existing.status };
      const now = Date.now();
      for (const [id, task] of tasks) if (task.expiresAt <= now) tasks.delete(id);
      tasks.set(taskId, { taskId, status: 'running', expiresAt: now + TASK_TTL_MS });
      void generate(input, { designOnly: true, timeoutMs: DESIGN_TIMEOUT_MS })
        .then((result) => {
          tasks.set(taskId, { taskId, status: 'succeeded', expiresAt: Date.now() + TASK_TTL_MS, result });
        })
        .catch((error: unknown) => {
          const code = error instanceof Error && error.name === 'AbortError' ? 'timeout'
            : error instanceof Error && error.message === '生成结果格式异常，请重试' ? 'format-error'
              : error instanceof Error && error.message === '生成服务暂时不可用，请重试' ? 'provider-error'
                : 'generation-error';
          console.error(`[design-task] task=${taskId.slice(0, 8)} code=${code}`);
          tasks.set(taskId, { taskId, status: 'failed', expiresAt: Date.now() + TASK_TTL_MS, error: '设计服务暂时不可用，请重试' });
        });
      return { taskId, status: 'running' as const };
    },
    get(taskId: string): DesignTask | null {
      const task = tasks.get(taskId);
      if (!task) return null;
      if (task.expiresAt <= Date.now()) {
        tasks.delete(taskId);
        return null;
      }
      return task;
    }
  };
}

const HOLDER_KEY = '__RONGYE_DESIGN_TASK_SERVICE__';

export function getDesignTaskService(): ReturnType<typeof createDesignTaskService> {
  const scope = globalThis as typeof globalThis & { [HOLDER_KEY]?: ReturnType<typeof createDesignTaskService> };
  if (!scope[HOLDER_KEY]) scope[HOLDER_KEY] = createDesignTaskService();
  return scope[HOLDER_KEY];
}
