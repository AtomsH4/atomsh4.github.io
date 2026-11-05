import { describe, expect, it } from 'vitest';
import { GraphCamera } from './graph-camera';
import { createLayout } from './graph-layout';
import { graphNodes } from './graph-data';

describe('oversized graph camera', () => {
  it('enlarges the scene around its root and reverses coordinates for node dragging', () => {
    const camera = new GraphCamera({ width: 1280, height: 440 }, false, false);
    expect(camera.view.zoom).toBe(1.2);
    expect(camera.project({ x: 640, y: 220 })).toEqual({ x: 640, y: 220 });
    const point = { x: 100, y: 30 };
    expect(camera.project(point).x).toBeLessThan(0);
    camera.panBy(220, -60);
    expect(camera.unproject(camera.project(point))).toEqual(point);
  });
  it('uses a gentler mobile scale and keeps the focused root visible', () => {
    const camera = new GraphCamera({ width: 320, height: 560 }, true, true);
    expect(camera.view.zoom).toBe(1.12);
    expect(camera.project({ x: 160, y: 70 })).toEqual({ x: 160, y: 70 });
  });
  it('keeps the same world point under the cursor when zooming', () => {
    const camera = new GraphCamera({ width: 1200, height: 600 }, false, false);
    camera.panBy(-200, 80);
    const cursor = { x: 240, y: 450 }, anchor = camera.unproject(cursor);
    camera.zoomAt(1.3, cursor);
    camera.advance(true);
    const projected = camera.project(anchor);
    expect(projected.x).toBeCloseTo(cursor.x);
    expect(projected.y).toBeCloseTo(cursor.y);
    camera.zoomAt(100); camera.advance(true);
    expect(camera.view.zoom).toBe(2.4);
    camera.zoomAt(0.001); camera.advance(true);
    expect(camera.view.zoom).toBe(0.65);
  });
  it('eases into an edge card, bringing the full image and text into view', () => {
    const camera = new GraphCamera({ width: 320, height: 560 }, true, false);
    const point = { x: -40, y: 600 };
    camera.reveal(point);
    expect(camera.moving).toBe(true);
    const oldX = camera.view.x;
    camera.advance();
    expect(camera.view.x).toBeGreaterThan(oldX);
    for (let i = 0; i < 100; i++) camera.advance();
    const screen = camera.project(point);
    expect(screen.x - 104 * camera.view.zoom).toBeGreaterThanOrEqual(19.9);
    expect(screen.y + 89 * camera.view.zoom).toBeLessThanOrEqual(540.1);
    expect(camera.moving).toBe(false);
  });
  it('allows physical nodes beyond the viewport while preserving world collision bounds', () => {
    const size = { width: 900, height: 420 };
    const sizes = new Map(graphNodes.map(n => [n.id, { width: 100, height: 48 }]));
    const layout = createLayout(graphNodes, sizes, size, false, null, { overflow: 0.3 });
    const node = layout.byId.get('music-rnb')!;
    node.fx = -80; node.fy = -40;
    layout.simulation.alpha(1); layout.tick(80);
    expect(node.x).toBeLessThan(0);
    expect(node.y).toBeLessThan(0);
    expect(node.x - node.width / 2).toBeGreaterThan(layout.bounds.left);
    expect(layout.byId.get('atomsh')).toMatchObject({ x: 450, y: 210 });
    layout.simulation.stop();
  });
});
