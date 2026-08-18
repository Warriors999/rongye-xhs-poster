import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('completes the mobile poster flow with the mock provider', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '进入绒页' }).click();
  await page.getByLabel('从相册选择照片').setInputFiles({
    name: 'knit-doll.png',
    mimeType: 'image/png',
    buffer: onePixelPng
  });
  await page.getByRole('textbox', { name: /我的创作想法/ }).fill('复古玩具店橱窗，暖黄色灯光，带一点童话感');
  await expect(page.getByRole('button', { name: '生成 3 张海报' })).toBeVisible();
  await page.getByRole('button', { name: '生成 3 张海报' }).click();

  await expect(page.getByRole('heading', { name: '选一张，直接保存' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('可爱种草')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存这张' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('绒页-cute');

  await expect(page.getByRole('button', { name: '全部保存' })).toBeVisible();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-final.png`, fullPage: true });
});
