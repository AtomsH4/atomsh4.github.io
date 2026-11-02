import { expect, test } from '@playwright/test';

const articles = [
  'cherry-studio-doctor-state-boundaries',
  'cherry-studio-print-window-ownership',
  'cherry-studio-lifecycle-skill',
];

for (const width of [390, 1440]) {
  for (const slug of articles) {
    test(`只读表格与正文等宽且对齐：${width} ${slug}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/blog/${slug}/`);
      const region = page.locator('article .read-only-table');
      await expect(region).toHaveCount(1);
      await expect(region).toHaveCSS('overflow-x', 'auto');
      await expect(region).toHaveAttribute('tabindex', '0');
      await expect(region.locator('table')).toHaveCount(1);
      await expect(region.locator('input, textarea, select, button, [contenteditable]')).toHaveCount(0);
      const metrics = await region.evaluate(element => ({
        width: element.getBoundingClientRect().width,
        x: element.getBoundingClientRect().x,
        articleWidth: element.closest('article')!.getBoundingClientRect().width,
        textWidth: element.closest('article')!.querySelector(':scope > p')!.getBoundingClientRect().width,
        textX: element.closest('article')!.querySelector(':scope > p')!.getBoundingClientRect().x,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(metrics.width).toBeLessThanOrEqual(metrics.articleWidth);
      expect(metrics.width).toBe(width === 1440 ? 864 : 350);
      expect(metrics.width).toBe(metrics.textWidth);
      expect(Math.abs(metrics.x - metrics.textX)).toBeLessThanOrEqual(1);
      expect(metrics.pageOverflow).toBe(0);
      if (width === 390) expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
      else expect(metrics.scrollWidth).toBe(metrics.clientWidth);
    });
  }
}

test('手机宽度可用方向键滚动表格且保留焦点提示', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/blog/cherry-studio-doctor-state-boundaries/');
  const region = page.getByRole('region', { name: '表格 1，可左右滚动' });
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(region).toBeFocused();
  await expect(region).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBe(0);
});

test('禁用 JavaScript 仍可阅读并滚动表格', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/blog/cherry-studio-lifecycle-skill/`);
    const region = page.getByRole('region', { name: '表格 1，可左右滚动' });
    await expect(region).toBeVisible();
    await expect(region.getByRole('table')).toBeVisible();
    await expect(region).toHaveCSS('overflow-x', 'auto');
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test('所有博客表格均自动使用组件，包括一篇文章中的多张表', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/blog/');
  const paths = await page.locator('.entry-card h2 a').evaluateAll(links =>
    links.map(link => link.getAttribute('href')!),
  );
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    await page.goto(path);
    const tables = page.locator('article table');
    await expect(page.locator('article .read-only-table > table')).toHaveCount(await tables.count());
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBe(0);
  }
});
