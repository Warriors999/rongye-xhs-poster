import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const HOST = '127.0.0.1';
const HEALTH_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (!address || typeof address === 'string') throw new Error('无法分配本地临时端口');
  return address.port;
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      resolve();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function waitForHealth(child, url) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = new Error('尚未收到健康检查响应');
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`生产服务提前退出（exitCode=${child.exitCode ?? 'null'}, signal=${child.signalCode ?? 'null'}）`);
    }
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (response.status === 200 && payload?.ok === true) return;
      lastError = new Error(`健康检查返回异常：HTTP ${response.status} ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error(`健康检查超时：${lastError.message}`);
}

async function main() {
  const port = await findFreePort();
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const child = spawn(pnpmCommand, ['start', `--hostname=${HOST}`, `--port=${port}`], {
    env: {
      ...process.env,
      AI_PROVIDER: 'mock',
      AI_VISION_PROTOCOL: '',
      AI_VISION_BASE_URL: '',
      AI_VISION_API_KEY: '',
      AI_IMAGE_BASE_URL: '',
      AI_IMAGE_API_KEY: '',
      AI_API_KEY: '',
      REFERENCE_RESEARCH_URL: '',
      REFERENCE_RESEARCH_API_KEY: '',
      APP_ACCESS_PASSWORD: ''
    },
    stdio: 'inherit'
  });

  let spawnError;
  child.once('error', (error) => { spawnError = error; });
  try {
    if (spawnError) throw spawnError;
    await waitForHealth(child, `http://${HOST}:${port}/api/health`);
    console.log(`Production start smoke passed: http://${HOST}:${port}/api/health`);
  } finally {
    await stopProcess(child);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
