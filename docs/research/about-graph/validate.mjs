import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';

// Numerical feasibility probe only: no page, event handlers, or particle renderer.
const branches = [
  { id: 'music', label: '音乐', angle: -3 * Math.PI / 4, children: ['R&B', '摇滚', '流行'] },
  { id: 'coding', label: '编程', angle: -Math.PI / 4, children: ['技术栈', '项目', 'ACM'] },
  { id: 'anime', label: '二次元', angle: 3 * Math.PI / 4, children: ['轻音少女', 'EVA'] },
  { id: 'games', label: '游戏', angle: Math.PI / 4, children: ['荒野大镖客', '卡牌', '肉鸽', '解谜'] },
];
const canonical = [{ id: 'atomsh', label: 'AtomsH', parentId: null, depth: 0 }];
for (const b of branches) {
  canonical.push({ id: b.id, label: b.label, parentId: 'atomsh', depth: 1 });
  b.children.forEach((label, i) => canonical.push({ id: `${b.id}-${i}`, label, parentId: b.id, depth: 2 }));
}
canonical.forEach(Object.freeze);
Object.freeze(canonical);
const originalJSON = JSON.stringify(canonical);
assert.equal(canonical.length, 17);
assert.equal(new Set(canonical.map(n => n.id)).size, 17);
assert.equal(canonical.filter(n => n.parentId).length, 16);
function depthOf(node, items, visited = new Set()) {
  assert(!visited.has(node.id), 'cycle');
  if (!node.parentId) return 0;
  visited.add(node.id);
  const parent = items.find(n => n.id === node.parentId);
  assert(parent, 'missing parent');
  return 1 + depthOf(parent, items, visited);
}
canonical.forEach(n => assert.equal(depthOf(n, canonical), n.depth));
const withThirdLevel = [...canonical, { id: 'probe-only', label: 'test-only', parentId: 'coding-1', depth: 3 }];
assert.equal(depthOf(withThirdLevel.at(-1), withThirdLevel), 3);

// Conservative circular proxies, NOT measured browser glyph boxes.
const radius = n => n.depth === 0 ? 44 : Math.max(28, [...n.label].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? 14 : 8), 0) / 2 + 12);
function desktopTargets() {
  return canonical.map(n => {
    if (n.depth === 0) return { ...n, tx: 0, ty: 0, fx: 0, fy: 0 };
    const b = branches.find(b => b.id === (n.depth === 1 ? n.id : n.parentId));
    const i = b.children.indexOf(n.label);
    const angle = b.angle + (n.depth === 2 ? (i - (b.children.length - 1) / 2) * 0.29 : 0);
    return { ...n, tx: Math.cos(angle) * (n.depth === 1 ? 190 : 370), ty: Math.sin(angle) * (n.depth === 1 ? 140 : 245) };
  });
}
function focusedTargets(branch) {
  return canonical.filter(n => n.depth === 0 || n.id === branch.id || n.parentId === branch.id).map(n => {
    if (n.depth === 0) return { ...n, tx: 0, ty: -190, fx: 0, fy: -190 };
    if (n.depth === 1) return { ...n, tx: 0, ty: -62 };
    const i = branch.children.indexOf(n.label);
    return { ...n, tx: (i % 2 ? 1 : -1) * 65, ty: 65 + Math.floor(i / 2) * 120 };
  });
}
function createSimulation(targets) {
  const nodes = targets.map(n => ({ ...n, x: n.tx, y: n.ty }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = nodes.filter(n => n.parentId).map(n => ({ source: n.parentId, target: n.id }));
  const simulation = forceSimulation(nodes).stop().velocityDecay(0.5)
    .force('links', forceLink(links).id(n => n.id).strength(0.2).distance(l => Math.hypot(l.source.tx - l.target.tx, l.source.ty - l.target.ty)))
    .force('charge', forceManyBody().strength(-80))
    .force('collision', forceCollide(n => radius(n) + 6).iterations(3))
    .force('x', forceX(n => n.tx).strength(0.25))
    .force('y', forceY(n => n.ty).strength(0.25));
  return { nodes, byId, simulation };
}
function geometry(nodes, width, height) {
  const overlaps = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < radius(a) + radius(b)) overlaps.push([a.id, b.id]);
  }
  const outside = nodes.filter(n => Math.abs(n.x) + radius(n) > width / 2 || Math.abs(n.y) + radius(n) > height / 2).map(n => n.id);
  return {
    overlaps, outside,
    extent: {
      left: Math.min(...nodes.map(n => n.x - radius(n))),
      right: Math.max(...nodes.map(n => n.x + radius(n))),
      top: Math.min(...nodes.map(n => n.y - radius(n))),
      bottom: Math.max(...nodes.map(n => n.y + radius(n))),
    },
  };
}
const desktop = createSimulation(desktopTargets());
desktop.simulation.tick(300);
const desktopGeometry = geometry(desktop.nodes, 1120, 620);
assert.deepEqual(desktopGeometry.overlaps, []);
assert.deepEqual(desktopGeometry.outside, []);
assert.equal(desktop.byId.get('atomsh').x, 0);
assert.equal(desktop.byId.get('atomsh').y, 0);
const dragged = desktop.byId.get('music-0');
dragged.fx = -80;
dragged.fy = 120;
desktop.simulation.alpha(0.6).tick(30);
assert.equal(dragged.x, -80);
assert.equal(dragged.y, 120);
dragged.fx = null;
dragged.fy = null;
desktop.simulation.alpha(1).tick(300);
assert.equal(desktop.byId.get('atomsh').x, 0);
assert.equal(desktop.byId.get('atomsh').y, 0);
assert.deepEqual(geometry(desktop.nodes, 1120, 620).overlaps, []);
assert.deepEqual(geometry(desktop.nodes, 1120, 620).outside, []);
assert.equal(JSON.stringify(canonical), originalJSON);
const mobile = branches.map(b => {
  const result = createSimulation(focusedTargets(b));
  result.simulation.tick(300);
  const g = geometry(result.nodes, 280, 560);
  assert.deepEqual(g.overlaps, [], b.id);
  assert.deepEqual(g.outside, [], b.id);
  return { branch: b.label, nodes: result.nodes.length, geometry: g };
});
const timings = [];
for (let i = 0; i < 35; i++) {
  const start = performance.now();
  const s = createSimulation(desktopTargets());
  s.simulation.tick(300);
  const duration = performance.now() - start;
  if (i >= 5) timings.push(duration);
}
timings.sort((a, b) => a - b);
const modules = ['d3-force', 'react-force-graph-2d'].map(name => {
  const content = readFileSync(new URL(`${name}.bundle.js`, import.meta.url));
  return { name, rawBytes: content.length, gzipBytes: gzipSync(content).length };
});
const extentWidth = desktopGeometry.extent.right - desktopGeometry.extent.left;
const mobileScale = 280 / extentWidth;
const report = {
  kind: 'numerical feasibility probe; not a UI/FPS benchmark',
  node: process.version,
  topology: { nodes: canonical.length, edges: 16, depth: 2, thirdLevelParentModel: true },
  modules,
  checks: { ssrImport: true, rootFixed: true, canonicalImmutable: true, numericalDragRelease: true },
  desktop: { stageWidth: 1120, stageHeight: 620, geometry: desktopGeometry },
  focusedMobile: { stageWidth: 280, stageHeight: 560, branches: mobile },
  naiveMobile: { scale: mobileScale, scaled44pxTarget: 44 * mobileScale },
  compute: { measuredRuns: 30, warmupRuns: 5, ticksPerRun: 300, p50Ms: timings[14], p95Ms: timings[28] },
};
writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
