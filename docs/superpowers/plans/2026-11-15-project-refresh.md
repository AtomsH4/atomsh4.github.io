# Project Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the approved nine project entries and put Cherry Studio first.

**Architecture:** Keep project content in Astro's Markdown collection. Add an
optional project-specific display order and use one helper for both project
lists, leaving date ordering for other collections intact.

**Tech Stack:** Astro, TypeScript, Markdown frontmatter, Vitest, Playwright.

---

## Task 1: Project order

Files: `src/content.config.ts`, `src/lib/content.ts`,
`src/lib/content.test.ts`, `src/pages/index.astro`,
`src/pages/projects/index.astro`.

- [x] Add the optional project schema field:

```ts
order: z.number().int().nonnegative().optional(),
```

- [x] Export the project helper and switch both project lists to it:

```ts
export type ProjectEntry = DatedEntry & { data: { order?: number } };

export const getPublishedProjects = <T extends ProjectEntry>(entries: T[]): T[] =>
  getPublishedEntries(entries).sort(
    (left, right) =>
      (left.data.order ?? Number.MAX_SAFE_INTEGER)
      - (right.data.order ?? Number.MAX_SAFE_INTEGER),
  );
```

- [x] Verify that ordered entries precede newer unordered entries, drafts stay
  hidden, date order breaks equal/missing priorities, and input order is preserved.
  Run `npm test -- src/lib/content.test.ts src/content.config.test.ts`.

## Task 2: Approved project content

Files: all nine entries under `src/data/projects/`.

- [x] Update the four existing summaries and matching bodies using the confirmed
  copy. Keep `own`, `member`, and `fork` roles unchanged.
- [x] Add `adaptive-ai-gateway.md`, `qt-device-workbench.md`, `thesisctl.md`,
  `cherry-studio-skills.md`, and `s2scr-data.md` with public repository links,
  descriptions, dates, tags, `kind: own`, and `draft: false`.
- [x] Set Cherry Studio's order to 0, gateway to 1, workbench to 2, and Rust
  frontend-tools to 3. Only these four entries have `featured: true`.

## Task 3: Browser and build verification

File: `tests/e2e/site.spec.ts`.

- [x] Update homepage expectations to the approved four-card order.
- [x] Verify the projects page has nine cards, Cherry Studio is first, its
  description names the delivered features, and its official link is retained.
- [x] Run `npm run build` and the affected Playwright cases in `site.spec.ts`.
- [x] Inspect the project sections at desktop and mobile widths for overflow
  and ordering. Confirm `git diff --check` is clean.

## Verification results

- 20 relevant Vitest tests passed.
- Production build completed successfully.
- Both affected Playwright browser tests passed.
- Desktop (1440 × 1000) and mobile (390 × 844) inspections confirmed the four selected projects, all nine project entries, Cherry Studio first, and no horizontal overflow or browser page errors.
- `git diff --check` passed.
