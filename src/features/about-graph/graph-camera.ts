import type { StageSize } from './graph-layout';

export type Point = { x: number; y: number };
export const DESKTOP_ZOOM = 1.2;
export const COMPACT_ZOOM = 1.12;
type View = Point & { zoom: number };

export class GraphCamera {
  readonly origin: Point;
  readonly initialZoom: number;
  readonly view: View;
  readonly target: View;

  constructor(readonly size: StageSize, compact: boolean, focused: boolean) {
    this.origin = { x: size.width / 2, y: compact && focused ? 70 : size.height / 2 };
    this.initialZoom = compact ? COMPACT_ZOOM : DESKTOP_ZOOM;
    this.view = { x: 0, y: 0, zoom: this.initialZoom };
    this.target = { ...this.view };
  }

  project(point: Point, view = this.view): Point {
    return { x: this.origin.x + view.x + (point.x - this.origin.x) * view.zoom,
      y: this.origin.y + view.y + (point.y - this.origin.y) * view.zoom };
  }

  unproject(point: Point, view = this.view): Point {
    return { x: this.origin.x + (point.x - this.origin.x - view.x) / view.zoom,
      y: this.origin.y + (point.y - this.origin.y - view.y) / view.zoom };
  }

  panBy(x: number, y: number) {
    this.target.x += x; this.target.y += y;
    this.view.x += x; this.view.y += y;
  }

  zoomAt(factor: number, point = { x: this.size.width / 2, y: this.size.height / 2 }) {
    const anchor = this.unproject(point, this.target);
    this.target.zoom = Math.max(0.65, Math.min(2.4, this.target.zoom * factor));
    this.target.x = point.x - this.origin.x - (anchor.x - this.origin.x) * this.target.zoom;
    this.target.y = point.y - this.origin.y - (anchor.y - this.origin.y) * this.target.zoom;
  }

  reveal(point: Point, width = 208, height = 178) {
    const padding = 20;
    const fit = Math.min((this.size.width - padding * 2) / width, (this.size.height - padding * 2) / height);
    this.target.zoom = Math.min(this.target.zoom, Math.max(0.65, fit));
    const p = this.project(point, this.target);
    const halfW = width * this.target.zoom / 2, halfH = height * this.target.zoom / 2;
    this.target.x += Math.max(0, padding + halfW - p.x) - Math.max(0, p.x + halfW + padding - this.size.width);
    this.target.y += Math.max(0, padding + halfH - p.y) - Math.max(0, p.y + halfH + padding - this.size.height);
  }

  advance(immediate = false) {
    for (const key of ['x', 'y', 'zoom'] as const) {
      const delta = this.target[key] - this.view[key];
      this.view[key] = immediate || Math.abs(delta) < (key === 'zoom' ? 0.0005 : 0.05) ? this.target[key] : this.view[key] + delta * 0.18;
    }
  }

  get moving() { return this.view.x !== this.target.x || this.view.y !== this.target.y || this.view.zoom !== this.target.zoom; }
  get translation() { return { x: this.view.x + this.origin.x * (1 - this.view.zoom), y: this.view.y + this.origin.y * (1 - this.view.zoom) }; }
  get matrix() { const t = this.translation; return `matrix(${this.view.zoom} 0 0 ${this.view.zoom} ${t.x} ${t.y})`; }
}
