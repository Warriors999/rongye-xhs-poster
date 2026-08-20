import { getAsyncRuntime } from './runtime';
import { workerMain } from './image-generation-worker';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());

workerMain(getAsyncRuntime(), controller.signal).catch((error: unknown) => {
  console.error('图片生成 worker 退出', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
