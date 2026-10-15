import { raceWithAbort } from './call-options';

export async function readChatResponse(response: Response, signal: AbortSignal, maxBytes = 512 * 1024): Promise<unknown> {
  if (!response.body) return raceWithAbort(response.json(), signal);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let pending = '';
  let content = '';
  let streaming = response.headers?.get('content-type')?.includes('text/event-stream') ?? false;
  let finished = false;
  const consume = (event: string) => {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') { finished = true; return; }
    const value = JSON.parse(data);
    if (value.error) throw new Error('chat-stream-error');
    const choice = value.choices?.[0];
    const fragment = choice?.delta?.content ?? choice?.message?.content;
    if (typeof fragment === 'string') content += fragment;
    if (choice?.finish_reason === 'length' || choice?.finish_reason === 'content_filter') throw new Error('chat-stream-truncated');
    if (choice?.finish_reason === 'stop') finished = true;
  };
  try {
    while (!finished) {
      const chunk = await raceWithAbort(reader.read(), signal);
      if (chunk.done) { pending += decoder.decode(); break; }
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('chat-response-too-large');
      pending += decoder.decode(chunk.value, { stream: true });
      if (/^(?:data:|:)/.test(pending.trimStart())) streaming = true;
      if (streaming) {
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(pending))) {
          const event = pending.slice(0, boundary.index);
          pending = pending.slice(boundary.index + boundary[0].length);
          consume(event);
          if (finished) break;
        }
      }
    }
    if (!streaming) return JSON.parse(pending);
    if (!finished && pending.trim()) consume(pending);
    if (!finished || !content) throw new Error('chat-stream-incomplete');
    return { choices: [{ message: { content } }] };
  } finally {
    // Completion markers terminate the response even if the proxy keeps TCP open.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
