import { expect, test } from '@playwright/test';

const articlePaths = [
  '/blog/cherry-studio-doctor-state-boundaries/',
  '/blog/cherry-studio-print-window-ownership/',
  '/blog/cherry-studio-lifecycle-skill/',
  '/notes/leetcode-sql50-solutions/',
];

for (const width of [390, 1440]) {
  for (const path of articlePaths) {
    test(`文章阅读布局居中且标题克制：${width} ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const metrics = await page.evaluate(() => {
        const article = document.querySelector('article.prose')!;
        const hero = document.querySelector('main > .page-hero')!;
        const title = hero.querySelector('h1')!;
        const bodyBox = article.getBoundingClientRect();
        const heroBox = hero.getBoundingClientRect();
        const titleStyle = getComputedStyle(title);
        return {
          bodyWidth: bodyBox.width,
          bodyCenter: bodyBox.x + bodyBox.width / 2,
          heroX: heroBox.x,
          bodyX: bodyBox.x,
          heroWidth: heroBox.width,
          viewportWidth: document.documentElement.clientWidth,
          fontSize: Number.parseFloat(titleStyle.fontSize),
          lineHeight: Number.parseFloat(titleStyle.lineHeight),
          textAlign: getComputedStyle(article).textAlign,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(metrics.fontSize).toBeGreaterThanOrEqual(28);
      expect(metrics.fontSize).toBeLessThanOrEqual(width < 600 ? 32 : 44);
      expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThanOrEqual(1.2);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(704);
      expect(Math.abs(metrics.bodyCenter - metrics.viewportWidth / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics.heroX - metrics.bodyX)).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics.heroWidth - metrics.bodyWidth)).toBeLessThanOrEqual(1);
      expect(['start', 'left']).toContain(metrics.textAlign);
      expect(metrics.overflow).toBeLessThanOrEqual(0);
    });
  }
}

test('文章排版与首页品牌标题、列表标题分别保持各自比例', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [path, expectedSize] of [['/', 100], ['/blog/', 64], ['/notes/', 64]] as const) {
    await page.goto(path);
    const fontSize = await page.getByRole('heading', { level: 1 }).evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(fontSize).toBe(expectedSize);
  }
});

for (const article of [
  {
    slug: 'cherry-studio-print-window-ownership',
    fragments: ['sourceContent !== undefined', 'windowManager.close(windowId)'],
  },
  {
    slug: 'cherry-studio-doctor-state-boundaries',
    fragments: ['buildDoctorViewModel(doctorState, now)', "type: 'finish-interaction'"],
  },
]) {
  test(`架构文章包含可读的代码摘录：${article.slug}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/blog/' + article.slug + '/');
    const blocks = page.locator('article.prose pre');
    await expect(blocks).toHaveCount(2);
    for (const [index, fragment] of article.fragments.entries()) {
      await expect(blocks.nth(index)).toContainText(fragment);
      await expect(blocks.nth(index)).toHaveCSS('overflow-x', 'auto');
    }
    const sources = page.getByRole('link', { name: /源码摘录来源/ });
    await expect(sources).toHaveCount(2);
    for (const source of await sources.all()) {
      await expect(source).toHaveAttribute('href', /github\.com\/CherryHQ\/cherry-studio\/blob\/[a-f0-9]{40}\/.*#L\d+-L\d+$/);
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(0);
  });
}
