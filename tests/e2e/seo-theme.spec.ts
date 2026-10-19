import { expect, test, type Locator } from '@playwright/test';

const site = 'https://atomsh4.github.io';
const pagePaths = [
  '/', '/blog/', '/notes/', '/projects/', '/recommendations/', '/about/',
  '/blog/cherry-studio-local-voice-architecture/',
  '/notes/leetcode-sql50-solutions/',
];

for (const pathname of pagePaths) {
  test(`页面提供独立摘要、规范网址和分享信息：${pathname}`, async ({ page }) => {
    await page.goto(`${pathname}?from=share#section`, { waitUntil: 'domcontentloaded' });
    const description = page.locator('head meta[name="description"]');
    await expect(description).toHaveCount(1);
    const summary = await description.getAttribute('content');
    expect(summary?.trim().length).toBeGreaterThan(0);
    await expect(page.locator('head title')).toHaveCount(1);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', `${site}${pathname}`);
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute('content', `${site}${pathname}`);
    await expect(page.locator('head meta[property="og:title"]')).toHaveAttribute('content', await page.title());
    await expect(page.locator('head meta[property="og:description"]')).toHaveAttribute('content', summary!);
    await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute('content', `${site}/media/site/social.png`);
    await expect(page.locator('head meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('head meta[name="twitter:description"]')).toHaveAttribute('content', summary!);
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);

    if (/\/(blog|notes)\/.+/.test(pathname)) {
      expect(summary).toBe(await page.locator('main > .page-hero > p').last().textContent());
      const json = page.locator('head script[type="application/ld+json"]');
      await expect(json).toHaveCount(1);
      const article = JSON.parse((await json.textContent())!);
      expect(article).toMatchObject({
        '@type': 'BlogPosting',
        mainEntityOfPage: `${site}${pathname}`,
        headline: await page.locator('h1').textContent(),
        description: summary,
        author: { '@type': 'Person', name: 'AtomsH4', url: `${site}/about/` },
      });
      expect(Number.isNaN(Date.parse(article.datePublished))).toBe(false);
      expect(article).not.toHaveProperty('dateModified');
      await expect(page.locator('head meta[property="article:published_time"]')).toHaveAttribute('content', article.datePublished);
      await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute('content', 'article');
    } else {
      await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute('content', 'website');
      await expect(page.locator('head script[type="application/ld+json"]')).toHaveCount(0);
    }
  });
}

test('爬虫入口只列出正式页面，分享图和站点图标可访问', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(`Sitemap: ${site}/sitemap-index.xml`);
  const index = await request.get('/sitemap-index.xml');
  expect(index.ok()).toBe(true);
  const sitemaps = [...(await index.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => new URL(match[1]));
  expect(sitemaps.length).toBeGreaterThan(0);
  const urls: string[] = [];
  for (const sitemap of sitemaps) {
    expect(sitemap.origin).toBe(site);
    const response = await request.get(sitemap.pathname);
    expect(response.ok()).toBe(true);
    urls.push(...[...(await response.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]));
  }
  expect(new Set(urls).size).toBe(urls.length);
  for (const pathname of pagePaths) expect(urls).toContain(`${site}${pathname}`);
  await Promise.all(urls.map(async (url) => {
    const address = new URL(url);
    expect(address.origin).toBe(site);
    expect(address.pathname).not.toMatch(/Atoms-H\.github\.io|404/);
    const response = await request.get(address.pathname);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain(`rel="canonical" href="${url}"`);
    expect(html).not.toMatch(/http-equiv="refresh"|content="noindex/);
  }));
  const image = await request.get('/media/site/social.png');
  expect(image.headers()['content-type']).toContain('image/png');
  const png = await image.body();
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  const icon = await request.get('/favicon.svg');
  expect(icon.ok()).toBe(true);
  expect(icon.headers()['content-type']).toContain('image/svg+xml');
});

test('404 禁止索引且不声明正式内容的 canonical', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('head script[type="application/ld+json"]')).toHaveCount(0);
});

const assertReadableButton = async (button: Locator) => {
  const colors = await button.evaluate(element => {
    const style = getComputedStyle(element);
    const channels = (value: string) => [...value.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)]
      .map(match => match.slice(1).map(Number));
    return { text: channels(style.color)[0], backgrounds: channels(style.backgroundImage) };
  });
  const luminance = (rgb: number[]) => rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  expect(colors.backgrounds).toHaveLength(2);
  for (const background of colors.backgrounds) {
    const values = [luminance(colors.text), luminance(background)];
    const contrast = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    expect(contrast, `button colors: ${JSON.stringify(colors)}`).toBeGreaterThanOrEqual(4.5);
  }
};

for (const colorScheme of ['light', 'dark'] as const) {
  test(`主按钮在${colorScheme}主题及交互状态下可读`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    for (const pathname of ['/', '/404.html']) {
      await page.goto(pathname);
      const button = page.locator('.button-primary');
      await assertReadableButton(button);
      await button.hover();
      await assertReadableButton(button);
      await page.mouse.move(0, 0);
      await page.keyboard.press('Tab');
      await button.focus();
      await expect(button).toBeFocused();
      expect(await button.evaluate(element => element.matches(':focus-visible'))).toBe(true);
      await assertReadableButton(button);
    }
  });
}
