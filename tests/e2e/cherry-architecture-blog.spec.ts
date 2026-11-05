import { expect, test } from '@playwright/test';

const articles = [
  {
    slug: 'cherry-studio-print-window-ownership',
    title: 'Cherry Studio 笔记打印中的窗口归属与跨进程分工',
    pullRequest: 'https://github.com/CherryHQ/cherry-studio/pull/16681',
    mergedAt: '2026-07-07T08:29:56.000Z',
    date: '2026年7月7日',
    topic: '先确定打印的是哪一份内容',
  },
  {
    slug: 'cherry-studio-doctor-state-boundaries',
    title: 'Cherry Studio System Doctor 的前后端状态边界',
    pullRequest: 'https://github.com/CherryHQ/cherry-studio/pull/20006',
    mergedAt: '2026-09-18T08:58:43.000Z',
    date: '2026年9月18日',
    topic: '后端结果与前端会话不是同一种状态',
  },
];
const lifecycleTitle = '用 Skill 梳理 Cherry Studio 的生命周期设计';
const lifecyclePath = '/blog/cherry-studio-lifecycle-skill/';
const imageArticles = [
  ...articles.map(({ slug }) => ({ slug, imageCount: 1 })),
  { slug: 'cherry-studio-lifecycle-skill', imageCount: 2 },
  { slug: 'cherry-studio-local-voice-architecture', imageCount: 1 },
  { slug: 'cherry-studio-trash-state-machine', imageCount: 3 },
];

test('架构复盘按 PR 合并时间归档并保持时间倒序', async ({ page }) => {
  await page.goto('/blog/');

  for (const article of articles) {
    const card = page.locator('.entry-card').filter({
      has: page.getByRole('link', { name: article.title, exact: true }),
    });
    await expect(card).toHaveCount(1);
    await expect(card.locator('time')).toHaveAttribute(
      'datetime',
      article.mergedAt,
    );
    await expect(card.locator('time')).toHaveText(article.date);
  }

  await expect(page.getByRole('link', { name: lifecycleTitle, exact: true }))
    .toHaveAttribute('href', lifecyclePath);
  const lifecycleCard = page.locator('.entry-card').filter({
    has: page.getByRole('link', { name: lifecycleTitle, exact: true }),
  });
  await expect(lifecycleCard.locator('time')).toHaveAttribute('datetime', '2026-10-02T00:00:00.000Z');
  const dates = await page.locator('.entry-card time').evaluateAll((elements) =>
    elements.map((element) => Date.parse(element.getAttribute('datetime')!)),
  );
  expect(dates).toEqual([...dates].sort((a, b) => b - a));
});

for (const article of articles) {
  test(`架构复盘可读并关联来源和生命周期长文：${article.slug}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(`/blog/${article.slug}/`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(article.title);
    const body = page.locator('article.prose');
    await expect(body.getByRole('heading', { name: article.topic, exact: true }))
      .toBeVisible();
    await expect(body.locator(`a[href="${article.pullRequest}"]`).first())
      .toBeVisible();
    const lifecycleLink = body.getByRole('link', { name: lifecycleTitle, exact: true });
    await expect(lifecycleLink).toHaveAttribute('href', lifecyclePath);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(0);

    await lifecycleLink.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lifecycleTitle);
  });
}

for (const article of imageArticles) {
  test(`博客配图在当前页放大，点击图片关闭并保留阅读位置：${article.slug}`, async ({ page }) => {
    const articlePath = `/blog/${article.slug}/`;
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(articlePath);
      const figures = page.locator('article.prose figure');
      await expect(figures).toHaveCount(article.imageCount);

      for (const figure of await figures.all()) {
        const image = figure.locator('img');
        const trigger = figure.getByRole('button', { name: /^放大图片：/ });
        await expect(trigger).toHaveCount(1);
        await image.scrollIntoViewIfNeeded();
        await expect(image).toHaveAttribute('alt', /.+/);
        await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
        )).toBe(true);
        await expect(figure.locator('figcaption')).toContainText('再次点击图片关闭');
        const imagePath = await image.getAttribute('src');
        const alt = await image.getAttribute('alt');
        const readingPosition = await page.evaluate(() => window.scrollY);
        const articleBounds = (await page.locator('article.prose').boundingBox())!;

        await image.click();
        const dialog = page.getByRole('dialog', { name: '图片预览', exact: true });
        const preview = dialog.getByRole('img');
        await expect(dialog).toBeVisible();
        await expect(preview).toHaveAttribute('src', new URL(imagePath!, page.url()).href);
        await expect(preview).toHaveAttribute('alt', alt!);
        await expect.poll(() => preview.evaluate((element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
        )).toBe(true);
        await expect(page).toHaveURL(articlePath);
        expect(page.context().pages()).toHaveLength(1);
        const backgroundBounds = (await page.locator('article.prose').boundingBox())!;
        expect(backgroundBounds.x).toBe(articleBounds.x);
        expect(backgroundBounds.width).toBe(articleBounds.width);
        const bounds = (await preview.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(16);
        expect(bounds.y).toBeGreaterThanOrEqual(16);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 16);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(884);

        await preview.click();
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingPosition);
        await expect(page).toHaveURL(articlePath);
      }

      expect(await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )).toBeLessThanOrEqual(0);
    }
  });
}

test('图片浮层支持键盘和遮罩关闭，打开期间锁定背景滚动', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/blog/cherry-studio-doctor-state-boundaries/');
  const trigger = page.getByRole('button', { name: /^放大图片：/ });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  const readingPosition = await page.evaluate(() => window.scrollY);
  const dialog = page.getByRole('dialog', { name: '图片预览', exact: true });

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '关闭图片预览', exact: true })).toBeFocused();
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingPosition);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Space');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingPosition);
});

test('禁用 JavaScript 时博客配图和原图链接仍可阅读', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/blog/cherry-studio-doctor-state-boundaries/');
    const image = page.locator('article.prose figure img');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
      element.complete && element.naturalWidth > 0,
    )).toBe(true);
    await expect(page.getByRole('link', { name: '查看 Doctor 状态归属原图', exact: true }))
      .toHaveAttribute('href', '/media/blog/cherry-studio-doctor/state-ownership.svg');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('随笔不重复收录博客中的架构文章', async ({ page }) => {
  await page.goto('/notes/');
  await expect(page.getByRole('heading', { name: '随笔', exact: true })).toBeVisible();
  for (const title of [...articles.map((article) => article.title), lifecycleTitle]) {
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
  }
});
