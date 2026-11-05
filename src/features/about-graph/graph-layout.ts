import {
  forceLink, forceManyBody, forceSimulation,
  type SimulationNodeDatum,
} from 'd3-force';
import { type GraphNode } from './graph-data';
import { getConstellationTarget } from './graph-constellation';
import { nodePhase, separateNodes } from './graph-motion';

export type NodeSize = { width: number; height: number };
export type LayoutNode = GraphNode & SimulationNodeDatum & NodeSize & { x: number; y: number; tx: number; ty: number; scale: number; dragging?: boolean };
export type LayoutLink = { source: LayoutNode; target: LayoutNode };
export type StageSize = { width: number; height: number };
export type LayoutBounds = StageSize & { left: number; top: number };

export function createLayout(data: readonly GraphNode[], sizes: ReadonlyMap<string, NodeSize>, size: StageSize, compact: boolean, focusedId: string | null,
  options: { overflow?: number; bounds?: LayoutBounds; positions?: ReadonlyMap<string, { x: number; y: number }> } = {}) {
  const { width, height } = size;
  const paddingX = width * (options.overflow ?? 0), paddingY = height * (options.overflow ?? 0);
  const bounds = options.bounds ?? { width: width + paddingX * 2, height: height + paddingY * 2, left: -paddingX, top: -paddingY };
  const nodes: LayoutNode[] = data.map(n => {
    const dimensions = sizes.get(n.id) ?? { width: n.id === 'atomsh' ? 100 : 100, height: n.id === 'atomsh' ? 100 : 48 };
    const target = getConstellationTarget(n, data, size, compact, focusedId);
    const previous = options.positions?.get(n.id);
    return { ...n, ...dimensions, x: previous?.x ?? target.x, y: previous?.y ?? target.y, tx: target.x, ty: target.y,
      scale: 1, ...(n.id === 'atomsh' ? { fx: target.x, fy: target.y } : {}) };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links: LayoutLink[] = nodes.filter(n => n.parentId && byId.has(n.parentId)).map(n => ({ source: byId.get(n.parentId!)!, target: n }));
  let motionTime: number | null = null;
  const simulation = forceSimulation(nodes).stop().alphaDecay(0.035).velocityDecay(0.48)
    .force('link', forceLink<LayoutNode, LayoutLink>(links).id(n => n.id).strength(0.12)
      .distance(l => Math.hypot(l.source.tx - l.target.tx, l.source.ty - l.target.ty)))
    .force('charge', forceManyBody<LayoutNode>().strength(-38))
    .force('anchor', alpha => {
      for (const n of nodes) {
        const phase = nodePhase(n.id);
        const groupPhase = nodePhase(n.branch ?? n.id);
        const amplitude = motionTime == null || !n.parentId ? 0 : compact ? 8 : 19;
        const dx = motionTime == null ? 0 : (Math.sin(motionTime * 0.27 + groupPhase) * 0.75 + Math.sin(motionTime * 0.38 + phase) * 0.25) * amplitude;
        const dy = motionTime == null ? 0 : (Math.cos(motionTime * 0.23 + groupPhase) * 0.75 + Math.cos(motionTime * 0.31 + phase) * 0.25) * amplitude * 0.8;
        n.vx = (n.vx ?? 0) + (n.tx + dx - n.x) * 0.22 * alpha;
        n.vy = (n.vy ?? 0) + (n.ty + dy - n.y) * 0.22 * alpha;
      }
    });
  const constrain = () => {
    for (const n of nodes) {
      const halfW = n.width * n.scale / 2 + 9, halfH = n.height * n.scale / 2 + 9;
      n.x = Math.max(bounds.left + halfW, Math.min(bounds.left + bounds.width - halfW, n.x));
      n.y = Math.max(bounds.top + halfH, Math.min(bounds.top + bounds.height - halfH, n.y));
      if (n.fx != null) { n.fx = n.x; n.fy = n.y; }
    }
  };
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      simulation.tick(); constrain();
      for (let pass = 0; pass < 5; pass++) { separateNodes(nodes, compact ? 12 : 20, bounds); constrain(); }
    }
  };
  tick(options.positions ? 1 : 160);
  return { nodes, links, byId, simulation, tick, constrain, bounds, setMotion(time: number | null) { motionTime = time; } };
}

export const getCurve = (link: LayoutLink) => {
  const { source: a, target: b } = link;
  const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (a.x + b.x) / 2 - (b.y - a.y) / distance * 10, y: (a.y + b.y) / 2 + (b.x - a.x) / distance * 10 };
};
