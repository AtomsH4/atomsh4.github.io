import { expect, test } from '@playwright/test';

interface MotionFrame {
  phase: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
  inkX: number;
  inkY: number;
  inkWidth: number;
  inkHeight: number;
  targetInkX: number;
  targetInkY: number;
  targetInkWidth: number;
  targetInkHeight: number;
  opacity: string;
  targetVisibility: string;
  clipPath: string;
}

test.use({
  launchOptions: { args: ['--disable-gpu', '--disable-software-rasterizer'] },
  video: { mode: 'on', size: { width: 1280, height: 720 } },
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1440, height: 480 },
  { width: 390, height: 844 },
]) {
test(`${viewport.width}×${viewport.height} 全屏花体持续可见地移动并无跳变落位`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const frames: MotionFrame[] = [];
    (window as unknown as { signatureMotionFrames: MotionFrame[] }).signatureMotionFrames = frames;
    const sample = () => {
      const intro = document.querySelector<HTMLElement>('home-intro');
      const artwork = intro?.querySelector('[data-intro-artwork]');
      const targetArtwork = document.querySelector('[data-signature-target] > svg');
      const sourceInk = artwork?.querySelector('.signature-letter');
      const targetInk = targetArtwork?.querySelector('.signature-letter');
      const visual = intro?.querySelector('[data-intro-visual]');
      if (intro && artwork && targetArtwork && sourceInk && targetInk && visual) {
        const box = artwork.getBoundingClientRect();
        const destination = targetArtwork.getBoundingClientRect();
        const ink = sourceInk.getBoundingClientRect();
        const destinationInk = targetInk.getBoundingClientRect();
        frames.push({
          phase: intro.dataset.phase ?? 'writing',
          x: box.x, y: box.y, width: box.width, height: box.height,
          targetX: destination.x, targetY: destination.y,
          targetWidth: destination.width, targetHeight: destination.height,
          inkX: ink.x, inkY: ink.y, inkWidth: ink.width, inkHeight: ink.height,
          targetInkX: destinationInk.x, targetInkY: destinationInk.y,
          targetInkWidth: destinationInk.width, targetInkHeight: destinationInk.height,
          opacity: getComputedStyle(artwork).opacity,
          targetVisibility: getComputedStyle(targetArtwork).visibility,
          clipPath: getComputedStyle(visual).clipPath,
        });
        if (intro.dataset.phase === 'complete') return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const intro = page.locator('home-intro');
  const title = page.getByRole('heading', { name: 'AtomsH', exact: true, level: 1 });
  await expect(intro).toBeHidden({ timeout: 8000 });
  const frames = await page.evaluate(() => (window as unknown as { signatureMotionFrames: MotionFrame[] }).signatureMotionFrames);
  await testInfo.attach('motion-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
  const start = frames.filter(frame => frame.phase === 'writing' && frame.width > 0).at(-1)!;
  expect(start).toBeDefined();
  const centerDistance = (box: MotionFrame) => Math.hypot(
    box.x + box.width / 2 - box.targetX - box.targetWidth / 2,
    box.y + box.height / 2 - box.targetY - box.targetHeight / 2,
  );
  const during = frames.find(frame => frame.phase === 'moving' && centerDistance(frame) < centerDistance(start) * 0.8 && centerDistance(frame) > 2)!;
  expect(during).toBeDefined();
  expect(centerDistance(during)).toBeLessThan(centerDistance(start));
  expect(during.opacity).toBe('1');
  expect(during.targetVisibility).toBe('hidden');
  expect(during.clipPath).not.toBe('none');

  const lastMoving = frames.filter(frame => frame.phase === 'moving').at(-1)!;
  const complete = frames.find(frame => frame.phase === 'complete')!;
  expect(complete).toBeDefined();
  // Compare the painted letter, including SVG letterboxing, across the handoff.
  expect(Math.abs(lastMoving.inkX - complete.targetInkX)).toBeLessThan(0.5);
  expect(Math.abs(lastMoving.inkY - complete.targetInkY)).toBeLessThan(0.5);
  expect(Math.abs(lastMoving.inkWidth - complete.targetInkWidth)).toBeLessThan(0.5);
  expect(Math.abs(lastMoving.inkHeight - complete.targetInkHeight)).toBeLessThan(0.5);

  await expect(title.locator('svg')).toBeVisible();
  await expect(page.getByText('个人博客与项目记录', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '最近博客', exact: true })).toBeVisible();
  const quote = (await page.locator('.home-quote').boundingBox())!;
  const landed = (await title.boundingBox())!;
  const hero = (await page.locator('.home-hero').boundingBox())!;
  expect(landed.x).toBeLessThan(hero.x);
  expect(landed.y).toBeLessThan(hero.y);
  expect(quote.y).toBeGreaterThan(landed.y + landed.height);
  expect(quote.x + quote.width).toBeGreaterThan(hero.x + hero.width * 0.85);
  expect(quote.y + quote.height).toBeGreaterThan(hero.y + hero.height * 0.75);
  expect(await page.locator('.home-hero').evaluate(element => getComputedStyle(element).overflow)).toBe('hidden');
  expect(Math.abs(landed.width - during.targetWidth)).toBeLessThan(1);
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).overflowY)).not.toBe('hidden');
  await expect(page.getByRole('link', { name: '博客', exact: true, includeHidden: true })).toHaveAttribute('href', '/blog/');
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), animations: 'allow' });
  expect(errors).toEqual([]);
});
}

test('开场无跳过按钮，书写及位移时点击全屏均可跳过，并保留键盘操作', async ({ page }) => {
  for (const action of ['background', 'artwork', 'moving', 'escape', 'tab']) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('home-intro')).toBeVisible();
    await expect(page.locator('home-intro button')).toHaveCount(0);

    if (action === 'background') {
      await page.mouse.click(12, 12);
    } else if (action === 'artwork') {
      await page.locator('[data-intro-artwork]').click();
    } else if (action === 'moving') {
      await expect(page.locator('home-intro')).toHaveAttribute('data-phase', 'moving', { timeout: 5000 });
      await page.waitForFunction(() => {
        const visual = document.querySelector('[data-intro-visual]')!;
        return parseFloat(getComputedStyle(visual).clipPath.match(/inset\(([-\d.]+)/)?.[1] ?? '0') > 20;
      });
      await page.mouse.click(12, page.viewportSize()!.height - 12);
    } else {
      await page.keyboard.press(action === 'escape' ? 'Escape' : 'Tab');
    }

    await expect(page.locator('home-intro')).toBeHidden();
    expect(await page.locator('body').evaluate(element => getComputedStyle(element).overflowY)).not.toBe('hidden');
    await expect(page.getByRole('heading', { name: 'AtomsH', exact: true, level: 1 })).toBeVisible();
  }
});

test('减少动态效果直接展示首页，切换偏好也能结束开场', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('home-intro')).toBeHidden();
  await expect(page.getByRole('link', { name: '博客', exact: true })).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('home-intro')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('home-intro')).toBeHidden();
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).overflowY)).not.toBe('hidden');
});

test('禁用 JavaScript 时开场仍会自动淡出并可阅读首页', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('home-intro')).toBeHidden({ timeout: 6500 });
    await expect(page.locator('home-intro button')).toHaveCount(0);
    await page.getByRole('link', { name: '博客', exact: true }).click();
    await expect(page).toHaveURL(/\/blog\/$/);
  } finally {
    await context.close();
  }
});

test('手机位移中改变尺寸后花体落到正确布局且不溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('home-intro')).toHaveAttribute('data-phase', 'moving', { timeout: 5000 });
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator('home-intro')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'AtomsH', exact: true }).locator('svg')).toBeVisible();
  const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, available: document.documentElement.clientWidth }));
  expect(size.content).toBeLessThanOrEqual(size.available);
  expect(await page.locator('.home-quote').evaluate(element => getComputedStyle(element).textAlign)).toBe('right');
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).overflowY)).not.toBe('hidden');
});
