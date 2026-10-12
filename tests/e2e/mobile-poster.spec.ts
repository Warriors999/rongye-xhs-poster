import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('completes the mobile poster flow with the mock provider', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '把每只玩偶，做成一张好看的图。' })).toBeVisible();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-home.png`, fullPage: true });
  await page.getByRole('button', { name: '进入绒页' }).click();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-create.png`, fullPage: true });
  await expect(page.getByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).toBeVisible();
  await page.getByLabel('从相册选择照片').setInputFiles({
    name: 'knit-doll.png',
    mimeType: 'image/png',
    buffer: onePixelPng
  });
  await page.getByRole('textbox', { name: /我的创作想法/ }).fill('复古玩具店橱窗，暖黄色灯光，带一点童话感');
  await expect(page.getByRole('button', { name: '生成 3 张海报' })).toBeVisible();
  await page.getByRole('button', { name: '生成 3 张海报' }).click();

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
  await page.getByRole('button', {name:'保存到作品库',exact:true}).click();
  await expect(page.getByText('已保存到此浏览器的作品库。')).toBeVisible();
  await page.reload();
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
