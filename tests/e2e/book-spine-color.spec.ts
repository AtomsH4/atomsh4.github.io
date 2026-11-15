import { expect, test } from '@playwright/test';

test('书脊自动匹配封面左侧并在深浅封面之间切换文字颜色', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (contextId === 'webgl2' || contextId === 'webgl') return null;
      return original.call(this, contextId, ...args);
    } as typeof original;
  });

  const cover = (left: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="${left}"/><rect x="16" width="184" height="300" fill="#cc5577"/></svg>`;
  await page.route('**/w-somerset-maugham_the-moon-and-sixpence@master/images/cover.jpg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: cover('#1d3f57') }),
  );
  await page.route('**/b/id/10331950-L.jpg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: cover('#eee4ca') }),
  );
  await page.goto('/recommendations/#the-moon-and-sixpence', { waitUntil: 'domcontentloaded' });
  const object = page.locator('[data-css-recommendation-active]');
  const color = (property: string) => object.evaluate((element, name) =>
    getComputedStyle(element).getPropertyValue(name).trim(), property,
  );

  await expect.poll(() => color('--object-ink')).toBe('#1d3f57');
  await expect.poll(() => color('--object-text')).toBe('#fffaf0');
  await page.getByRole('button', { name: '下一项' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('献给阿尔吉侬的花束');
  await expect.poll(() => color('--object-ink')).toBe('#eee4ca');
  await expect.poll(() => color('--object-text')).toBe('#24211d');
});
