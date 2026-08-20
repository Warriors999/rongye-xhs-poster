import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('completes the mobile poster flow with the mock provider', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '把每只玩偶，做成一张好看的图。' })).toBeVisible();
  await page.getByRole('button', { name: '进入绒页' }).click();
  await expect(page.getByRole('heading', { name: '把玩偶照片，变成小红书海报。' })).toBeVisible();
  await page.getByLabel('从相册选择照片').setInputFiles({
    name: 'knit-doll.png',
    mimeType: 'image/png',
    buffer: onePixelPng
  });
  await page.getByRole('textbox', { name: /我的创作想法/ }).fill('复古玩具店橱窗，暖黄色灯光，带一点童话感');
  await expect(page.getByRole('button', { name: '生成 3 张海报' })).toBeVisible();
  await page.getByRole('button', { name: '生成 3 张海报' }).click();

  await expect(page.getByRole('heading', { name: '选一张，直接保存' })).toBeVisible({ timeout: 15_000 });
  for (const direction of ['生活方式', '故事叙事', '编辑海报']) {
    await expect(page.getByText(direction, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '保存这张' })).toHaveCount(3);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存这张' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^绒页-(lifestyle|story|editorial)-\d+\.png$/);

  await expect(page.getByRole('button', { name: '全部保存 3 张' })).toBeVisible();
  await page.getByRole('button', { name: '全部保存 3 张' }).click();
  await expect(page.getByRole('button', { name: '已保存全部 3 张' })).toBeVisible();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-final.png`, fullPage: true });
});
