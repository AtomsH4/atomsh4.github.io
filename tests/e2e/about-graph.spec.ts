import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1408, height: 900 } });

const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const stage = (page: Page) => page.locator('[data-graph-stage]');

async function openGraph(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Exercise missing music covers without letting third-party timing affect interactions.
  await page.route(/coverartarchive\.org|nflxso\.net/, route => route.abort());
  await page.goto('/about/', { waitUntil: 'domcontentloaded' });
  await expect(stage(page)).toHaveAttribute('data-ready', 'true');
}

async function expectReadable(page: Page, checkBounds: boolean | string[] = false) {
  await expect.poll(async () => page.locator('[data-graph-stage]').evaluate((element, bounds) => {
    const area = element.getBoundingClientRect();
    const nodes = [...element.querySelectorAll<HTMLElement>('[data-node-id]')].map(el => ({ id: el.dataset.nodeId!, rect: el.getBoundingClientRect() }));
    const issues: string[] = [];
    for (const { id, rect } of nodes) {
      if (bounds && (bounds === true || bounds.includes(id)) && (rect.left < area.left - 1 || rect.right > area.right + 1 || rect.top < area.top - 1 || rect.bottom > area.bottom + 1)) issues.push(`${id} outside stage (${Math.round(rect.left - area.left)}, ${Math.round(rect.top - area.top)}, ${Math.round(rect.right - area.left)}, ${Math.round(rect.bottom - area.top)})`);
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 1
        && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 1) issues.push(`${a.id} overlaps ${b.id}`);
    }
    return issues;
  }, checkBounds)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

async function expectCleanLabels(page: Page) {
  const extraText = await page.locator('[data-node-id]').evaluateAll(elements => elements
    .filter(el => el.textContent?.trim() !== el.getAttribute('aria-label'))
    .map(el => el.getAttribute('data-node-id')));
  expect(extraText).toEqual([]);
  const clippedLabels = await page.locator('[data-node-id]').evaluateAll(elements => elements.flatMap(element => {
    const heading = element.firstElementChild!;
    const label = heading.lastElementChild!;
    const headingRect = heading.getBoundingClientRect(), labelRect = label.getBoundingClientRect();
    return label.scrollWidth > label.clientWidth + 1 || labelRect.top < headingRect.top - 1 || labelRect.bottom > headingRect.bottom + 1
      ? [element.getAttribute('data-node-id')] : [];
  }));
  expect(clippedLabels).toEqual([]);
  expect(await page.locator('[data-node-id] > span:first-child').evaluateAll(headings => headings.every(heading => heading.children.length === 1))).toBe(true);
}

test('桌面星簇具有不同层级，展开保留缩放并可折叠和复位', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openGraph(page);
  await expect(page.locator('[data-node-id]')).toHaveCount(21);
  await expect(node(page, 'project-tools')).toHaveCount(0);
  await expect(node(page, 'project-courses')).toHaveCount(0);
  await expect(node(page, 'music-door')).toHaveCount(0);
  await expect(node(page, 'music-black')).toHaveCount(0);
  await expect(node(page, 'anime-deep-sea')).toHaveText('深海');
  await expect(node(page, 'anime-eva')).toHaveText('Eva');
  await expect(node(page, 'games-red-dead')).toHaveText('荒野大镖客2');
  await expect(node(page, 'games-disco-elysium')).toHaveText('极乐迪斯科');
  for (const id of ['music-understand', 'music-letter', 'games-cards', 'games-puzzle']) await expect(node(page, id)).toHaveCount(0);
  await expect(node(page, 'coding-algorithms')).toHaveText('算法');
  await expect(node(page, 'coding-deep-learning')).toHaveText('深度学习');
  await expect(page.getByRole('link', { name: '查看项目博客', exact: true })).toHaveAttribute('href', '/blog/');
  await expect(page.getByRole('link', { name: '查看算法笔记', exact: true })).toHaveAttribute('href', '/notes/');
  await expect(page.getByRole('link', { name: '查看项目博客', exact: true })).toHaveText('');
  await expect(page.getByRole('link', { name: '查看算法笔记', exact: true })).toHaveText('');
  for (const title of ['存在主义', '哲学']) {
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  }
  await expectCleanLabels(page);
  await expect(page.locator('[data-node-id] img')).toHaveCount(0);
  await expect(page.locator('[data-relation-id] text')).toHaveCount(0);
  await expectReadable(page, true);
  for (const id of ['concept-computer', 'concept-consciousness', 'concept-code']) await expect(node(page, id)).toHaveCount(0);
  for (const id of ['music-rnb', 'music-rock', 'music-pop']) {
    await node(page, id).focus();
    await node(page, id).press('Enter');
    await expect(node(page, id)).toHaveAttribute('data-expanded', 'false');
    expect(await node(page, id).getAttribute('aria-expanded')).toBeNull();
    await expect(node(page, id).locator('img')).toHaveCount(0);
    await expect(page.locator('[data-node-id]')).toHaveCount(21);
  }
  await stage(page).press('Home');
  await page.screenshot({ path: 'test-results/about-acm-topics/desktop.png' });
  for (const [id, file] of Object.entries({
    'games-disco-elysium': 'disco-elysium.jpg',
    'games-red-dead': 'red-dead-redemption-2.jpg',
    'anime-k-on': 'k-on.jpg',
    'anime-eva': 'eva.jpg',
    'anime-deep-sea': 'deep-sea-ocean.jpg',
  })) {
    await node(page, id).focus();
    await expect(node(page, id)).toHaveAttribute('data-expanded', 'true');
    const image = node(page, id).locator('img');
    await expect(image).toHaveAttribute('src', `/media/about-graph/${file}`);
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('[data-node-id] img')).toHaveCount(1);
    if (id === 'anime-eva') await page.screenshot({ path: 'test-results/about-acm-topics/expanded-eva.png' });
    if (id === 'anime-deep-sea') {
      await expectReadable(page);
      await page.screenshot({ path: 'test-results/about-acm-topics/expanded-deep-sea.png' });
    }
    await stage(page).press('Home');
    await expect(page.locator('[data-node-id] img')).toHaveCount(0);
  }
  await expect(page.locator('[data-node-id] img[src$=".svg"]')).toHaveCount(0);
  await expect(node(page, 'music-rnb').locator('img')).toHaveCount(0);
  await expect.poll(() => node(page, 'music-rnb').evaluate((el: HTMLElement) => el.offsetHeight)).toBe(44);
  await expectReadable(page);

  await node(page, 'coding-acm').focus();
  await node(page, 'coding-acm').press('Enter');
  await expect(page.locator('[data-node-id^="acm-"]')).toHaveCount(4);
  expect(await page.locator('[data-node-id^="acm-"]').allTextContents()).toEqual(['图论', '数论', '数据结构', '动态规划']);
  await expectReadable(page, ['acm-graph', 'acm-number-theory', 'acm-data-structures', 'acm-dp']);
  await expectCleanLabels(page);
  await page.screenshot({ path: 'test-results/about-acm-topics/desktop-acm.png' });
  await node(page, 'coding-acm').press('Enter');
  await expect(page.locator('[data-node-id^="acm-"]')).toHaveCount(0);
  await stage(page).press('+');
  await expect(stage(page)).toHaveAttribute('data-zoom', '1.380');
  await node(page, 'coding-stack').focus();
  const zoom = await stage(page).getAttribute('data-zoom');
  await node(page, 'coding-stack').press('Enter');
  await expect(page.locator('[data-node-id]')).toHaveCount(27);
  await expect(node(page, 'stack-python')).toHaveCount(1);
  expect(await page.locator('[data-node-id^="stack-"]').allTextContents()).toEqual(['React', 'Python', 'Electron', 'NodeJS', 'MySQL', 'C++']);
  await expectReadable(page, ['stack-react', 'stack-python', 'stack-electron', 'stack-nodejs', 'stack-mysql', 'stack-cpp']);
  await page.screenshot({ path: 'test-results/about-acm-topics/desktop-stack.png' });
  await expect(stage(page)).toHaveAttribute('data-zoom', zoom!);
  await expectReadable(page);
  await node(page, 'coding-stack').press('Enter');
  await expect(node(page, 'stack-python')).toHaveCount(0);
  await expect(page.locator('[data-node-id]')).toHaveCount(21);

  await stage(page).press('Home');
  await expect(stage(page)).toHaveAttribute('data-zoom', '1.200');
  await expect(node(page, 'atomsh')).toHaveAttribute('data-expanded', 'false');
  await node(page, 'atomsh').click();
  await expect(node(page, 'atomsh')).toHaveText('AtomsH');
  await expect(node(page, 'atomsh')).toHaveAttribute('data-expanded', 'false');
  await expect(node(page, 'atomsh').locator('img')).toHaveCount(0);
  await node(page, 'music').click();
  await expect(node(page, 'music')).toHaveAttribute('data-expanded', 'false');
  await expectCleanLabels(page);
  expect(errors).toEqual([]);
});

test('跨兴趣连线仅在相关节点交互时显示说明和另一端高亮', async ({ page }) => {
  await openGraph(page);
  const relation = page.locator('[data-relation-id="after-school"]');
  await expect(relation).toHaveAttribute('data-active', 'false');
  await node(page, 'anime-k-on').focus();
  await expect(relation).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-relation-id] text')).toHaveCount(0);
  await expect(node(page, 'music')).toHaveAttribute('data-related', 'true');
  await expect(relation).toHaveAttribute('transform', /^matrix\(/);
  await expectReadable(page);
  await page.screenshot({ path: 'test-results/about-acm-topics/related.png' });
  await stage(page).press('Escape');
  await expect(relation).toHaveAttribute('data-active', 'false');
  await node(page, 'concept-existentialism').focus();
  await expect(page.locator('[data-relation-id="existentialism-eva"]')).toHaveAttribute('data-active', 'true');
  await expect(node(page, 'anime-eva')).toHaveAttribute('data-related', 'true');
  await expect(node(page, 'concept-existentialism')).toHaveAttribute('data-expanded', 'false');
  await expectCleanLabels(page);
  await page.screenshot({ path: 'test-results/about-acm-topics/core-relations.png' });
});

for (const width of [320, 390]) {
  test(`${width}px 手机可深入项目与技术栈并沿路径返回`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openGraph(page);
    await expect(page.locator('[data-node-id]')).toHaveCount(7);
    await expectReadable(page, true);
    await expectCleanLabels(page);
    await page.screenshot({ path: `test-results/about-acm-topics/mobile-overview-${width}.png` });
    await node(page, 'coding').click();
    await node(page, 'coding-projects').click();
    await expect(page.locator('[data-node-id]')).toHaveCount(4);
    await expect(node(page, 'project-cherry')).toHaveCount(1);
    await expectReadable(page, true);
    await node(page, 'project-cherry').click();
    await expect(node(page, 'project-cherry')).toHaveAttribute('data-expanded', 'false');
    await expect(node(page, 'project-cherry')).toHaveAttribute('data-preview-type', 'none');
    await expect(node(page, 'project-cherry').locator('img')).toHaveCount(0);
    await expect.poll(() => node(page, 'project-cherry').evaluate((el: HTMLElement) => el.offsetHeight)).toBe(44);
    await expectReadable(page, true);
    await page.screenshot({ path: `test-results/about-acm-topics/mobile-${width}.png` });
    await node(page, 'coding').click();
    await expect(node(page, 'project-cherry')).toHaveCount(0);
    await node(page, 'coding-stack').click();
    await expect(node(page, 'stack-cpp')).toHaveCount(1);
    await expect(page.locator('[data-node-id^="stack-"]')).toHaveCount(6);
    await page.screenshot({ path: `test-results/about-acm-topics/mobile-stack-${width}.png` });
    await expectReadable(page, true);
    await node(page, 'coding').click();
    await node(page, 'coding-acm').click();
    await expect(page.locator('[data-node-id^="acm-"]')).toHaveCount(4);
    expect(await page.locator('[data-node-id^="acm-"]').allTextContents()).toEqual(['图论', '数论', '数据结构', '动态规划']);
    await expectReadable(page, true);
    await expectCleanLabels(page);
    await page.screenshot({ path: `test-results/about-acm-topics/mobile-acm-${width}.png` });
    await node(page, 'atomsh').click();
    await expect(page.locator('[data-node-id]')).toHaveCount(7);
    await expectReadable(page, true);
    for (const branch of ['music', 'games', 'anime']) {
      await node(page, branch).click();
      await expectCleanLabels(page);
      await expectReadable(page, true);
      await page.screenshot({ path: `test-results/about-acm-topics/mobile-${branch}-${width}.png` });
      if (branch === 'games') await expect(page.locator('[data-node-id]')).toHaveCount(4);
      if (branch === 'music') {
        for (const id of ['music-rnb', 'music-rock', 'music-pop']) {
          await node(page, id).click();
          await expect(node(page, id)).toHaveAttribute('data-expanded', 'false');
          await expect(page.locator('[data-node-id]')).toHaveCount(5);
          await expect(page.locator('[data-node-id] img')).toHaveCount(0);
        }
      }
      if (branch === 'anime') {
        await node(page, 'anime-deep-sea').click();
        await expect(node(page, 'anime-deep-sea')).toHaveAttribute('data-expanded', 'true');
        const image = node(page, 'anime-deep-sea').locator('img');
        await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
        await expectReadable(page, true);
        await page.screenshot({ path: `test-results/about-acm-topics/mobile-deep-sea-${width}.png` });
      }
      await node(page, 'atomsh').click();
    }
  });
}

test('无 Canvas 时仍可展开作品和恢复默认布局', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await openGraph(page);
  await expect(stage(page)).toHaveAttribute('data-animation-state', 'reduced');
  await node(page, 'music-pop').focus();
  await node(page, 'music-pop').press('Enter');
  await expect(node(page, 'music-pop')).toHaveAttribute('data-expanded', 'false');
  await expect(node(page, 'music-understand')).toHaveCount(0);
  await expect(node(page, 'music-letter')).toHaveCount(0);
  await node(page, 'anime-deep-sea').focus();
  await expect(node(page, 'anime-deep-sea')).toHaveAttribute('data-expanded', 'true');
  await expect.poll(() => node(page, 'anime-deep-sea').locator('img').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expectReadable(page);
  await page.screenshot({ path: 'test-results/about-acm-topics/expanded-music.png' });
  await stage(page).press('Home');
  await expect(page.locator('[data-node-id]')).toHaveCount(21);
});

test('无 JavaScript 回退仍包含深层内容和正确的站外链接', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/about/`, { waitUntil: 'domcontentloaded' });
    const overview = page.locator('[data-graph-stage] > div').filter({ has: page.getByRole('heading', { name: '音乐', exact: true }) });
    await expect(overview).toBeVisible();
    await expect(overview).toContainText('Python');
    for (const title of ['我表示理解', '给自己的情书', '卡牌', '解谜']) await expect(overview).not.toContainText(title);
    await expect(overview).toContainText('荒野大镖客2');
    await expect(overview).toContainText('极乐迪斯科');
    await expect(overview).toContainText('存在主义');
    await expect(overview).toContainText('哲学');
    for (const title of ['意识流', '计算机', '代码']) await expect(overview).not.toContainText(title);
    await expect(overview).toContainText('深海');
    await expect(overview).not.toContainText('Leave the Door Open');
    await expect(overview).not.toContainText('Back in Black');
    await expect(overview).not.toContainText('TypeScript');
    await expect(overview.getByRole('link', { name: '项目', exact: true })).toHaveAttribute('href', '/blog/');
    await expect(overview.getByRole('link', { name: '算法', exact: true })).toHaveAttribute('href', '/notes/');
    await expect(overview).not.toContainText('frontend-tools');
    await expect(overview).not.toContainText('选课系统');
    await expect(overview.getByRole('link', { name: '图论', exact: true })).toHaveAttribute('href', '/notes/acwing-maze-path/');
  } finally { await context.close(); }
});


test('项目和算法的独立链接可跳转博客和笔记', async ({ page }) => {
  await openGraph(page);
  await stage(page).press('+');
  const projectLink = page.getByRole('link', { name: '查看项目博客', exact: true });
  await projectLink.focus();
  await projectLink.press('Enter');
  await expect(page).toHaveURL(/\/blog\/$/);
  await expect(page.getByRole('heading', { name: '博客', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await openGraph(page);
  await node(page, 'coding').click();
  for (const name of ['查看项目博客', '查看算法笔记']) {
    const link = page.getByRole('link', { name, exact: true });
    const bounds = await link.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await expect(link).toHaveCSS('cursor', 'pointer');
  }
  await page.screenshot({ path: 'test-results/about-acm-topics/mobile-links.png' });
  await page.getByRole('link', { name: '查看算法笔记', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/$/);
  await expect(page.getByRole('heading', { name: '随笔', exact: true })).toBeVisible();
});
