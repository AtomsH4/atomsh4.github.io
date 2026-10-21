import { expect, test } from '@playwright/test';

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

test('随笔展示迁入的题解而非空状态', async ({ page }) => {
  await page.goto('/notes/');
  await expect(
    page.getByRole('heading', { name: '随笔', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('随笔正在整理中。', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.entry-card')).toHaveCount(7);
});

test('首页以博客与精选项目为主要入口', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('link', { name: '博客', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '随笔', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '项目', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /技能/i })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '精选项目', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Atoms-H Blog|AtomsH4 Profile/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'frontend-tools', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'CourseSelectionSystem', exact: true }),
  ).toBeVisible();
});

test('项目卡展示 Cherry Studio 成员身份并链接官方仓库', async ({ page }) => {
  await page.goto('/projects/');

  const card = page
    .locator('.entry-card')
    .filter({ has: page.getByRole('heading', { name: 'Cherry Studio', exact: true }) });
  const repositoryLink = card.locator('a.entry-repository');

  await expect(card.locator('.entry-kind')).toHaveText('member');
  await expect(card).toContainText('作为项目成员参与 Cherry Studio 开源协作');
  await expect(card).not.toContainText('学习仓库');
  await expect(card).not.toContainText('fork');
  await expect(repositoryLink).toHaveAttribute(
    'href',
    'https://github.com/CherryHQ/cherry-studio',
  );
  await expect(repositoryLink).toHaveAttribute('target', '_blank');
  await expect(repositoryLink).toHaveAttribute('rel', /\bnoreferrer\b/);
  await expect(
    card.locator('a[href^="/projects/"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: /Atoms-H Blog|AtomsH4 Profile/ }),
  ).toHaveCount(0);
});

test('未知路径显示自定义 404 页面并提供返回首页入口', async ({ page }) => {
  await page.goto('/does-not-exist/');

  await expect(
    page.getByRole('heading', { name: '页面未找到', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '返回首页', exact: true }),
  ).toHaveAttribute('href', '/');
});

test('移动端导航可打开并显示导航链接', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const navigation = page.getByRole('navigation', {
    name: '主导航',
    exact: true,
  });
  const toggle = navigation.getByRole('button', {
    name: '打开导航',
    exact: true,
  });

  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(navigation.locator('#site-navigation')).toHaveAttribute(
    'data-open',
    'true',
  );
  await expect(
    navigation.getByRole('link', { name: '博客', exact: true }),
  ).toBeVisible();
});

test('推荐页提供分类、首批内容和安全外链', async ({ page }) => {
  await page.goto('/recommendations/');

  await expect(
    page.getByRole('heading', { name: '推荐', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '音乐' })).toBeVisible();
  await expect(page.getByRole('button', { name: '书籍' })).toBeVisible();
  await expect(page.getByRole('button', { name: '影视与动画' })).toBeVisible();
  await expect(page.getByRole('button', { name: '音乐' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '全部' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '我表示理解', level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /外部详情/ })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(page.getByRole('link', { name: /外部详情/ })).toHaveAttribute(
    'rel',
    /noreferrer/,
  );

  const nextButton = page.getByRole('button', { name: '下一项' });
  await nextButton.click();
  await nextButton.click();
  await nextButton.click();
  await expect(
    page.getByRole('heading', { name: 'Back in Black', level: 2 }),
  ).toBeVisible();
  const sourceLink = page.locator(
    'a[href="https://musicbrainz.org/release-group/d3bc1a64-7561-3787-b680-0003aa50f8f1"]',
  );
  await expect(sourceLink).toContainText('Cover Art Archive');
  await expect(sourceLink).toContainText('在新标签页打开');
  await expect(sourceLink).toHaveAttribute('target', '_blank');
  await expect(sourceLink).toHaveAttribute(
    'rel',
    /\bnoopener\b.*\bnoreferrer\b/,
  );

  await page.getByRole('button', { name: '书籍' }).click();
  await expect(
    page.getByRole('heading', { name: '月亮与六便士', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Standard Ebooks contributors/ }),
  ).toBeVisible();
});

test('推荐页首屏展示海报舞台和左上信息', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/recommendations/', {
    waitUntil: 'domcontentloaded',
  });

  const poster = page.getByTestId('recommendation-poster');
  const canvas = page.locator('canvas');
  const metadata = page.locator('[data-recommendation-metadata]');
  await expect(canvas).toBeVisible();
  await expect(metadata).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  const metadataBox = await metadata.boundingBox();

  expect(canvasBox).not.toBeNull();
  expect(metadataBox).not.toBeNull();
  expect(canvasBox!.y).toBeLessThan(260);
  expect(metadataBox!.x).toBeLessThan(180);
  expect(metadataBox!.y).toBeLessThan(260);
  await expect(page.getByRole('button', { name: '音乐' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '全部' })).toHaveCount(0);
  await expect(poster).not.toContainText('克制而有张力');
});

test('推荐页分类单色弥散背景全局覆盖且首页保持原主题', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/recommendations/');

  const poster = page.getByTestId('recommendation-poster');
  const recommendationBody = page.locator('body');
  const recommendationRoot = page.locator('html');
  const accent = () =>
    poster.evaluate((element) =>
      getComputedStyle(element)
        .getPropertyValue('--recommendation-accent-rgb')
        .trim(),
    );
  const pageAccent = () =>
    recommendationRoot.evaluate((element) =>
      getComputedStyle(element)
        .getPropertyValue('--recommendation-page-accent-rgb')
        .trim(),
    );

  await expect(poster).toHaveAttribute('data-category', 'music');
  await expect.poll(accent).toBe('196 79 50');
  await expect.poll(pageAccent).toBe('196 79 50');
  await expect(recommendationBody).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(recommendationBody).toHaveCSS('background-image', 'none');
  await expect(recommendationRoot).toHaveCSS(
    'background-color',
    'rgb(235, 229, 219)',
  );
  await expect
    .poll(() =>
      recommendationRoot.evaluate(
        (element) => getComputedStyle(element).backgroundImage,
      ),
    )
    .toContain('radial-gradient');
  const musicFilter = page.getByRole('button', { name: '音乐' });
  await expect(musicFilter).toHaveCSS('background-color', 'rgb(122, 44, 27)');
  await musicFilter.focus();
  await expect(musicFilter).toHaveCSS('outline-color', 'rgb(122, 44, 27)');
  await expect(page.locator('[data-recommendation-metadata] > p')).toHaveCSS(
    'color',
    'rgb(122, 44, 27)',
  );
  await expect(
    page.getByTestId('recommendation-diffusion-backdrop'),
  ).toBeVisible();
  const experience = page.locator('[data-recommendation-experience]');
  const diffusionBackdrop = page.getByTestId(
    'recommendation-diffusion-backdrop',
  );
  await expect(experience).toHaveCSS('overflow-x', 'clip');
  const experienceBox = await experience.boundingBox();
  const backdropBox = await diffusionBackdrop.boundingBox();
  const viewportSize = page.viewportSize();
  expect(experienceBox).not.toBeNull();
  expect(backdropBox).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect(experienceBox!.x).toBeLessThanOrEqual(0);
  expect(experienceBox!.x + experienceBox!.width).toBeGreaterThanOrEqual(
    viewportSize!.width,
  );
  expect(backdropBox!.x).toBeLessThanOrEqual(0);
  expect(backdropBox!.x + backdropBox!.width).toBeGreaterThanOrEqual(
    viewportSize!.width,
  );
  await expect(poster).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(poster).toHaveCSS('border-top-width', '0px');
  await expect(poster).toHaveCSS('border-radius', '0px');
  await expect(poster).toHaveCSS('box-shadow', 'none');
  const catalogHorizontalOverflow = await page.evaluate(() =>
    Math.max(
      document.body.scrollWidth - document.body.clientWidth,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  );
  expect(catalogHorizontalOverflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: '书籍' }).click();
  await expect(poster).toHaveAttribute('data-category', 'book');
  await expect.poll(accent).toBe('173 118 31');
  await expect.poll(pageAccent).toBe('173 118 31');
  await expect(page.getByRole('button', { name: '书籍' })).toHaveCSS(
    'background-color',
    'rgb(105, 65, 6)',
  );

  await page.getByRole('button', { name: '影视与动画' }).click();
  await expect(poster).toHaveAttribute('data-category', 'screen');
  await expect.poll(accent).toBe('71 114 85');
  await expect.poll(pageAccent).toBe('71 114 85');
  await expect(page.getByRole('button', { name: '影视与动画' })).toHaveCSS(
    'background-color',
    'rgb(41, 78, 55)',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const homeBody = page.locator('body');
  await expect(homeBody).not.toHaveClass(/home-recommendation-theme/);
  await expect(homeBody).toHaveCSS('background-color', 'rgb(245, 247, 252)');
  await expect(page.locator('[data-recommendation-experience]')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '最近推荐', exact: true }),
  ).toHaveCount(0);
  const homeHorizontalOverflow = await page.evaluate(() =>
    Math.max(
      document.body.scrollWidth - document.body.clientWidth,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  );
  expect(homeHorizontalOverflow).toBeLessThanOrEqual(0);
});

test('推荐页支持作品深链', async ({ page }) => {
  await page.goto('/recommendations/#flipped');
  await expect(page.getByRole('heading', { name: '怦然心动' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '影视与动画' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('推荐页支持根节点键盘循环和分类首项切换', async ({ page }) => {
  await page.goto('/recommendations/#wo-biao-shi-li-jie');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('推荐');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

  const experience = page.locator('[data-recommendation-experience]');
  const status = page.getByRole('status');
  await expect(
    page.getByRole('heading', { name: '我表示理解', level: 2 }),
  ).toBeVisible();
  await expect(status).toBeEmpty();
  await experience.focus();
  await experience.press('ArrowLeft');

  await expect(
    page.getByRole('heading', { name: 'Back in Black', level: 2 }),
  ).toBeVisible();
  await expect(status).toHaveText('当前推荐：Back in Black');

  await page.getByRole('button', { name: '书籍' }).click();
  await expect(
    page.getByRole('heading', { name: '月亮与六便士', level: 2 }),
  ).toBeVisible();
  await expect(status).toHaveText('当前推荐：月亮与六便士');
});

test('推荐页在 WebGL 不可用时保留可拖动 CSS 立体视图', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => null,
    });
  });
  await page.route(
    '**/standardebooks/w-somerset-maugham_the-moon-and-sixpence/**/cover.jpg',
    (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150"><rect width="100" height="150" fill="#161616"/></svg>',
      }),
  );

  await page.goto('/recommendations/');

  await expect(
    page.getByText('当前设备使用 CSS 立体视图。', { exact: true }),
  ).toBeVisible();
  const object = page.locator('[data-css-recommendation-active]');
  const heading = page.getByRole('heading', { level: 2 });
  const activeTitle = await heading.textContent();
  await expect(object).toHaveAttribute('data-presentation', 'disc');
  const before = await object.getAttribute('style');
  const box = await object.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 + 25,
    { steps: 5 },
  );
  const during = await object.getAttribute('style');
  expect(during).not.toBe(before);
  await page.mouse.up();
  await expect(object).toHaveAttribute('style', /--rx:\s*0deg/);
  await expect(heading).toHaveText(activeTitle ?? '');
  await expect(page.locator('canvas')).toHaveCount(0);

  const cover = page.getByRole('img', { name: '我表示理解 封面' });
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  const detailLink = page.getByRole('link', { name: /我表示理解.*外部详情/ });
  await expect(detailLink).toBeVisible();
  await expect(detailLink).toHaveAttribute('target', '_blank');
  await expect(detailLink).toHaveAttribute(
    'rel',
    /\bnoopener\b.*\bnoreferrer\b/,
  );

  const stage = page.getByTestId('recommendation-fallback-stage');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (!stageBox) return;

  await page.mouse.move(
    stageBox.x + stageBox.width * 0.55,
    stageBox.y + stageBox.height * 0.12,
  );
  await page.mouse.down();
  await page.mouse.move(
    stageBox.x + stageBox.width * 0.28,
    stageBox.y + stageBox.height * 0.12,
    { steps: 8 },
  );
  await expect(stage).toHaveAttribute('data-panning', 'true');
  await page.mouse.up();

  await expect(heading).not.toHaveText(activeTitle ?? '');

  await page.getByRole('button', { name: '书籍' }).click();
  const bookCover = page.getByRole('img', { name: '月亮与六便士 封面' });
  await expect(bookCover).toBeVisible();
  await expect
    .poll(() =>
      bookCover.evaluate((image: HTMLImageElement) => [
        image.naturalWidth,
        image.naturalHeight,
      ]),
    )
    .toEqual([100, 150]);
  const bookFaceMetrics = await bookCover.evaluate((image) => ({
    faceHeight: image.parentElement?.clientHeight ?? 0,
    faceWidth: image.parentElement?.clientWidth ?? 0,
    imageHeight: image.clientHeight,
    imageWidth: image.clientWidth,
  }));
  expect(bookFaceMetrics.imageWidth).toBe(bookFaceMetrics.faceWidth);
  expect(bookFaceMetrics.imageHeight).toBe(bookFaceMetrics.faceHeight);
  expect(
    Math.abs(
      bookFaceMetrics.faceWidth / bookFaceMetrics.faceHeight - 3.12 / 4.12,
    ),
  ).toBeLessThanOrEqual(0.01);
  await expect(bookCover).toHaveCSS('object-fit', 'cover');
  await expect(bookCover.locator('..')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
});

test('推荐页在暗色系统偏好下仍保持浅色弥散背景', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/recommendations/');

  await expect(page.locator('html')).toHaveCSS(
    'background-color',
    'rgb(235, 229, 219)',
  );
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(48, 43, 36)');
});

test('推荐页在移动端遵循减少动态效果并保持纵向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/recommendations/');

  const experience = page.locator('[data-recommendation-experience]');
  await expect(experience).toHaveAttribute('data-reduced-motion', 'true');
  const diffusionTransitionDuration = await page
    .getByTestId('recommendation-diffusion-backdrop')
    .locator('span')
    .first()
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).transitionDuration),
    );
  expect(diffusionTransitionDuration).toBeLessThanOrEqual(0.00001);
  await expect(page.getByText(/封面来源：/)).toBeVisible();
  const metadataBox = await page
    .locator('[data-recommendation-metadata]')
    .boundingBox();
  const toolbarBox = await page
    .getByRole('toolbar', { name: '筛选推荐' })
    .boundingBox();
  expect(metadataBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(metadataBox!.y + metadataBox!.height).toBeLessThanOrEqual(
    toolbarBox!.y,
  );
  const heading = page.getByRole('heading', { level: 2 });
  const activeTitle = await heading.textContent();
  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) return;

  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.78,
    canvasBox.y + canvasBox.height * 0.14,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.16,
    canvasBox.y + canvasBox.height * 0.14,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(heading).not.toHaveText(activeTitle ?? '');

  const horizontalOverflow = await page.evaluate(() =>
    Math.max(
      document.body.scrollWidth - document.body.clientWidth,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);

  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await expect(page.getByText(/封面来源：/)).toBeVisible();
});

test('推荐页从 Canvas 空白处拖动会横向切换作品', async ({ page }) => {
  await page.goto('/recommendations/');

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute(
    'data-recommendation-stage-ready',
    'true',
  );
  const heading = page.getByRole('heading', { level: 2 });
  const before = await heading.textContent();
  const beforeHash = new URL(page.url()).hash;
  const box = await canvas.boundingBox();

  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.14);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.14, {
    steps: 8,
  });
  await expect(canvas).toHaveAttribute('data-track-panning', 'true');
  await page.mouse.up();

  await expect(heading).not.toHaveText(before ?? '');
  await expect(canvas).toHaveAttribute('data-track-panning', 'false');
  await expect.poll(() => new URL(page.url()).hash).not.toBe(beforeHash);
});

test('推荐页 Canvas 支持真实拖动并保持当前作品', async ({ page }) => {
  await page.goto('/recommendations/');
  await page.getByRole('button', { name: '音乐', exact: true }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute(
    'data-recommendation-stage-ready',
    'true',
  );
  await expect(canvas).toHaveCSS('touch-action', 'pan-y');
  const heading = page.getByRole('heading', { level: 2 });
  const activeTitle = await heading.textContent();
  const activeHash = new URL(page.url()).hash;
  const box = await canvas.boundingBox();

  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.height).toBeGreaterThanOrEqual(420);
  await page.waitForTimeout(500);
  const beforeDrag = await canvas.screenshot();

  // Avoid the transparent CD hub so the gesture begins on artwork.
  const centerX = box.x + box.width * 0.62;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY + 30, { steps: 5 });
  await expect(canvas).toHaveAttribute('data-track-panning', 'false');
  await page.waitForTimeout(100);
  const duringDrag = await canvas.screenshot();
  expect(duringDrag.equals(beforeDrag)).toBe(false);
  await page.mouse.up();
  await page.waitForTimeout(500);

  await expect(canvas).toBeVisible();
  await expect(heading).toHaveText(activeTitle ?? '');
  expect(new URL(page.url()).hash).toBe(activeHash);

  const contextLossHandled = await canvas.evaluate((element) => {
    const event = new Event('webglcontextlost', { cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(contextLossHandled).toBe(true);
  await expect(
    page.getByText('3D 初始化失败，当前使用 CSS 立体视图。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `旋转 ${activeTitle}` }),
  ).toBeVisible();
});
