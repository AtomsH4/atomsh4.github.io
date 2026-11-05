# Blog Image Lightbox Implementation Plan

> **For agentic workers:** Use inline execution for this scoped, user-approved change. Steps use checkbox syntax for tracking.

**Goal:** 博客图片只在当前页浮层放大，点击图片关闭并回到阅读位置。

**Architecture:** 用 `BlogImageLightbox.astro` 封装原生模态 dialog、客户端图片按钮增强及浮层样式。博客正文模板只引用该组件；保留无 JavaScript 时的原图链接。所有改动均在当前工作区完成，保留已有未提交内容。

**Tech Stack:** Astro、TypeScript、原生 HTML dialog、CSS、Playwright。

---

### Task 1: 博客图片浮层

**Files:**
- Create: `src/components/BlogImageLightbox.astro`
- Modify: `src/pages/blog/[...slug].astro`

- [x] 新建独立组件，标记为 `dialog aria-label="图片预览"`，内部只有带关闭语义的按钮和图片。
- [x] 遍历 `.blog-article img`，将原图链接或独立图片转为 `button type="button"`，保留原有图片节点及宽高；按钮提供放大图片的名称和 dialog 关联。
- [x] 点击按钮把当前图片 URL 和 alt 赋予预览图片，记录原滚动位置和按钮，调用 `showModal()`。
- [x] 点击 dialog 任意区域调用 `close()`；原生按钮提供 Enter 和空格，dialog 提供 Esc。
- [x] 在 `close` 事件中以 `preventScroll` 恢复入口焦点，并立即恢复记录的阅读位置。
- [x] 用全屏透明 dialog、暗色 backdrop、等比例视口内图片和 `zoom-in` / `zoom-out` 光标实现简洁浮层；打开期间锁定背景滚动，保留滚动条占位。
- [x] 在博客正文模板的 article 后引用组件，不更改共享布局和随笔页面。

### Task 2: 同步图注与浏览器验收

**Files:**
- Modify: `src/data/blog/cherry-studio-doctor-state-boundaries.md`
- Modify: `src/data/blog/cherry-studio-lifecycle-skill.md`
- Modify: `src/data/blog/cherry-studio-local-voice-architecture.md`
- Modify: `src/data/blog/cherry-studio-print-window-ownership.md`
- Modify: `src/data/blog/cherry-studio-trash-state-machine.md`
- Modify: `tests/e2e/cherry-architecture-blog.spec.ts`

- [x] 把图片相关的“点击查看原图”改为“点击图片可放大查看，再次点击图片关闭”。为回收站文章剩余两张图补齐该提示。
- [x] 更新原有跳转原图断言，检查全部 5 篇文章的图片在 390px 和 1440px 下打开 dialog、URL 不变、替代文本相同、点击图片关闭且滚动位置和焦点恢复。
- [x] 增加一个键盘与滚动检查，覆盖 Enter、空格、Esc、遮罩和关闭图片按钮。
- [x] 运行 `npm run build`，预期 Astro 类型检查无错误并生成静态页面。
- [x] 运行 `npm run test:e2e -- tests/e2e/cherry-architecture-blog.spec.ts tests/e2e/article-reading.spec.ts tests/e2e/blog-tables.spec.ts tests/e2e/notes.spec.ts`，预期全部通过。
- [x] 在本地预览中查看桌面与手机浮层，并检查禁用 JavaScript 时仍有原图链接。
- [x] 检查 diff，确认未修改用户已有工作；记录实际验证结果。

## 验证结果

- `npm run build` 通过：Astro 检查 0 errors、0 warnings；保留内容 schema 弃用 hints 和现有大包提示。
- 最终定向浏览器检查 49 项全部通过，覆盖全部 8 张配图的 390px / 1440px 打开关闭、URL 不变、焦点及阅读位置恢复、键盘交互、背景滚动锁定、正文和表格宽度及无 JavaScript 降级。
- 最终运行命令：`npm run test:e2e -- tests/e2e/cherry-architecture-blog.spec.ts tests/e2e/article-reading.spec.ts tests/e2e/blog-tables.spec.ts tests/e2e/notes.spec.ts --grep-invert "文章排版与首页品牌标题"`。
- 首轮检查另发现未改动的首页字号用例仍要求品牌 h1 为 100px，而工作区已有首页 SVG 签名方案的 h1 为 16px；该用例在最终定向运行中排除。本次组件只接入博客模板，不调整已有首页改动或其检查。
- 已修复固定滚动条占位导致的 15px 正文变窄：改为仅在打开浮层时按实际滚动条宽度补偿；原有文章和表格布局检查通过。
- 本地浏览器实际点击打开、点击浮层图片关闭已确认；截图保存在 `test-results/blog-image-lightbox/preview.jpg`。
