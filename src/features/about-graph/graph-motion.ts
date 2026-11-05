import type { LayoutNode } from './graph-layout';

export function nodePhase(id: string) {
  let hash = 0;
  for (const letter of id) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
  return hash % 6283 / 1000;
}

export function getLensScale(distance: number, root = false) {
  const t = Math.max(0, 1 - distance / 145);
  return 1 + t * t * (3 - 2 * t) * (root ? 0.12 : 0.25);
}

// Rounded cards use their actual rectangular bounds, including pointer magnification.
export function separateNodes(nodes: LayoutNode[], gap = 8, bounds?: { width: number; height: number; left?: number; top?: number }) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const dx = b.x - a.x, dy = b.y - a.y;
    const overlapX = (a.width * a.scale + b.width * b.scale) / 2 + gap - Math.abs(dx);
    const overlapY = (a.height * a.scale + b.height * b.scale) / 2 + gap - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) continue;
    const weightA = a.id === 'atomsh' || a.dragging ? 0 : a.fx != null ? 0.12 : 1;
    const weightB = b.id === 'atomsh' || b.dragging ? 0 : b.fx != null ? 0.12 : 1;
    const total = weightA + weightB;
    if (!total) continue;
    const room = (node: LayoutNode, horizontal: boolean, direction: number) => {
      if (node.id === 'atomsh' || node.dragging) return 0;
      if (!bounds) return Infinity;
      const half = (horizontal ? node.width : node.height) * node.scale / 2 + 9;
      const position = horizontal ? node.x : node.y;
      const length = horizontal ? bounds.width : bounds.height;
      const minimum = (horizontal ? bounds.left : bounds.top) ?? 0;
      return Math.max(0, direction < 0 ? position - minimum - half : minimum + length - half - position);
    };
    const signX = dx < 0 ? -1 : 1, signY = dy < 0 ? -1 : 1;
    const horizontalRoom = room(a, true, -signX) + room(b, true, signX);
    const verticalRoom = room(a, false, -signY) + room(b, false, signY);
    const horizontal = horizontalRoom + 0.01 < overlapX ? false : verticalRoom + 0.01 < overlapY ? true : overlapX < overlapY;
    const sign = (horizontal ? dx : dy) < 0 ? -1 : 1;
    const overlap = horizontal ? overlapX : overlapY;
    const roomA = room(a, horizontal, -sign), roomB = room(b, horizontal, sign);
    let moveA = Math.min(roomA, overlap * weightA / total);
    const moveB = Math.min(roomB, overlap - moveA);
    moveA = Math.min(roomA, overlap - moveB);
    const axis = horizontal ? 'x' : 'y';
    const velocity = horizontal ? 'vx' : 'vy';
    a[axis] -= sign * moveA;
    b[axis] += sign * moveB;
    if (weightA) a[velocity] = (a[velocity] ?? 0) - sign * moveA * 0.025;
    if (weightB) b[velocity] = (b[velocity] ?? 0) + sign * moveB * 0.025;
    if (a.id !== 'atomsh' && a.fx != null) { a.fx = a.x; a.fy = a.y; }
    if (b.id !== 'atomsh' && b.fx != null) { b.fx = b.x; b.fy = b.y; }
  }
}
