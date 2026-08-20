import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { cloneTaskValue, normalizeProgress, originalKeyFor, safeTaskError, type CreateTaskInput, type TaskClaim, type TaskRecord, type TaskStore, type TaskUpdate } from './task-types';

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const TASK_KEY_PREFIX = 'knitting-poster:task:';

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function cleanWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 12)
    : [];
}

function cleanTaskId(value: unknown): string {
  const taskId = typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : randomUUID();
  return taskId;
}

function scrubSensitiveValue(value: unknown, key = ''): unknown {
  if (/(?:dataurl|apikey|secret|token|authorization|stack|provider|rawbody)/i.test(key)) return undefined;
  if (typeof value === 'string' && /api[_ -]?key|secret|authorization|bearer|stack trace/i.test(value)) return undefined;
  if (Array.isArray(value)) return value.map((item) => scrubSensitiveValue(item)).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([childKey, childValue]) => {
      const scrubbed = scrubSensitiveValue(childValue, childKey);
      return scrubbed === undefined ? [] : [[childKey, scrubbed]];
    }));
  }
  return value;
}

function createRecord(input: CreateTaskInput, now: number, ttlMs: number): TaskRecord {
  const taskId = cleanTaskId(input.taskId);
  return {
    taskId,
    originalKey: cleanText(input.originalKey, 500) || originalKeyFor(taskId),
    ...(typeof input.originalWidth === 'number' && Number.isFinite(input.originalWidth) ? { originalWidth: Math.floor(input.originalWidth) } : {}),
    ...(typeof input.originalHeight === 'number' && Number.isFinite(input.originalHeight) ? { originalHeight: Math.floor(input.originalHeight) } : {}),
    keywords: cleanText(input.keywords, 500),
    forbiddenWords: cleanText(input.forbiddenWords, 300),
    creativeIdea: cleanText(input.creativeIdea, 500),
    status: 'queued',
    phase: 'queued',
    progress: 0,
    warnings: [],
    createdAt: now,
    expiresAt: now + ttlMs,
    attempts: 0
  };
}

function sanitizeRecord(record: TaskRecord): TaskRecord {
  return {
    ...record,
    taskId: cleanTaskId(record.taskId),
    originalKey: cleanText(record.originalKey, 500),
    ...(record.originalWidth !== undefined ? { originalWidth: Math.max(1, Math.floor(record.originalWidth)) } : {}),
    ...(record.originalHeight !== undefined ? { originalHeight: Math.max(1, Math.floor(record.originalHeight)) } : {}),
    keywords: cleanText(record.keywords, 500),
    forbiddenWords: cleanText(record.forbiddenWords, 300),
    creativeIdea: cleanText(record.creativeIdea, 500),
    progress: normalizeProgress(record.progress),
    warnings: cleanWarnings(record.warnings),
    ...(record.error ? { error: safeTaskError(record.error) } : {}),
    ...(record.result ? { result: scrubSensitiveValue(record.result) as TaskRecord['result'] } : {})
  };
}

function safePatch(patch: TaskUpdate): TaskUpdate {
  return {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.phase ? { phase: patch.phase } : {}),
    ...(patch.progress !== undefined ? { progress: normalizeProgress(patch.progress) } : {}),
    ...(patch.warnings ? { warnings: cleanWarnings(patch.warnings) } : {}),
    ...(patch.error ? { error: safeTaskError(patch.error) } : {}),
    ...(patch.result ? { result: scrubSensitiveValue(patch.result) as TaskUpdate['result'] } : {})
  };
}

export interface InMemoryTaskStoreOptions {
  ttlMs?: number;
  now?: () => number;
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryTaskStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const record = createRecord(input, this.now(), this.ttlMs);
    this.tasks.set(record.taskId, record);
    return cloneTaskValue(record);
  }

  async get(taskId: string): Promise<TaskRecord | null> {
    const record = this.tasks.get(taskId);
    if (!record) return null;
    if (record.expiresAt <= this.now()) {
      this.tasks.delete(taskId);
      return null;
    }
    return cloneTaskValue(record);
  }

  async claim(taskId: string): Promise<TaskClaim> {
    const record = this.tasks.get(taskId);
    if (!record || record.expiresAt <= this.now() || record.status !== 'queued') {
      if (record && record.expiresAt <= this.now()) this.tasks.delete(taskId);
      return { claimed: false, task: null };
    }
    const claimed = sanitizeRecord({ ...record, status: 'running', phase: 'recognizing', progress: 5, attempts: record.attempts + 1 });
    this.tasks.set(taskId, claimed);
    return { claimed: true, task: cloneTaskValue(claimed) };
  }

  async requeueStale(taskId: string): Promise<TaskRecord | null> {
    const current = await this.get(taskId);
    if (!current || current.status !== 'running') return current;
    const queued = sanitizeRecord({ ...current, status: 'queued', phase: 'queued', progress: 0 });
    this.tasks.set(taskId, queued);
    return cloneTaskValue(queued);
  }

  async update(taskId: string, patch: TaskUpdate): Promise<TaskRecord | null> {
    const current = await this.get(taskId);
    if (!current) return null;
    const updated = sanitizeRecord({ ...current, ...safePatch(patch) });
    this.tasks.set(taskId, updated);
    return cloneTaskValue(updated);
  }

  async deleteExpired(): Promise<number> {
    const now = this.now();
    let count = 0;
    for (const [taskId, task] of this.tasks) {
      if (task.expiresAt <= now) {
        this.tasks.delete(taskId);
        count += 1;
      }
    }
    return count;
  }
}

function taskKey(taskId: string): string {
  return `${TASK_KEY_PREFIX}${taskId}`;
}

export interface RedisTaskStoreOptions {
  client?: Redis;
  url?: string;
  ttlMs?: number;
  now?: () => number;
}

export class RedisTaskStore implements TaskStore {
  private readonly client: Redis;
  private readonly ownsClient: boolean;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: RedisTaskStoreOptions = {}) {
    const url = options.url ?? process.env.REDIS_URL;
    if (!options.client && !url) throw new Error('REDIS_URL 未配置');
    this.client = options.client ?? new Redis(url!);
    this.ownsClient = !options.client;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const record = createRecord(input, this.now(), this.ttlMs);
    await this.client.set(taskKey(record.taskId), JSON.stringify(record), 'PX', this.ttlMs);
    return cloneTaskValue(record);
  }

  async get(taskId: string): Promise<TaskRecord | null> {
    const raw = await this.client.get(taskKey(taskId));
    if (!raw) return null;
    try {
      const record = sanitizeRecord(JSON.parse(raw) as TaskRecord);
      if (record.expiresAt <= this.now()) {
        await this.client.del(taskKey(taskId));
        return null;
      }
      return cloneTaskValue(record);
    } catch {
      await this.client.del(taskKey(taskId));
      return null;
    }
  }

  async claim(taskId: string): Promise<TaskClaim> {
    const lockKey = `${taskKey(taskId)}:claim-lock`;
    const locked = await this.client.set(lockKey, '1', 'PX', 10_000, 'NX');
    if (!locked) return { claimed: false, task: null };
    try {
      const current = await this.get(taskId);
      if (!current || current.status !== 'queued') return { claimed: false, task: null };
      const claimed = sanitizeRecord({ ...current, status: 'running', phase: 'recognizing', progress: 5, attempts: current.attempts + 1 });
      await this.client.set(taskKey(taskId), JSON.stringify(claimed), 'PX', Math.max(1, claimed.expiresAt - this.now()));
      return { claimed: true, task: cloneTaskValue(claimed) };
    } finally {
      await this.client.del(lockKey);
    }
  }

  async requeueStale(taskId: string): Promise<TaskRecord | null> {
    const lockKey = `${taskKey(taskId)}:claim-lock`;
    const locked = await this.client.set(lockKey, '1', 'PX', 10_000, 'NX');
    if (!locked) return this.get(taskId);
    try {
      const current = await this.get(taskId);
      if (!current || current.status !== 'running') return current;
      const queued = sanitizeRecord({ ...current, status: 'queued', phase: 'queued', progress: 0 });
      await this.client.set(taskKey(taskId), JSON.stringify(queued), 'PX', Math.max(1, queued.expiresAt - this.now()));
      return cloneTaskValue(queued);
    } finally {
      await this.client.del(lockKey);
    }
  }

  async update(taskId: string, patch: TaskUpdate): Promise<TaskRecord | null> {
    const current = await this.get(taskId);
    if (!current) return null;
    const updated = sanitizeRecord({ ...current, ...safePatch(patch) });
    await this.client.set(taskKey(taskId), JSON.stringify(updated), 'PX', Math.max(1, updated.expiresAt - this.now()));
    return cloneTaskValue(updated);
  }

  async deleteExpired(): Promise<number> {
    let cursor = '0';
    let count = 0;
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', `${TASK_KEY_PREFIX}*`, 'COUNT', '100');
      cursor = nextCursor;
      for (const key of keys) {
        if (key.endsWith(':claim-lock')) continue;
        const taskId = key.slice(TASK_KEY_PREFIX.length);
        if (!(await this.get(taskId))) count += 1;
      }
    } while (cursor !== '0');
    return count;
  }

  async close(): Promise<void> {
    if (this.ownsClient) await this.client.quit();
  }
}

export function createTaskStore(env: Record<string, string | undefined> = process.env): TaskStore {
  return env.REDIS_URL?.trim() ? new RedisTaskStore({ url: env.REDIS_URL }) : new InMemoryTaskStore();
}
