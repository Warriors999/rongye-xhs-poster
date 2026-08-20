import { createImageGenerationQueue } from './image-generation-queue';
import { createTaskStore } from './task-store';
import type { GenerationQueue, TaskStore } from './task-types';
import { createObjectStorage, type ObjectStorage } from '@/server/storage/r2';

export interface AsyncRuntime {
  store: TaskStore;
  queue: GenerationQueue;
  storage: ObjectStorage;
  env: Record<string, string | undefined>;
}

interface RuntimeHolder {
  active: { key: string; runtime: AsyncRuntime } | null;
}

const RUNTIME_HOLDER_KEY = '__KNITTING_POSTER_ASYNC_RUNTIME__';

const DISTRIBUTED_STORAGE_KEYS = [
  'REDIS_URL',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET'
] as const;

export type AsyncRuntimeMode = 'local' | 'distributed';

export function validateAsyncRuntimeConfig(env: Record<string, string | undefined>): { mode: AsyncRuntimeMode } {
  const configured = DISTRIBUTED_STORAGE_KEYS.map((key) => Boolean(env[key]?.trim()));
  if (configured.every((value) => !value)) return { mode: 'local' };
  if (configured.every(Boolean)) return { mode: 'distributed' };
  throw new Error('异步生产配置不完整：REDIS_URL 与 R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET 必须同时配置');
}

function runtimeHolder(): RuntimeHolder {
  const globalScope = globalThis as typeof globalThis & { [RUNTIME_HOLDER_KEY]?: RuntimeHolder };
  if (!globalScope[RUNTIME_HOLDER_KEY]) globalScope[RUNTIME_HOLDER_KEY] = { active: null };
  return globalScope[RUNTIME_HOLDER_KEY];
}

function runtimeKey(env: Record<string, string | undefined>): string {
  return DISTRIBUTED_STORAGE_KEYS.map((key) => env[key]?.trim() ?? '').join('|');
}

export function getAsyncRuntime(env: Record<string, string | undefined> = process.env): AsyncRuntime {
  validateAsyncRuntimeConfig(env);
  const key = runtimeKey(env);
  const holder = runtimeHolder();
  if (!holder.active || holder.active.key !== key) {
    holder.active = { key, runtime: { store: createTaskStore(env), queue: createImageGenerationQueue(env), storage: createObjectStorage(env), env } };
  }
  return holder.active.runtime;
}

export function resetAsyncRuntimeForTests(): void {
  runtimeHolder().active = null;
}
