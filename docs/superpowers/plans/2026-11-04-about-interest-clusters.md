# About Interest Clusters Implementation Plan

> **For agentic workers:** Execute inline in the current session under the user's confirmed design. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the about graph asymmetric depth, concrete works and projects, and a few meaningful cross-interest connections.

**Architecture:** Keep graph content and presentation separate. Extend the existing D3 layout to position nested clusters; render semantic relations independently of tree forces. React controls desktop expansion and compact navigation, while the runtime retains camera and position snapshots across cluster changes.

**Tech Stack:** Astro, React, TypeScript, D3 force, SVG, Canvas, Vitest, Playwright.

---

## Task 1: Content and visibility

**Files:** `src/features/about-graph/graph-data.ts`, `graph-presentation.ts`, `graph-model.test.ts`.

- [ ] Add the 13 nodes specified in the design, bringing the total to 30; keep existing node IDs.
- [ ] Export the default expansion IDs and semantic relations:

```ts
export const defaultExpandedIds = [...branches.map(b => b.id), 'music-rnb', 'music-rock', 'coding-projects'];
export type GraphRelation = { id: string; sourceId: string; targetId: string; label: string };
```

- [ ] Add meaningful previews and local fallbacks. Use appearance metadata for artwork works and small detail labels.
- [ ] Verify default desktop visibility is 22; expanding all parents exposes 30; collapsing a parent hides every descendant. Check compact navigation for `coding-projects` and all relation endpoints.
- [ ] Run `npm test -- src/features/about-graph/graph-model.test.ts` and inspect any failures before continuing.

## Task 2: Nested layout and relation rendering

**Files:** `graph-layout.ts`, `graph-runtime.ts`, `graph-model.test.ts`, `graph-runtime.test.ts`.

- [ ] Give the four branches distinct target positions; assign deeper nodes offsets around their immediate parent. Compact targets place path ancestors at separate vertical positions and children in two columns.
- [ ] Accept previous positions for desktop cluster changes and preserve a runtime snapshot:

```ts
export type GraphSnapshot = {
  view: { x: number; y: number; zoom: number };
  positions: ReadonlyMap<string, { x: number; y: number }>;
};
```

- [ ] Add optional relation group elements to runtime options. Set each group's camera transform, its path curve, and the midpoint label position from the two live endpoint coordinates. Skip missing endpoints.
- [ ] Change drift to a shared branch displacement plus a small per-node displacement. Keep root fixed and preserve held-node behavior.
- [ ] Verify nested child distances, compact ancestor positions, collision bounds, relation/camera alignment, retained snapshots, reduced motion, and lifecycle cleanup.
- [ ] Run `npm test -- src/features/about-graph/graph-model.test.ts src/features/about-graph/graph-runtime.test.ts`.

## Task 3: Experience and visual hierarchy

**Files:** `AboutGraphExperience.tsx`, `AboutGraphExperience.module.css`.

- [ ] Replace fixed expansion with state:

```ts
const [expanded, setExpanded] = useState(() => new Set<string>(defaultExpandedIds));
```

- [ ] Wire first selection to reveal children and repeated selection to toggle them. Reset restores the default set. Derive active relation endpoint IDs from hover/pinned/selected state.
- [ ] Save/restore runtime snapshots only when viewport, compact focus, and reset revision match; compact navigation and reset create fresh views.
- [ ] Render artwork, category, and detail treatments plus an unobtrusive child count/expand indicator. Add relation paths and labels without intercepting pointer input.
- [ ] Render a recursive static overview containing all descendants and existing destination links. Update screen reader instructions for nested browsing.
- [ ] Check labels, status announcements, keyboard reveal/Escape, image fallback, touch scrolling, and the center/music content constraints.

## Task 4: Verification and delivery

**Files:** `tests/e2e/about-graph.spec.ts`, `docs/research/2026-11-04-about-interest-clusters-validation.md`.

- [ ] Add interaction regressions for expanding/collapsing nested clusters with retained camera, relation highlighting, compact deep navigation, and no-Canvas/reduced-motion use.
- [ ] Run `npm test`; expect all unit tests to pass.
- [ ] Run `npm run build`; expect Astro checking and static generation to succeed.
- [ ] Use a local browser preview at desktop and 320px/390px widths. Check actual node rectangles and screenshot composition, including a default frame and expanded cluster.
- [ ] Run `npx playwright test tests/e2e/about-graph.spec.ts`; expect all cases to pass.
- [ ] Record actual validation and local preview URL. Deliver the completed local change without publication.
