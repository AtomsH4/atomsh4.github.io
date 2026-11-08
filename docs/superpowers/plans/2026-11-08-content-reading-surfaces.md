# Content Reading Surfaces Implementation Plan

> **For agentic workers:** Use inline execution for this approved, bounded CSS change.

**Goal:** Give blog and note articles a full-width soft background, original centered 54rem content width, and smaller gaps near the header and footer.

**Architecture:** Add shared surface and muted-text tokens to the existing global stylesheet. Scope translucent index styling to direct `main` children and draw a feathered article background with an isolated `main::before` layer in the existing article stylesheet, without changing page markup.

**Tech Stack:** Astro, CSS, existing Playwright checks.

---

### Task 1: Shared colors and index surfaces

**File:** `src/styles/global.css`

- [x] Add `--color-reading-surface: rgb(255 255 255 / 56%)` and `--color-reading-muted: #545970` to `:root`; add dark overrides `rgb(31 33 53 / 62%)` and `#c7c8da` in the existing color-scheme media query.
- [x] Apply these tokens only to the index grids:

```css
main > :is(.entry-grid--blog, .entry-grid--notes) {
  --color-card: var(--color-reading-surface);
  --color-muted: var(--color-reading-muted);
}

main > .entry-grid--notes {
  padding-inline: clamp(1.25rem, 3vw, 2rem);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  background: var(--color-reading-surface);
}

main > .entry-grid--blog > .entry-card,
main > .entry-grid--notes {
  border-color: transparent;
  box-shadow: none;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
```

### Task 2: Full-width background with independent prose width

**File:** `src/styles/article.css`

- [x] Add the article surface before the existing title and prose rules:

```css
main:has(> .reading-article) {
  --reading-inset: var(--page-gutter);
  --reading-fade: clamp(10rem, 24vh, 20rem);
  --color-muted: var(--color-reading-muted);
  position: relative;
  isolation: isolate;
  width: 100%;
  max-width: none;
  margin-inline: 0;
  padding: clamp(1rem, 2vw, 1.5rem) var(--reading-inset);
}

body:has(.reading-article) > main:has(> .page-hero) {
  margin-block: var(--space-2);
}

body:has(.reading-article) > .site-footer {
  margin-block-start: var(--space-2);
}

main:has(> .reading-article)::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: var(--color-reading-surface);
  mask-image: linear-gradient(
    transparent,
    #000 var(--reading-fade),
    #000 calc(100% - var(--reading-fade)),
    transparent
  );
  pointer-events: none;
  content: '';
}

main:has(> .reading-article) > .page-hero {
  max-width: var(--content-prose);
  margin-inline: auto;
}

main:has(> .reading-article) > .page-hero > p:first-child {
  color: color-mix(in srgb, var(--color-accent) 85%, var(--color-text));
}

.prose.reading-article {
  min-width: 0;
  max-width: var(--content-prose);
  margin-inline: auto;
  overflow-wrap: anywhere;
}
```

Keep the article-specific hero and prose maximum width at 54rem so content stays centered independently of the background. The main container covers the viewport; the background spans both sides without a horizontal fade. Restore the existing article and table desktop expectations to 864px and compare actual main bounds with viewport bounds; keep 390px phone expectations at 350px.

### Task 3: Verify and preview

- [x] Run `npm run build`; expect Astro checks and static generation to pass.
- [x] Run `npx playwright test tests/e2e/article-reading.spec.ts tests/e2e/blog-tables.spec.ts tests/e2e/notes.spec.ts tests/e2e/cherry-architecture-blog.spec.ts --workers=4 --output=test-results/reading-surfaces-restored-prose-e2e`; expect the existing checks to pass.
- [x] Use local Playwright to inspect `/blog/cherry-studio-doctor-state-boundaries/` and `/notes/leetcode-sql50-solutions/` in light and dark themes at 320, 390, 577, 768, 1440 and 1920px. Expect background bounds to match the viewport, no page overflow, desktop article width 864px at 1440px and 1920px, and phone article width 350px at 390px.
- [x] Inspect saved desktop and phone screenshots and open the existing local dev-server preview at port 4322. Record verification results in the design document.

### Task 4: Reduce the reserved header/footer spacing

- [x] Restore the fade to `clamp(10rem, 24vh, 20rem)` and shrink article main block margins to 8px, article footer top margin to 8px, and article block padding to 16–24px. Keep content width unchanged.
- [x] Strengthen the article eyebrow color with an 85% accent / 15% body-text mix so the longer fade retains readable labels.
- [x] Run the production build and inspect both article ends for representative blog and note pages in light/dark themes at 320×668, 390×844 and 1440×1000. Check 8px header/background gap, 16px background/footer gap, actual text/background contrast, full-width background, unchanged centered content width and absence of horizontal overflow. Store screenshots and measurements in `test-results/reading-surfaces/tighter-spacing/`.
