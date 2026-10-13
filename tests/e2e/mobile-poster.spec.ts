import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('completes the mobile poster flow with the mock provider', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '把每只玩偶，做成一张好看的图。' })).toBeVisible();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-home.png`, fullPage: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-home-viewport.png` });
  await page.getByRole('button', { name: '进入绒页' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-create.png`, fullPage: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-create-viewport.png` });
  await expect(page.getByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).toBeVisible();
  await page.getByLabel('从相册选择照片').setInputFiles({
    name: 'knit-doll.png',
    mimeType: 'image/png',
    buffer: onePixelPng
  });
  await page.getByRole('textbox', { name: /我的创作想法/ }).fill('复古玩具店橱窗，暖黄色灯光，带一点童话感');
  await expect(page.getByRole('button', { name: '设计 3 套提示词' })).toBeVisible();
  await page.getByRole('button', { name: '设计 3 套提示词' }).click();
  await page.getByRole('button',{name:'按当前提示词生成 3 张',exact:true}).click();

  await expect(page.getByRole('heading', { name: '找到你喜欢的那一张' })).toBeVisible({ timeout: 15_000 });
  for (const direction of ['动态方案 A', '动态方案 B', '动态方案 C']) {
    await expect(page.getByText(direction, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '下载这张' })).toHaveCount(3);

  // Native mobile sharing is tested at the component boundary; exercise browser file downloads here.
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable:true, value: () => false }));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载这张' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^绒页-(lifestyle|story|editorial)-\d+\.png$/);

  await expect(page.getByRole('button', { name: '全部下载 3 张' })).toBeVisible();
  await page.getByRole('button', { name: '全部下载 3 张' }).click();
  await expect(page.getByRole('button', { name: '已发起全部 3 张下载' })).toBeVisible();
  await expect(page.getByText('已自动暂存最近一次结果，仅此浏览器可恢复。')).toBeVisible();
  const savedImages = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const open = indexedDB.open('rongye-project-library', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('projects').objectStore('projects').get('latest-auto-result');
      read.onerror = () => reject(read.error);
      read.onsuccess = () => { resolve(read.result.generation.posters.map((poster: { image: { dataUrl: string } }) => poster.image.dataUrl)); db.close(); };
    };
  }));
  expect(savedImages).toHaveLength(3);
  expect(savedImages.every((source) => source.startsWith('data:image/'))).toBe(true);
  await page.getByRole('button',{name:'返回上一级',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续查看本次结果',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'继续查看本次结果',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'进入绒页',exact:true}).click();
  await expect(page.getByRole('button', { name: '继续上次生成结果' })).toBeVisible();
  await page.getByRole('button',{name:'我的作品',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续创作',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'继续创作',exact:true}).click();
  await expect(page.getByRole('button',{name:'下载这张',exact:true})).toHaveCount(3);
  const before = await page.getByRole('img',{name:'AI 生成的完整微海报',exact:true}).evaluateAll(xs=>xs.map(x=>x.getAttribute('src')));
  await page.getByRole('button',{name:'调整这张',exact:true}).nth(1).click();
  await page.getByLabel('想怎么调整这张？',{exact:true}).fill('背景改成深蓝，标题大一点');
  await page.getByRole('button',{name:'只重做这张',exact:true}).click();
  await expect(page.getByRole('heading',{name:'找到你喜欢的那一张'})).toBeVisible();
  const after = await page.getByRole('img',{name:'AI 生成的完整微海报',exact:true}).evaluateAll(xs=>xs.map(x=>x.getAttribute('src')));
  expect(after[0]).toBe(before[0]); expect(after[1]).not.toBe(before[1]); expect(after[2]).toBe(before[2]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-final.png`, fullPage: true });
});


test('visual review of the creative screens with a real image fixture', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button',{name:'进入绒页',exact:true}).click();
  await page.getByLabel('从相册选择照片').setInputFiles('public/visuals/hero.webp');
  await page.waitForTimeout(500);
  await page.locator('.idea-block').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const el = document.querySelector('.idea-block'); if (el) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 75); });
  await page.screenshot({path:`test-results/${testInfo.project.name}-inputs-viewport.png`});
  await page.locator('.inspiration-section').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const el = document.querySelector('.inspiration-section'); if (el) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 75); });
  await page.screenshot({path:`test-results/${testInfo.project.name}-inspiration-viewport.png`});
  await page.getByRole('button',{name:'设计 3 套提示词',exact:true}).click();
  const promptEditor = page.getByRole('textbox', { name: '方案 A 的提示词' });
  const originalPrompt = await promptEditor.inputValue();
  await promptEditor.fill(originalPrompt.replace('构图：', '布局：'));
  await expect(page.getByRole('button',{name:'按当前提示词生成 3 张',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'恢复模型原稿',exact:true}).tap();
  await expect(promptEditor).toHaveValue(originalPrompt);
  await page.getByRole('button',{name:'按当前提示词生成 3 张',exact:true}).click();
  await expect(page.getByRole('heading',{name:'找到你喜欢的那一张'})).toBeVisible();
  await expect(page.getByRole('img',{name:'AI 生成的完整微海报'}).first()).toBeVisible();
  await page.screenshot({path:`test-results/${testInfo.project.name}-results-viewport.png`});
  await expect(page.getByText('已自动暂存最近一次结果，仅此浏览器可恢复。')).toBeVisible();
  await page.getByRole('button',{name:'我的作品',exact:true}).click();
  await page.getByRole('button',{name:'继续创作',exact:true}).waitFor();
  await page.screenshot({path:`test-results/${testInfo.project.name}-library-viewport.png`});
  await page.getByRole('button',{name:'继续创作',exact:true}).click();
  await page.getByRole('button',{name:'生成小红书文案',exact:true}).click();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await page.screenshot({path:`test-results/${testInfo.project.name}-copy-select-viewport.png`});
  await page.getByRole('button',{name:'生成小红书文案',exact:true}).click();
  await expect(page.getByRole('button',{name:/选择文案方案/})).toHaveCount(3);
  await page.getByRole('button',{name:'选择文案方案 B',exact:true}).click();
  await expect(page.getByRole('button',{name:'复制选中文案',exact:true})).toBeEnabled();
  await page.screenshot({path:`test-results/${testInfo.project.name}-copy-viewport.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
