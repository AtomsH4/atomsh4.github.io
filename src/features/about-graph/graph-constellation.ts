import { branches, coreNodes, getNodePath, type GraphNode } from './graph-data';
import type { StageSize } from './graph-layout';
import { COMPACT_ZOOM } from './graph-camera';

// Coordinates describe four different silhouettes, relative to the center.
// Deeper works sit beside their own parent instead of sharing one outer ring.
const anchors: Record<string, readonly [number, number]> = {
  music: [-0.24, -0.18], 'music-rnb': [-0.42, -0.08], 'music-rock': [-0.36, -0.30], 'music-pop': [-0.15, -0.37],
  coding: [0.22, -0.14], 'coding-stack': [0.06, -0.25], 'coding-projects': [0.36, -0.26], 'coding-acm': [0.30, 0.10],
  'coding-algorithms': [0.43, 0.03], 'coding-deep-learning': [0.28, -0.36],
  'project-cherry': [0.42, -0.37],
  'stack-react': [0.00, -0.32], 'stack-python': [0.09, -0.36], 'stack-electron': [0.19, -0.32],
  'stack-nodejs': [-0.03, -0.14], 'stack-mysql': [0.06, -0.06], 'stack-cpp': [0.16, -0.06],
  'acm-graph': [0.42, 0.12], 'acm-number-theory': [0.42, 0.22],
  'acm-data-structures': [0.22, 0.05], 'acm-dp': [0.36, 0.20],
  anime: [-0.25, 0.22], 'anime-k-on': [-0.39, 0.40], 'anime-eva': [-0.40, 0.08], 'anime-deep-sea': [-0.14, 0.42],
  games: [0.24, 0.23], 'games-red-dead': [0.40, 0.29], 'games-disco-elysium': [0.12, 0.40],
};
const coreAnchors: Record<string, readonly [number, number]> = {
  'concept-existentialism': [-116, 58], 'concept-philosophy': [4, 148],
};

export function getConstellationTarget(node: GraphNode, data: readonly GraphNode[], size: StageSize, compact: boolean, focusedId: string | null): { x: number; y: number } {
  const { width, height } = size;
  if (compact && focusedId) {
    const path = getNodePath(focusedId, data);
    const ancestorIndex = path.findIndex(n => n.id === node.id);
    if (ancestorIndex !== -1) return { x: width / 2, y: 70 + ancestorIndex * 80 };
    const children = data.filter(n => n.parentId === focusedId);
    const index = children.findIndex(n => n.id === node.id);
    const firstY = 70 + (path.length - 1) * 80 + 112;
    const rows = Math.ceil(children.length / 2);
    const lastY = 70 + (height - 90) / COMPACT_ZOOM - 34;
    const rowGap = rows > 1 ? Math.min(112, Math.max(56, (lastY - firstY) / (rows - 1))) : 112;
    return { x: width * (index % 2 ? 0.735 : 0.265), y: firstY + Math.floor(index / 2) * rowGap };
  }
  const center = { x: width / 2, y: height / 2 };
  if (!node.parentId) return compact ? { x: width / 2, y: 104 } : center;
  const branch = branches.find(b => b.id === node.branch);
  if (compact) {
    if (node.appearance === 'concept') {
      const index = coreNodes.findIndex(n => n.id === node.id);
      return { x: coreNodes.length % 2 && index === coreNodes.length - 1 ? width / 2 : width * (index % 2 ? 0.735 : 0.265), y: 220 + Math.floor(index / 2) * 76 };
    }
    const index = branches.findIndex(b => b.id === node.id);
    return { x: width * (index % 2 ? 0.735 : 0.265), y: 350 + Math.floor(index / 2) * 100 };
  }
  const coreAnchor = coreAnchors[node.id];
  if (coreAnchor) return { x: center.x + coreAnchor[0], y: center.y + coreAnchor[1] };
  const anchor = anchors[node.id];
  if (anchor) return { x: center.x + anchor[0] * Math.min(width, 1760) * 0.83, y: center.y + anchor[1] * Math.min(height, 920) * 0.81 };
  // Additional content inherits its parent's neighborhood without a new layout rule.
  const parent = data.find(n => n.id === node.parentId);
  const origin = parent ? getConstellationTarget(parent, data, size, false, null) : center;
  const siblings = data.filter(n => n.parentId === node.parentId);
  const angle = (branch?.angle ?? 0) + (siblings.indexOf(node) - (siblings.length - 1) / 2) * 0.8;
  return { x: origin.x + Math.cos(angle) * 128, y: origin.y + Math.sin(angle) * 96 };
}
