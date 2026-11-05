import { describe, expect, it } from 'vitest';
import { branches, coreNodes, defaultExpandedIds, getChildren, getNodePath, getVisibleNodes, graphNodes, graphRelations } from './graph-data';
import { createLayout, type LayoutNode } from './graph-layout';
import { getLensScale } from './graph-motion';
import { getConstellationTarget } from './graph-constellation';
import { canPreviewNode, getNodePresentation } from './graph-presentation';

const expanded = new Set<string>(defaultExpandedIds);
const sizes = (nodes: typeof graphNodes, compact: boolean) => new Map(nodes.map(n => [n.id, {
  width: n.id === 'atomsh' ? compact ? 88 : 104 : n.appearance === 'concept' ? Math.max(68, [...n.label].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? 11 : 6), 0) + 24)
    : n.parentId === 'atomsh' ? 100 : Math.max(64, [...n.label].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? 13 : 7.5), 0) + 28 + (n.navigation ? 48 : 0)),
  height: n.id === 'atomsh' ? compact ? 88 : 104 : n.appearance === 'concept' ? compact ? 44 : 36
    : n.parentId === 'atomsh' ? 54 : n.appearance === 'detail' && !compact ? 36 : 44,
}]));

function expectReadable(nodes: LayoutNode[], width: number, height: number, overflow = 0) {
  for (const node of nodes) {
    expect(node.x - node.width * node.scale / 2).toBeGreaterThanOrEqual(-width * overflow);
    expect(node.y - node.height * node.scale / 2).toBeGreaterThanOrEqual(-height * overflow);
    expect(node.x + node.width * node.scale / 2).toBeLessThanOrEqual(width * (1 + overflow));
    expect(node.y + node.height * node.scale / 2).toBeLessThanOrEqual(height * (1 + overflow));
  }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const overlaps = Math.abs(a.x - b.x) < (a.width * a.scale + b.width * b.scale) / 2 && Math.abs(a.y - b.y) < (a.height * a.scale + b.height * b.scale) / 2;
    expect(overlaps, `${a.id} (${a.x.toFixed(1)}, ${a.y.toFixed(1)}, ${a.width}×${a.height}) overlaps ${b.id} (${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.width}×${b.height})`).toBe(false);
  }
}

describe('about graph content and navigation', () => {
  it('contains exactly the requested hierarchy and supports deeper parent paths', () => {
    expect(graphNodes).toHaveLength(31);
    expect(new Set(graphNodes.map(n => n.id)).size).toBe(31);
    expect(graphNodes.filter(n => n.parentId)).toHaveLength(30);
    expect(graphNodes.filter(n => n.parentId === 'coding-projects').map(n => n.id)).toEqual(['project-cherry']);
    expect(coreNodes.map(n => n.label)).toEqual(['存在主义', '哲学']);
    expect(coreNodes.every(n => n.parentId === 'atomsh')).toBe(true);
    expect(graphNodes.filter(n => ['concept-computer', 'concept-consciousness', 'concept-code', 'music-understand', 'music-letter', 'games-cards', 'games-puzzle'].includes(n.id))).toEqual([]);
    for (const id of ['music-rnb', 'music-rock', 'music-pop']) {
      expect(getChildren(id)).toEqual([]);
      expect(canPreviewNode(id)).toBe(false);
      expect(getNodePresentation(graphNodes.find(n => n.id === id)!).image).toBeUndefined();
    }
    expect(graphNodes.map(n => n.label)).toContain('荒野大镖客2');
    expect(graphNodes.map(n => n.label)).toContain('极乐迪斯科');
    expect(graphNodes.map(n => n.label)).toContain('K-ON!');
    expect(graphNodes.map(n => n.label)).toContain('Eva');
    expect(graphNodes.map(n => n.label)).toContain('深海');
    expect(graphNodes.filter(n => n.parentId === 'coding-stack').map(n => n.label)).toEqual(['React', 'Python', 'Electron', 'NodeJS', 'MySQL', 'C++']);
    expect(getChildren('coding-acm').map(n => n.label)).toEqual(['图论', '数论', '数据结构', '动态规划']);
    expect(getNodePath('coding-algorithms').map(n => n.label)).toEqual(['AtomsH', '编程', '算法']);
    expect(getNodePath('coding-deep-learning').map(n => n.label)).toEqual(['AtomsH', '编程', '深度学习']);
    const withThirdLevel = [...graphNodes, { id: 'test-project', label: 'test only', parentId: 'coding-projects', branch: 'coding' as const }];
    expect(getNodePath('test-project', withThirdLevel).map(n => n.id)).toEqual(['atomsh', 'coding', 'coding-projects', 'test-project']);
    expect(getNodePath('not-found')).toEqual([]);
  });
  it('rejects cycles and missing parents', () => {
    expect(() => getNodePath('bad', [{ id: 'bad', label: 'bad', parentId: 'missing', branch: null }])).toThrow('Missing parent');
    expect(() => getNodePath('bad', [{ id: 'bad', label: 'bad', parentId: 'bad', branch: null }])).toThrow('cycle');
  });
  it('hides descendants of collapsed categories while retaining category controls', () => {
    const withoutMusic = new Set(expanded);
    withoutMusic.delete('music');
    const visible = getVisibleNodes(false, withoutMusic, null);
    expect(visible).toHaveLength(18);
    expect(visible.some(n => n.id === 'music')).toBe(true);
    expect(visible.some(n => n.id === 'music-rnb')).toBe(false);
    expect(getVisibleNodes(false, new Set(), null)).toHaveLength(7);
  });
  it('opens interest branches and projects by default and hides all descendants when their parent closes', () => {
    const visible = getVisibleNodes(false, expanded, null);
    expect(visible).toHaveLength(21);
    expect(visible.map(n => n.id)).toEqual(expect.arrayContaining(['music-rnb', 'music-rock', 'anime-deep-sea', 'project-cherry']));
    expect(visible.some(n => n.id === 'stack-python')).toBe(false);
    const all = new Set(graphNodes.map(n => n.id));
    expect(getVisibleNodes(false, all, null)).toHaveLength(31);
    all.delete('coding');
    expect(getVisibleNodes(false, all, null).some(n => n.branch === 'coding' && n.id !== 'coding')).toBe(false);
  });
  it('keeps relations independent of the tree and gives every work a preview', () => {
    expect(new Set(graphRelations.map(r => r.id)).size).toBe(graphRelations.length);
    for (const relation of graphRelations) {
      expect(graphNodes.find(n => n.id === relation.sourceId)).toBeDefined();
      expect(graphNodes.find(n => n.id === relation.targetId)).toBeDefined();
      expect(relation.sourceId).not.toBe(relation.targetId);
    }
    for (const node of graphNodes.filter(n => n.appearance === 'artwork')) {
      expect(getNodePresentation(node).image?.src).toMatch(/^(https:\/\/|\/media\/about-graph\/)/);
    }
    for (const node of graphNodes) {
      const image = getNodePresentation(node).image;
      if (image) {
        expect(image.src).not.toMatch(/\.svg(?:$|\?)/);
        expect(image.fallback).toBeUndefined();
      }
      expect(canPreviewNode(node.id)).toBe(!!image);
      expect(getNodePresentation(node)).not.toHaveProperty('summary');
      expect(getNodePresentation(node)).not.toHaveProperty('keywords');
    }
  });
  it('shows a readable mobile overview and only the focused branch', () => {
    expect(getVisibleNodes(true, expanded, null).map(n => n.id)).toEqual(['atomsh', 'music', 'coding', 'anime', 'games', ...coreNodes.map(n => n.id)]);
    const games = getVisibleNodes(true, expanded, 'games');
    expect(games).toHaveLength(4);
    expect(games.every(n => n.id === 'atomsh' || n.branch === 'games')).toBe(true);
    expect(getVisibleNodes(true, expanded, 'invalid')).toHaveLength(7);
    expect(getVisibleNodes(true, expanded, 'coding-projects').map(n => n.id)).toEqual([
      'atomsh', 'coding', 'coding-projects', 'project-cherry',
    ]);
  });
});

describe('about graph constrained layout', () => {
  it('separates compact ancestors from children and gives deeper works their own neighborhood', () => {
    const visible = getVisibleNodes(true, expanded, 'coding-projects');
    const targets = visible.map(n => getConstellationTarget(n, visible, { width: 390, height: 640 }, true, 'coding-projects'));
    expect(targets[0].y).toBeLessThan(targets[1].y);
    expect(targets[1].y).toBeLessThan(targets[2].y);
    expect(targets[2].y).toBeLessThan(targets[3].y);
    const layout = createLayout(graphNodes, sizes(graphNodes, false), { width: 1280, height: 720 }, false, null);
    const project = layout.byId.get('coding-projects')!, cherry = layout.byId.get('project-cherry')!;
    expect(Math.hypot(project.tx - cherry.tx, project.ty - cherry.ty)).toBeGreaterThan(80);
    expect(Math.hypot(project.tx - cherry.tx, project.ty - cherry.ty)).toBeLessThan(220);
    const center = layout.byId.get('atomsh')!;
    for (const core of coreNodes) {
      const node = layout.byId.get(core.id)!;
      expect(Math.hypot(node.tx - center.tx, node.ty - center.ty)).toBeGreaterThan(95);
      expect(Math.hypot(node.tx - center.tx, node.ty - center.ty)).toBeLessThan(165);
    }
    layout.simulation.stop();
  });
  for (const size of [{ width: 760, height: 560 }, { width: 900, height: 420 }, { width: 1280, height: 440 }, { width: 1920, height: 900 }]) {
    for (const expandedId of ['anime-eva', 'games-disco-elysium', 'anime-deep-sea']) {
      it(`fits the full-page ${expandedId} card at ${size.width}×${size.height}`, () => {
        const compact = size.width < 900;
        const focus = compact && expandedId !== 'atomsh' ? graphNodes.find(n => n.id === expandedId)!.parentId : null;
        const visible = getVisibleNodes(compact, expanded, focus);
        const overflow = compact ? 0 : 0.3;
        const layout = createLayout(visible, sizes(visible, compact), size, compact, focus, { overflow });
        const card = layout.byId.get(expandedId)!;
        card.width = 208; card.height = 146;
        if (card.parentId) { card.fx = card.x; card.fy = card.y; }
        layout.simulation.alpha(1); layout.tick(240);
        expectReadable(layout.nodes, size.width, size.height, overflow);
        layout.simulation.stop();
      });
    }
  }
  it('moves continuously while retaining the center and readable hit areas', () => {
    const layout = createLayout(graphNodes, sizes(graphNodes, false), { width: 850, height: 700 }, false, null);
    const initial = layout.nodes.map(n => ({ x: n.x, y: n.y }));
    layout.simulation.alphaTarget(0.16);
    for (let i = 0; i < 300; i++) { layout.setMotion(i / 60); layout.tick(); if (i % 30 === 0) expectReadable(layout.nodes, 850, 700); }
    expect(layout.nodes.some((n, i) => Math.hypot(n.x - initial[i].x, n.y - initial[i].y) > 4)).toBe(true);
    expect(layout.byId.get('atomsh')).toMatchObject({ x: 425, y: 350 });
    layout.simulation.stop();
  });
  it('magnifies smoothly near the pointer and leaves far nodes unchanged', () => {
    expect(getLensScale(0)).toBe(1.25);
    expect(getLensScale(0, true)).toBe(1.12);
    expect(getLensScale(30)).toBeGreaterThan(getLensScale(90));
    expect(getLensScale(200)).toBe(1);
  });
  for (const width of [280, 350, 850]) {
    it(`makes room for an expanded image card at ${width}px`, () => {
      const compact = width < 700;
      const visible = getVisibleNodes(compact, expanded, compact ? 'games' : null);
      const layout = createLayout(visible, sizes(visible, compact), { width, height: compact ? 560 : 700 }, compact, compact ? 'games' : null);
      const card = layout.byId.get('games-disco-elysium')!;
      card.width = 208; card.height = 146; card.fx = card.x; card.fy = card.y;
      layout.simulation.alpha(1); layout.tick(240);
      expectReadable(layout.nodes, width, compact ? 560 : 700);
      layout.simulation.stop();
    });
  }
  for (const width of [278, 333]) for (const item of graphNodes.filter(n => canPreviewNode(n.id))) {
    it(`fits the expanded ${item.label} card with its siblings at ${width}px`, () => {
      const visible = getVisibleNodes(true, expanded, item.parentId);
      const layout = createLayout(visible, sizes(visible, true), { width, height: 560 }, true, item.parentId);
      const card = layout.byId.get(item.id)!;
      card.width = 208; card.height = 146; card.fx = card.x; card.fy = card.y;
      layout.simulation.alpha(1); layout.tick(300);
      expectReadable(layout.nodes, width, 560);
      layout.simulation.alphaTarget(0.16);
      for (let frame = 0; frame < 120; frame++) { layout.setMotion(frame / 60); layout.tick(); }
      expectReadable(layout.nodes, width, 560);
      layout.simulation.stop();
    });
  }
  it('keeps desktop labels apart, fixes the center and leaves source data unchanged', () => {
    const source = graphNodes.map(n => Object.freeze({ ...n }));
    const before = JSON.stringify(source);
    const layout = createLayout(source, sizes(source, false), { width: 1120, height: 620 }, false, null);
    layout.tick(200);
    expectReadable(layout.nodes, 1120, 620);
    expect(layout.byId.get('atomsh')).toMatchObject({ x: 560, y: 310, fx: 560, fy: 310 });
    expect(JSON.stringify(source)).toBe(before);
    layout.simulation.stop();
  });
  for (const width of [280, 350]) for (const focus of [null, ...branches.map(b => b.id)]) {
    it(`keeps ${width}px mobile labels within bounds for ${focus ?? 'overview'}`, () => {
      const visible = getVisibleNodes(true, expanded, focus);
      const layout = createLayout(visible, sizes(visible, true), { width, height: 500 }, true, focus);
      layout.tick(200);
      expectReadable(layout.nodes, width, 500);
      expect(layout.byId.get('atomsh')?.x).toBe(width / 2);
      layout.simulation.stop();
    });
  }
  it('releases a dragged leaf back into a readable layout without moving the center', () => {
    const layout = createLayout(graphNodes, sizes(graphNodes, false), { width: 1120, height: 620 }, false, null);
    const leaf = layout.byId.get('music-rnb')!;
    leaf.fx = 560; leaf.fy = 540; leaf.dragging = true;
    layout.simulation.alpha(1); layout.tick(20);
    expect(leaf).toMatchObject({ x: 560, y: 540 });
    leaf.fx = null; leaf.fy = null; leaf.dragging = false;
    layout.simulation.alpha(1); layout.tick(300);
    expectReadable(layout.nodes, 1120, 620);
    expect(layout.byId.get('atomsh')).toMatchObject({ x: 560, y: 310 });
    layout.simulation.stop();
  });
});
