# Content Reading Surfaces Implementation Plan

> **For agentic workers:** Use inline execution for this approved, bounded CSS change.

**Goal:** Give blog and note content a stable reading background while retaining the surrounding gradient and current article widths.

**Architecture:** Add shared surface and muted-text tokens to the existing global stylesheet. Scope index styling to direct `main` children and style article `main` containers in the existing article stylesheet without changing page markup.

**Tech Stack:** Astro, CSS, existing Playwright checks.

---

### Task 1: Shared colors and index surfaces

**File:** `src/styles/global.css`

- [ ] Add `--color-reading-surface: rgb(255 255 255 / 96%)` and `--color-reading-muted: #545970` to `:root`; add dark overrides `rgb(30 32 49 / 98%)` and `#c7c8da` in the existing color-scheme media query.
- [ ] Apply these tokens only to the index grids:

```css
main > :is(.entry-grid--blog, .entry-grid--notes) {
  --color-card: var(--color-reading-surface);
  --color-muted: var(--color-reading-muted);
}

main > .entry-grid--notes {
  padding-inline: clamp(1.25rem, 3vw, 2rem);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  background: var(--color-reading-surface);
  box-shadow: var(--shadow-card);
}
```

### Task 2: Article surface with unchanged text widths

**File:** `src/styles/article.css`

- [ ] Add the article surface before the existing title and prose rules:

```css
main:has(> .reading-article) {
  --reading-inset: clamp(1.25rem, 4vw, 3rem);
  --color-muted: var(--color-reading-muted);
  width: min(calc(var(--content-prose) + 2 * var(--reading-inset)), 100%);
  padding: clamp(2rem, 4.5vw, 3.5rem) var(--reading-inset);
  border-radius: var(--radius-lg);
  background: var(--color-reading-surface);
  box-shadow: var(--shadow-card), inset 0 0 0 1px var(--color-card-border);
}
```

The inset border does not reduce layout width. Existing article and table expectations remain valid without selector changes.

### Task 3: Verify and preview

- [ ] Run `npm run build`; expect Astro checks and static generation to pass.
- [ ] Run `npx playwright test tests/e2e/article-reading.spec.ts tests/e2e/blog-tables.spec.ts tests/e2e/notes.spec.ts tests/e2e/cherry-architecture-blog.spec.ts tests/e2e/seo-theme.spec.ts --workers=4`; expect the existing checks to pass.
- [ ] Use local Playwright to inspect `/blog/`, `/notes/`, `/blog/cherry-studio-doctor-state-boundaries/`, and `/notes/leetcode-sql50-solutions/` in light and dark themes at 320, 390, 768 and 1440px. Expect no page overflow, unchanged phone and desktop text widths, and readable body and secondary text on the composited surface.
- [ ] Inspect saved desktop and phone screenshots and open the existing local dev-server preview at port 4322. Record verification results in the design document.
