import { expect, test } from '@playwright/test';

test('推荐页的 3D 模块加载失败时仍可筛选和切换作品', async ({ page }) => {
  await page.route(/\/_astro\/RecommendationStage\.[^/]+\.js(?:\?.*)?$/, (route) => route.abort());
  await page.goto('/recommendations/');

  await expect(page.getByText('3D 初始化失败，当前使用 CSS 立体视图。', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '旋转 我表示理解' })).toBeVisible();

  await page.getByRole('button', { name: '书籍', exact: true }).click();
  await expect(page.getByRole('heading', { name: '月亮与六便士', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: '下一项' }).click();
  await expect(page.getByRole('heading', { name: '献给阿尔吉侬的花束', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: /外部详情/ })).toHaveAttribute('target', '_blank');
});

test('窄屏长标题与舞台分配独立空间且保留 WebGL', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/recommendations/#leave-the-door-open');

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-recommendation-stage-ready', 'true');
  const bounds = await canvas.boundingBox();
  const toolbar = await page.getByRole('toolbar', { name: '筛选推荐' }).boundingBox();
  expect(bounds).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
  expect(bounds!.height).toBeGreaterThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});
