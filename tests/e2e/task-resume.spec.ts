import { expect, test } from '@playwright/test';

test('resumes the submitted image task after a mobile reload without paying for another request', async ({ page }) => {
  let renderRequests = 0;
  let holdStatus = true;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/render') && request.method() === 'POST') renderRequests += 1;
  });
  await page.route('**/api/tasks/*', async (route) => {
    if (holdStatus && !new URL(route.request().url()).searchParams.has('asset')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'queued', phase: 'queued', progress: 0, warnings: [], expiresAt: Date.now() + 60_000
      }) });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: '进入绒页' }).click();
  await page.getByLabel('从相册选择照片').setInputFiles('public/visuals/hero.webp');
  await page.getByRole('button', { name: '设计 3 套提示词' }).click();
  await page.getByRole('button', { name: '按当前提示词生成 3 张', exact: true }).click();

  await expect.poll(async () => page.evaluate(() => new Promise<string | undefined>((resolve, reject) => {
    const open = indexedDB.open('rongye-generation-task', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction('task').objectStore('task').get('current');
      request.onsuccess = () => { resolve(request.result?.taskId); database.close(); };
      request.onerror = () => reject(request.error);
    };
  }))).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
  expect(renderRequests).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: '正在识别玩偶' })).toBeVisible();
  expect(renderRequests).toBe(1);
  holdStatus = false;

  await expect(page.getByRole('heading', { name: '找到你喜欢的那一张' })).toBeVisible({ timeout: 15_000 });
  expect(renderRequests).toBe(1);
  expect(await page.getByRole('img', { name: 'AI 生成的完整微海报' }).evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.getByText('已自动暂存最近一次结果，仅此浏览器可恢复。')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => new Promise<boolean>((resolve, reject) => {
    const open = indexedDB.open('rongye-generation-task', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction('task').objectStore('task').get('current');
      request.onsuccess = () => { resolve(request.result === undefined); database.close(); };
      request.onerror = () => reject(request.error);
    };
  }))).toBe(true);
});

test('restores existing posters while resuming a submitted one-image redo', async ({ page }) => {
  let holdRedoStatus = false;
  let redoRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/regenerate') && request.method() === 'POST') redoRequests += 1;
  });
  await page.route('**/api/tasks/*', async (route) => {
    if (holdRedoStatus && !new URL(route.request().url()).searchParams.has('asset')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'queued', phase: 'queued', progress: 0, warnings: [], expiresAt: Date.now() + 60_000
      }) });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: '进入绒页' }).click();
  await page.getByLabel('从相册选择照片').setInputFiles('public/visuals/hero.webp');
  await page.getByRole('button', { name: '设计 3 套提示词' }).click();
  await page.getByRole('button', { name: '按当前提示词生成 3 张', exact: true }).click();
  await expect(page.getByRole('heading', { name: '找到你喜欢的那一张' })).toBeVisible();
  await expect(page.getByText('已自动暂存最近一次结果，仅此浏览器可恢复。')).toBeVisible();
  const before = await page.getByRole('img', { name: 'AI 生成的完整微海报' }).evaluateAll((images) => images.map((image) => image.getAttribute('src')));

  await page.getByRole('button', { name: '调整这张' }).nth(1).click();
  await page.getByLabel('想怎么调整这张？').fill('背景更安静');
  holdRedoStatus = true;
  await page.getByRole('button', { name: '只重做这张' }).click();
  await expect.poll(async () => page.evaluate(() => new Promise<boolean>((resolve, reject) => {
    const open = indexedDB.open('rongye-generation-task', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction('task').objectStore('task').get('current');
      request.onsuccess = () => { resolve(Boolean(request.result?.regenerationTarget || request.result?.snapshot?.regenerationTarget)); database.close(); };
      request.onerror = () => reject(request.error);
    };
  }))).toBe(true);
  expect(redoRequests).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: '正在识别玩偶' })).toBeVisible();
  holdRedoStatus = false;
  await expect(page.getByRole('heading', { name: '找到你喜欢的那一张' })).toBeVisible({ timeout: 15_000 });
  expect(redoRequests).toBe(1);
  const after = await page.getByRole('img', { name: 'AI 生成的完整微海报' }).evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  expect(after).toHaveLength(3);
  expect(after[0] === before[0]).toBe(true);
  expect(after[2] === before[2]).toBe(true);
});
