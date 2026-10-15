// @vitest-environment node
import { expect, it } from 'vitest';
import { readChatResponse } from './chat-response';

it('returns at DONE even if the gateway keeps the connection open', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n'));
    },
    cancel() { cancelled = true; }
  }), { headers: { 'content-type': 'text/event-stream' } });
  expect(await readChatResponse(response, AbortSignal.timeout(100))).toMatchObject({ choices: [{ message: { content: '你好' } }] });
  expect(cancelled).toBe(true);
});

it('accepts fragmented UTF-8 events and stops at finish_reason', async () => {
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\r\n\r\n');
  const response = new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2));
  } }), { headers: { 'content-type': 'text/plain' } });
  expect(await readChatResponse(response, AbortSignal.timeout(100))).toMatchObject({ choices: [{ message: { content: '中文' } }] });
});

it('rejects incomplete streams and upstream error events', async () => {
  await expect(readChatResponse(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'), AbortSignal.timeout(100))).rejects.toThrow('chat-stream-incomplete');
  await expect(readChatResponse(new Response('data: {"error":{"message":"private detail"}}\n\n'), AbortSignal.timeout(100))).rejects.toThrow('chat-stream-error');
});

it('accepts a regular JSON response', async () => {
  const body = { choices: [{ message: { content: '{}' } }] };
  expect(await readChatResponse(Response.json(body), AbortSignal.timeout(100))).toEqual(body);
});
