import { createLayout, getCurve, type StageSize } from './graph-layout';
import { graphRelations, type BranchId, type GraphNode } from './graph-data';
import { getLensScale } from './graph-motion';
import { GraphCamera, type Point } from './graph-camera';

const colors = {
  light: { music: '#7062d9', coding: '#387ea3', anime: '#b76290', games: '#a57b3e', ambient: '#736d9f' },
  dark: { music: '#b9adff', coding: '#8bd4eb', anime: '#efa6cb', games: '#e6be7d', ambient: '#b8b0d7' },
};

export type GraphSnapshot = { view: { x: number; y: number; zoom: number }; positions: ReadonlyMap<string, Point> };
type RuntimeOptions = {
  stage: HTMLDivElement;
  canvas: HTMLCanvasElement;
  nodeElements: ReadonlyMap<string, HTMLButtonElement>;
  actionElements?: ReadonlyMap<string, HTMLElement>;
  linkElements: ReadonlyMap<string, SVGPathElement>;
  relationElements?: ReadonlyMap<string, SVGGElement>;
  snapshot?: GraphSnapshot;
  nodes: readonly GraphNode[];
  size: StageSize;
  compact: boolean;
  focusedId: string | null;
};

export class GraphRuntime {
  readonly layout;
  readonly camera;
  private ctx: CanvasRenderingContext2D | null = null;
  private frameId = 0;
  private disposed = false;
  private inView = true;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private dark = window.matchMedia('(prefers-color-scheme: dark)');
  private observer: IntersectionObserver;
  private highlight: BranchId | null = null;
  private pointer = { x: 0, y: 0, active: false };
  private heldId: string | null = null;
  private expandedId: string | null = null;
  private draggedId: string | null = null;
  private revealId: string | null = null;
  private pinnedRevealId: string | null = null;
  private time = 0;
  private previousTime = 0;
  private frameCount = 0;
  private sample = { start: 0, frames: 0, work: 0 };
  private particles: { x: number; y: number; phase: number; depth: number; branch: BranchId }[];

  constructor(private options: RuntimeOptions) {
    const { stage, canvas, nodeElements, nodes, size, compact, focusedId } = options;
    stage.dataset.frameCount = '0';
    stage.dataset.fps = '0';
    stage.dataset.frameMs = '0';
    const sizes = new Map([...nodeElements].map(([id, el]) => [id, { width: el.offsetWidth, height: el.offsetHeight }]));
    this.camera = new GraphCamera(size, compact, !!focusedId);
    if (options.snapshot) {
      Object.assign(this.camera.view, options.snapshot.view);
      Object.assign(this.camera.target, options.snapshot.view);
    }
    const topLeft = this.camera.unproject({ x: 20, y: 20 });
    const bottomRight = this.camera.unproject({ x: size.width - 20, y: size.height - 20 });
    this.layout = createLayout(nodes, sizes, size, compact, focusedId, {
      overflow: 0.3, positions: options.snapshot?.positions,
      bounds: compact ? { left: topLeft.x, top: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y } : undefined,
    });
    let seed = 42;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const branchIds: BranchId[] = ['music', 'coding', 'anime', 'games'];
    this.particles = Array.from({ length: compact ? 180 : 680 }, (_, index) => {
      const angle = -3 * Math.PI / 4 + (index % 4) * Math.PI / 2;
      const cloud = index % 5 !== 0;
      return { x: cloud ? 0.5 + Math.cos(angle) * 0.23 + (random() + random() + random() - 1.5) * 0.28 : random(),
        y: cloud ? 0.5 + Math.sin(angle) * 0.22 + (random() + random() + random() - 1.5) * 0.28 : random(),
        phase: random() * Math.PI * 2, depth: random(), branch: branchIds[index % 4] };
    });
    try { this.ctx = canvas.getContext('2d'); } catch { /* HTML/SVG remains interactive. */ }
    if (this.ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2);
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const rect = stage.getBoundingClientRect();
    this.inView = rect.bottom > 0 && rect.top < window.innerHeight;
    this.observer = new IntersectionObserver(([entry]) => { this.inView = entry.isIntersecting; this.updateActivity(); });
    this.observer.observe(stage);
    this.reduced.addEventListener('change', this.onMotion);
    this.dark.addEventListener('change', this.onTheme);
    document.addEventListener('visibilitychange', this.updateActivity);
    stage.addEventListener('wheel', this.onWheel, { passive: false });
    this.paintPositions();
    this.drawParticles();
    this.updateActivity();
  }

  setHighlight(branch: BranchId | null) { this.highlight = branch; this.wake(); }
  snapshot(): GraphSnapshot {
    return { view: { ...this.camera.view }, positions: new Map(this.layout.nodes.map(n => [n.id, { x: n.x, y: n.y }])) };
  }
  setPointer(x: number, y: number, active = true) { this.pointer = { x, y, active }; this.wake(); }
  setHeldNode(id: string | null) {
    if (this.heldId === id) return;
    const old = this.heldId && this.layout.byId.get(this.heldId);
    if (old && old.parentId && old.id !== this.draggedId) { old.fx = null; old.fy = null; }
    this.heldId = id;
    const node = id && this.layout.byId.get(id);
    if (node && node.parentId) { node.fx = node.x; node.fy = node.y; }
    this.wake();
  }
  setExpanded(id: string | null, reveal = false) {
    const newlyPinned = reveal && this.pinnedRevealId !== id;
    this.pinnedRevealId = reveal ? id : null;
    if (this.revealId !== id) this.revealId = null;
    this.expandedId = id;
    this.layout.simulation.alpha(0.6);
    this.measureNodes();
    // Resolve the new card size before revealing it. Otherwise a compact card
    // still at its old small-node position can pan every sibling offscreen.
    this.layout.constrain();
    if (this.reduced.matches) this.layout.tick(180);
    if (id && newlyPinned) this.revealNode(id);
    this.wake();
  }

  toWorld(point: Point) { return this.camera.unproject(point); }
  panBy(x: number, y: number) { this.revealId = null; this.camera.panBy(x, y); this.paintPositions(); this.wake(); }
  zoomBy(factor: number, point?: Point) { this.revealId = null; this.camera.zoomAt(factor, point); this.wake(); }
  revealNode(id: string) {
    this.revealId = id;
    const node = this.layout.byId.get(id);
    if (node) { this.camera.reveal(node, node.width, node.height); this.wake(); }
  }
  private followReveal() {
    if (!this.revealId) return;
    const node = this.layout.byId.get(this.revealId);
    if (node) this.camera.reveal(node, node.width, node.height);
  }
  private onWheel = (event: WheelEvent) => {
    if (!this.inView || document.hidden) return;
    event.preventDefault();
    const rect = this.options.stage.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.options.size.height : 1);
    this.zoomBy(Math.exp(-Math.max(-180, Math.min(180, delta)) * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  private measureNodes() {
    for (const node of this.layout.nodes) {
      const element = this.options.nodeElements.get(node.id);
      if (element) { node.width = element.offsetWidth; node.height = element.offsetHeight; }
      const screen = this.camera.project(node);
      const distance = Math.hypot(screen.x - (this.pointer.x + 0.5) * this.options.size.width, screen.y - (this.pointer.y + 0.5) * this.options.size.height);
      const target = this.reduced.matches || !this.pointer.active || this.options.compact || node.id === this.expandedId ? 1 : getLensScale(distance, !node.parentId);
      node.scale += (target - node.scale) * 0.16;
      if (Math.abs(node.scale - target) < 0.001) node.scale = target;
    }
    if (this.options.compact) this.layout.constrain();
  }

  startDrag(id: string) {
    const node = this.layout.byId.get(id);
    if (!node || !node.parentId) return;
    this.revealId = null;
    this.draggedId = id;
    node.dragging = true;
    node.fx = node.x;
    node.fy = node.y;
    this.layout.simulation.alphaTarget(0.15).alpha(0.5);
    this.wake();
  }

  moveDrag(id: string, x: number, y: number) {
    const node = this.layout.byId.get(id);
    if (!node || !node.parentId) return;
    const bounds = this.layout.bounds;
    node.fx = Math.max(bounds.left + node.width / 2 + 8, Math.min(bounds.left + bounds.width - node.width / 2 - 8, x));
    node.fy = Math.max(bounds.top + node.height / 2 + 8, Math.min(bounds.top + bounds.height - node.height / 2 - 8, y));
    node.x = node.fx;
    node.y = node.fy;
    this.paintPositions();
    this.wake();
  }

  endDrag(id: string) {
    const node = this.layout.byId.get(id);
    if (!node || !node.parentId) return;
    this.draggedId = null;
    node.dragging = false;
    node.fx = this.heldId === id ? node.x : null;
    node.fy = this.heldId === id ? node.y : null;
    this.layout.simulation.alphaTarget(0).alpha(0.7);
    if (this.reduced.matches) { this.layout.tick(180); this.paintPositions(); }
    this.wake();
  }

  private onMotion = () => {
    if (this.reduced.matches) { this.layout.setMotion(null); this.layout.simulation.alphaTarget(0); this.layout.nodes.forEach(n => n.scale = 1); this.layout.tick(180); this.paintPositions(); }
    this.updateActivity();
  };
  private onTheme = () => { this.drawParticles(); this.wake(); };

  private updateActivity = () => {
    if (this.disposed) return;
    const active = this.inView && !document.hidden;
    this.options.stage.dataset.animationState = !active ? 'paused' : this.reduced.matches ? 'reduced' : this.ctx ? 'running' : 'fallback';
    if (!active || this.reduced.matches) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.previousTime = 0;
      this.sample = { start: 0, frames: 0, work: 0 };
      this.options.stage.dataset.fps = '0';
      if (active) this.drawParticles();
    } else this.wake();
  };

  private wake() {
    if (this.disposed || this.frameId || !this.inView || document.hidden) return;
    if (this.reduced.matches) { this.followReveal(); this.camera.advance(true); this.paintPositions(); this.drawParticles(); return; }
    this.frameId = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.frameId = 0;
    if (this.disposed || !this.inView || document.hidden || this.reduced.matches) return;
    const started = performance.now();
    this.time += this.previousTime ? Math.min(now - this.previousTime, 50) / 1000 : 0;
    this.previousTime = now;
    this.measureNodes();
    if (this.ctx) { this.layout.setMotion(this.time); this.layout.simulation.alphaTarget(0.16); }
    if (this.layout.simulation.alpha() > this.layout.simulation.alphaMin()) {
      this.layout.tick();
    }
    this.followReveal();
    this.camera.advance();
    this.paintPositions();
    this.drawParticles();
    this.options.stage.dataset.frameCount = String(++this.frameCount);
    if (!this.sample.start) this.sample.start = now;
    this.sample.frames++;
    this.sample.work += performance.now() - started;
    const elapsed = now - this.sample.start;
    if (elapsed >= 1000) {
      this.options.stage.dataset.fps = (this.sample.frames * 1000 / elapsed).toFixed(1);
      this.options.stage.dataset.frameMs = (this.sample.work / this.sample.frames).toFixed(2);
      this.sample = { start: now, frames: 0, work: 0 };
    }
    if (this.ctx || this.camera.moving || this.layout.simulation.alpha() > this.layout.simulation.alphaMin()) this.wake();
    else this.previousTime = 0;
  };

  private paintPositions() {
    this.options.stage.dataset.zoom = this.camera.view.zoom.toFixed(3);
    this.options.stage.dataset.panX = this.camera.view.x.toFixed(1);
    this.options.stage.dataset.panY = this.camera.view.y.toFixed(1);
    for (const n of this.layout.nodes) {
      const element = this.options.nodeElements.get(n.id);
      const screen = this.camera.project(n);
      const transform = `translate3d(${screen.x.toFixed(2)}px,${screen.y.toFixed(2)}px,0) translate(-50%,-50%) scale(${(n.scale * this.camera.view.zoom).toFixed(3)})`;
      if (element) element.style.transform = transform;
      const actions = this.options.actionElements?.get(n.id);
      if (actions) {
        actions.style.transform = transform;
        actions.style.width = `${n.width}px`;
        actions.style.height = `${n.height}px`;
      }
    }
    for (const link of this.layout.links) {
      const control = getCurve(link);
      const element = this.options.linkElements.get(link.target.id);
      element?.setAttribute('d', `M${link.source.x},${link.source.y} Q${control.x},${control.y} ${link.target.x},${link.target.y}`);
      element?.setAttribute('transform', this.camera.matrix);
    }
    for (const relation of graphRelations) {
      const element = this.options.relationElements?.get(relation.id);
      const a = this.layout.byId.get(relation.sourceId), b = this.layout.byId.get(relation.targetId);
      if (!element || !a || !b) continue;
      const cx = (a.x + b.x) / 2 - (b.y - a.y) * 0.14;
      const cy = (a.y + b.y) / 2 + (b.x - a.x) * 0.14;
      element.setAttribute('transform', this.camera.matrix);
      element.querySelector('path')?.setAttribute('d', `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`);
    }
  }

  private drawParticles() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width, height } = this.options.size;
    const palette = colors.dark;
    const time = this.reduced.matches ? 0 : this.time;
    ctx.clearRect(0, 0, width, height);
    for (const p of this.particles) {
      let x = ((p.x * width + Math.sin(time * 0.13 + p.phase) * 15 + (this.pointer.x * 15 + this.camera.view.x * 0.12) * p.depth) % width + width) % width;
      let y = ((p.y * height + Math.cos(time * 0.09 + p.phase) * 12 + (this.pointer.y * 15 + this.camera.view.y * 0.12) * p.depth) % height + height) % height;
      const dx = x - (this.pointer.x + 0.5) * width, dy = y - (this.pointer.y + 0.5) * height;
      const lens = this.pointer.active && !this.reduced.matches ? (getLensScale(Math.hypot(dx, dy)) - 1) * 0.65 : 0;
      x += dx * lens; y += dy * lens;
      ctx.fillStyle = palette[p.branch];
      ctx.globalAlpha = 0.1 + p.depth * 0.48;
      ctx.beginPath(); ctx.arc(x, y, (0.25 + p.depth * 0.95) * (1 + lens * 2), 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    const translation = this.camera.translation;
    ctx.translate(translation.x, translation.y);
    ctx.scale(this.camera.view.zoom, this.camera.view.zoom);
    this.layout.links.forEach((link, index) => {
      ctx.fillStyle = palette[link.target.branch ?? 'music'];
      ctx.globalAlpha = this.highlight && link.target.branch !== this.highlight ? 0.12 : 0.75;
      const control = getCurve(link);
      for (let i = 0; i < 2; i++) {
        const t = (time * 0.12 + index * 0.137 + i / 2) % 1;
        const x = (1 - t) ** 2 * link.source.x + 2 * (1 - t) * t * control.x + t ** 2 * link.target.x;
        const y = (1 - t) ** 2 * link.source.y + 2 * (1 - t) * t * control.y + t ** 2 * link.target.y;
        ctx.beginPath(); ctx.arc(x, y, i ? 1.1 : 1.8, 0, Math.PI * 2); ctx.fill();
      }
    });
    const core = this.layout.byId.get('atomsh');
    if (core) {
      const halo = ctx.createRadialGradient(core.x, core.y, 20, core.x, core.y, 110);
      halo.addColorStop(0, this.dark.matches ? '#9c85ff28' : '#8b7be924');
      halo.addColorStop(1, '#8b7be900');
      ctx.globalAlpha = 1; ctx.fillStyle = halo; ctx.fillRect(core.x - 110, core.y - 110, 220, 220);
      ctx.fillStyle = palette.music;
      for (let i = 0; i < 46; i++) {
        const phase = i * 2.39996 + time * (i % 2 ? 0.07 : -0.09);
        const r = core.width / 2 + 7 + (i % 6) * 7;
        ctx.globalAlpha = 0.14 + (i % 4) * 0.11;
        ctx.beginPath(); ctx.arc(core.x + Math.cos(phase) * r, core.y + Math.sin(phase) * r * 0.74, i % 5 ? 0.9 : 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.layout.simulation.stop();
    this.observer.disconnect();
    this.reduced.removeEventListener('change', this.onMotion);
    this.dark.removeEventListener('change', this.onTheme);
    document.removeEventListener('visibilitychange', this.updateActivity);
    this.options.stage.removeEventListener('wheel', this.onWheel);
  }
}
