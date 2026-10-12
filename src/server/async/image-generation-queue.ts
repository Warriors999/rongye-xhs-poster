import Redis from 'ioredis';
import { copyDataSchema, designBriefSchema, posterStyleSchema } from '@/server/ai/contracts';
import { randomUUID } from 'node:crypto';
import { cloneTaskValue, type GenerationJob, type GenerationQueue, type QueueMessage } from './task-types';

const QUEUE_KEY = 'knitting-poster:generation-queue';
const PROCESSING_KEY = 'knitting-poster:generation-processing';
const DEFAULT_VISIBILITY_TIMEOUT_MS = 10 * 60 * 1000;

export interface QueueEnvelope {
  id: string;
  receipt: string;
  claimedAt: number;
  job: GenerationJob;
  recovered?: boolean;
}

function cloneJob(job: GenerationJob): GenerationJob {
  const style = posterStyleSchema.safeParse(job.targetStyle);
  const design = designBriefSchema.safeParse(job.selectedPosterDesign);
  const copy = copyDataSchema.safeParse(job.selectedPosterCopy);
  const hasReference = typeof job.referenceKey === 'string'
    && job.referenceKey === `tasks/${job.taskId}/reference`
    && [job.referenceWidth, job.referenceHeight].every((edge) => typeof edge === 'number' && Number.isInteger(edge) && edge > 0 && edge <= 1600);
  return cloneTaskValue({
    taskId: job.taskId,
    originalKey: job.originalKey,
    keywords: job.keywords,
    forbiddenWords: job.forbiddenWords,
    creativeIdea: job.creativeIdea,
    ...(hasReference ? { referenceKey: job.referenceKey, referenceWidth: job.referenceWidth, referenceHeight: job.referenceHeight } : {}),
    ...(style.success ? { targetStyle: style.data } : {}),
    ...(typeof job.revisionPrompt === 'string' ? { revisionPrompt: job.revisionPrompt.slice(0, 500) } : {}),
    ...(design.success ? { selectedPosterDesign: design.data } : {}),
    ...(copy.success ? { selectedPosterCopy: copy.data } : {}),
    config: { mode: job.config.mode }
  });
}

export function encodeQueueEnvelope(envelope: QueueEnvelope): string {
  return JSON.stringify({
    id: envelope.id,
    receipt: envelope.receipt,
    claimedAt: envelope.claimedAt,
    job: cloneJob(envelope.job),
    ...(envelope.recovered ? { recovered: true } : {})
  });
}

export function decodeQueueEnvelope(raw: string): QueueEnvelope | null {
  try {
    const value = JSON.parse(raw) as Partial<QueueEnvelope>;
    const job = value.job as Partial<GenerationJob> | undefined;
    if (
      !value || typeof value.id !== 'string' || !value.id ||
      typeof value.receipt !== 'string' || !value.receipt ||
      typeof value.claimedAt !== 'number' || !Number.isFinite(value.claimedAt) || value.claimedAt < 0 ||
      !job || typeof job.taskId !== 'string' || typeof job.originalKey !== 'string' ||
      typeof job.keywords !== 'string' || typeof job.forbiddenWords !== 'string' ||
      typeof job.creativeIdea !== 'string' || (job.config?.mode !== 'mock' && job.config?.mode !== 'configured')
    ) return null;
    return { id: value.id, receipt: value.receipt, claimedAt: value.claimedAt, job: cloneJob(job as GenerationJob), ...(value.recovered ? { recovered: true } : {}) };
  } catch {
    return null;
  }
}

export function isQueueEnvelopeExpired(envelope: QueueEnvelope, now: number, visibilityTimeoutMs: number): boolean {
  return envelope.claimedAt <= 0 || envelope.claimedAt + visibilityTimeoutMs <= now;
}

interface InflightMessage {
  message: QueueMessage;
  claimedAt: number;
}

export interface InMemoryImageGenerationQueueOptions {
  visibilityTimeoutMs?: number;
  now?: () => number;
}

export class InMemoryImageGenerationQueue implements GenerationQueue {
  private readonly pending: QueueMessage[] = [];
  private readonly inflight = new Map<string, InflightMessage>();
  private readonly waiters: Array<{ resolve: (message: QueueMessage | null) => void; timer?: ReturnType<typeof setTimeout> }> = [];
  private readonly visibilityTimeoutMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryImageGenerationQueueOptions = {}) {
    this.visibilityTimeoutMs = Math.max(1, options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS);
    this.now = options.now ?? Date.now;
  }

  private claim(message: QueueMessage): QueueMessage {
    const claimed = cloneTaskValue(message);
    this.inflight.set(claimed.receipt, { message: claimed, claimedAt: this.now() });
    return claimed;
  }

  async enqueue(job: GenerationJob): Promise<void> {
    const message: QueueMessage = { id: randomUUID(), receipt: randomUUID(), job: cloneJob(job) };
    const waiter = this.waiters.shift();
    if (waiter) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve(this.claim(message));
      return;
    }
    this.pending.push(message);
  }

  async dequeue(options: { waitMs?: number } = {}): Promise<QueueMessage | null> {
    const message = this.pending.shift();
    if (message) return this.claim(message);
    const waitMs = Math.max(0, options.waitMs ?? 0);
    if (waitMs === 0) return null;
    return new Promise((resolve) => {
      const waiter = { resolve, timer: undefined as ReturnType<typeof setTimeout> | undefined };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        resolve(null);
      }, waitMs);
      this.waiters.push(waiter);
    });
  }

  async ack(message: QueueMessage): Promise<void> {
    this.inflight.delete(message.receipt);
  }

  async reclaimExpired(): Promise<number> {
    const now = this.now();
    let count = 0;
    for (const [receipt, inflight] of this.inflight) {
      if (inflight.claimedAt + this.visibilityTimeoutMs > now) continue;
      this.inflight.delete(receipt);
      this.pending.push({ id: inflight.message.id, receipt: randomUUID(), job: cloneJob(inflight.message.job), recovered: true });
      count += 1;
    }
    return count;
  }
}

export interface RedisImageGenerationQueueOptions {
  client?: Redis;
  url?: string;
  queueKey?: string;
  processingKey?: string;
  visibilityTimeoutMs?: number;
  now?: () => number;
}

const REPLACE_PROCESSING_ENTRY = `
  local removed = redis.call('LREM', KEYS[1], 1, ARGV[1])
  if removed == 1 then
    redis.call('LPUSH', KEYS[1], ARGV[2])
    return 1
  end
  return 0
`;

const RECLAIM_PROCESSING_ENTRY = `
  local removed = redis.call('LREM', KEYS[1], 1, ARGV[1])
  if removed == 1 then
    redis.call('LPUSH', KEYS[2], ARGV[2])
    return 1
  end
  return 0
`;

export class RedisImageGenerationQueue implements GenerationQueue {
  private readonly client: Redis;
  private readonly ownsClient: boolean;
  private readonly queueKey: string;
  private readonly processingKey: string;
  private readonly visibilityTimeoutMs: number;
  private readonly now: () => number;

  constructor(options: RedisImageGenerationQueueOptions = {}) {
    const url = options.url ?? process.env.REDIS_URL;
    if (!options.client && !url) throw new Error('REDIS_URL 未配置');
    this.client = options.client ?? new Redis(url!);
    this.ownsClient = !options.client;
    this.queueKey = options.queueKey ?? QUEUE_KEY;
    this.processingKey = options.processingKey ?? PROCESSING_KEY;
    this.visibilityTimeoutMs = Math.max(1, options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS);
    this.now = options.now ?? Date.now;
  }

  async enqueue(job: GenerationJob): Promise<void> {
    const envelope: QueueEnvelope = { id: randomUUID(), receipt: randomUUID(), claimedAt: 0, job: cloneJob(job) };
    await this.client.lpush(this.queueKey, encodeQueueEnvelope(envelope));
  }

  async dequeue(options: { waitMs?: number } = {}): Promise<QueueMessage | null> {
    const waitMs = Math.max(0, options.waitMs ?? 0);
    const raw = waitMs > 0
      ? await this.client.brpoplpush(this.queueKey, this.processingKey, Math.max(1, Math.ceil(waitMs / 1000)))
      : await this.client.rpoplpush(this.queueKey, this.processingKey);
    if (!raw) return null;
    const envelope = decodeQueueEnvelope(raw);
    if (!envelope) {
      await this.client.lrem(this.processingKey, 1, raw);
      return null;
    }
    const claimed = encodeQueueEnvelope({ ...envelope, claimedAt: this.now() });
    const replaced = Number(await this.client.eval(REPLACE_PROCESSING_ENTRY, 1, this.processingKey, raw, claimed)) === 1;
    if (!replaced) return null;
    return { id: envelope.id, receipt: claimed, job: cloneJob(envelope.job) };
  }

  async ack(message: QueueMessage): Promise<void> {
    await this.client.lrem(this.processingKey, 1, message.receipt);
  }

  async reclaimExpired(): Promise<number> {
    const entries = await this.client.lrange(this.processingKey, 0, -1);
    let count = 0;
    for (const raw of entries) {
      const envelope = decodeQueueEnvelope(raw);
      if (!envelope || !isQueueEnvelopeExpired(envelope, this.now(), this.visibilityTimeoutMs)) continue;
      const requeued = encodeQueueEnvelope({ ...envelope, receipt: randomUUID(), claimedAt: 0, recovered: true });
      count += Number(await this.client.eval(RECLAIM_PROCESSING_ENTRY, 2, this.processingKey, this.queueKey, raw, requeued)) === 1 ? 1 : 0;
    }
    return count;
  }

  async close(): Promise<void> {
    if (this.ownsClient) await this.client.quit();
  }
}

export function createImageGenerationQueue(env: Record<string, string | undefined> = process.env): GenerationQueue {
  return env.REDIS_URL?.trim() ? new RedisImageGenerationQueue({ url: env.REDIS_URL }) : new InMemoryImageGenerationQueue();
}
