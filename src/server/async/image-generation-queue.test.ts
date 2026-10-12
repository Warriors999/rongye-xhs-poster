// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { InMemoryImageGenerationQueue, decodeQueueEnvelope, encodeQueueEnvelope, isQueueEnvelopeExpired } from './image-generation-queue';

const job = {
  taskId: 'task-1',
  originalKey: 'tasks/task-1/original',
  keywords: '春天',
  forbiddenWords: '价格',
  creativeIdea: '温柔日常',
  config: { mode: 'mock' as const }
};

describe('InMemoryImageGenerationQueue', () => {
  it('enqueues, dequeues, and acknowledges a safe job without image data', async () => {
    const queue = new InMemoryImageGenerationQueue();
    await queue.enqueue(job);

    const message = await queue.dequeue({ waitMs: 0 });
    expect(message?.job).toEqual(job);
    expect(JSON.stringify(message?.job)).not.toContain('data:image');
    expect(JSON.stringify(message?.job)).not.toContain('api-key');

    await queue.ack(message!);
    expect(await queue.dequeue({ waitMs: 0 })).toBeNull();
  });

  it('waits for a later enqueue when a consumer uses a blocking dequeue', async () => {
    const queue = new InMemoryImageGenerationQueue();
    const messagePromise = queue.dequeue({ waitMs: 500 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await queue.enqueue(job);
    await expect(messagePromise).resolves.toMatchObject({ job });
  });

  it('reclaims an unacknowledged message after its visibility timeout with a new receipt', async () => {
    let now = 1_000;
    const queue = new InMemoryImageGenerationQueue({ visibilityTimeoutMs: 100, now: () => now });
    await queue.enqueue(job);

    const first = await queue.dequeue();
    expect(first).not.toBeNull();
    now = 1_101;

    expect(await queue.reclaimExpired()).toBe(1);
    const reclaimed = await queue.dequeue();
    expect(reclaimed?.job).toEqual(job);
    expect(reclaimed?.recovered).toBe(true);
    expect(reclaimed?.receipt).not.toBe(first?.receipt);

    await queue.ack(reclaimed!);
    expect(await queue.reclaimExpired()).toBe(0);
    expect(await queue.dequeue()).toBeNull();
  });

  it('serializes a Redis envelope and identifies expired processing entries without a Redis server', () => {
    const envelope = { id: 'message-1', receipt: 'receipt-1', claimedAt: 1_000, job };
    const encoded = encodeQueueEnvelope(envelope);
    expect(decodeQueueEnvelope(encoded)).toEqual(envelope);
    expect(isQueueEnvelopeExpired(envelope, 1_099, 100)).toBe(false);
    expect(isQueueEnvelopeExpired(envelope, 1_100, 100)).toBe(true);
    expect(isQueueEnvelopeExpired({ ...envelope, claimedAt: 0 }, 1_000, 100)).toBe(true);
  });
});


it('retains bounded reference and regeneration metadata in Redis envelopes without bytes or secrets', () => {
  const envelope = { id: 'message', receipt: 'receipt', claimedAt: 0, job: { ...job, referenceKey: 'tasks/task-1/reference', referenceWidth: 600, referenceHeight: 800, targetStyle: 'story' as const, revisionPrompt: '背景改成深蓝', apiKey: 'secret', referenceImageDataUrl: 'data:image/png;base64,AAAA' } };
  const encoded = encodeQueueEnvelope(envelope);
  expect(decodeQueueEnvelope(encoded)?.job).toMatchObject({ referenceKey: 'tasks/task-1/reference', referenceWidth: 600, referenceHeight: 800, targetStyle: 'story', revisionPrompt: '背景改成深蓝' });
  expect(encoded).not.toContain('secret');
  expect(encoded).not.toContain('data:image');
});
