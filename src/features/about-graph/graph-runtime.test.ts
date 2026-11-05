import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultExpandedIds, getVisibleNodes, graphNodes, graphRelations } from './graph-data';
import { GraphRuntime, type GraphSnapshot } from './graph-runtime';

class MediaPreference {
  matches = false;
  listeners = new Set<() => void>();
  addEventListener = (_: string, callback: () => void) => this.listeners.add(callback);
  removeEventListener = (_: string, callback: () => void) => this.listeners.delete(callback);
  change(value: boolean) { this.matches = value; this.listeners.forEach(callback => callback()); }
}

let motion: MediaPreference, theme: MediaPreference;
let frames: Map<number, FrameRequestCallback>;
let observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[];
let renderer: GraphRuntime | undefined;
let frameId = 0;
const context = () => ({ setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
  fillRect: vi.fn(), createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })) });

function mount(nodes = graphNodes.slice(0, 2), snapshot?: GraphSnapshot,
  viewport = { size: { width: 1120, height: 620 }, compact: false, focusedId: null as string | null }) {
  const stage = document.createElement('div');
  const canvas = document.createElement('canvas');
  const nodeElements = new Map<string, HTMLButtonElement>();
  const actionElements = new Map<string, HTMLSpanElement>();
  for (const n of nodes) {
    const button = document.createElement('button');
    Object.defineProperties(button, { offsetWidth: { value: 104, configurable: true }, offsetHeight: { value: n.parentId ? 54 : 104, configurable: true } });
    nodeElements.set(n.id, button);
    stage.append(button);
    if (n.navigation) {
      const actions = document.createElement('span');
      actionElements.set(n.id, actions); stage.append(actions);
    }
  }
  const link = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const relationElements = new Map(graphRelations.map(relation => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    return [relation.id, group] as const;
  }));
  const { width, height } = viewport.size;
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: height, left: 0, right: width, width, height, x: 0, y: 0, toJSON() {} });
  renderer = new GraphRuntime({ stage, canvas, nodes, nodeElements, actionElements, relationElements, snapshot,
    linkElements: new Map([['music', link]]), ...viewport });
  return { stage, canvas, nodeElements, actionElements, link, relationElements, renderer };
}

function advanceFrame(now: number) {
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(callback => callback(now));
}

beforeEach(() => {
  motion = new MediaPreference(); theme = new MediaPreference(); frames = new Map(); observers = [];
  vi.stubGlobal('matchMedia', (query: string) => query.includes('reduced-motion') ? motion : theme);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn(); observe = vi.fn();
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context() as unknown as CanvasRenderingContext2D);
});
afterEach(() => { renderer?.dispose(); renderer = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('about graph rendering lifecycle', () => {
  it('keeps navigation targets aligned with their nodes through pan, zoom and drag', () => {
    const { renderer, nodeElements, actionElements } = mount([...graphNodes]);
    renderer.panBy(90, -30); renderer.zoomBy(1.1);
    for (let i = 1; i <= 30; i++) advanceFrame(i * 16.67);
    for (const id of ['coding-projects', 'coding-algorithms']) {
      const node = renderer.layout.byId.get(id)!;
      const action = actionElements.get(id)!;
      expect(action.style.transform).toBe(nodeElements.get(id)!.style.transform);
      expect(action.style.width).toBe(`${node.width}px`);
      renderer.startDrag(id); renderer.moveDrag(id, node.x - 50, node.y + 30);
      advanceFrame(600);
      expect(action.style.transform).toBe(nodeElements.get(id)!.style.transform);
      renderer.endDrag(id);
    }
  });
  it('settles a compact card before revealing it so the camera cannot clip its siblings', () => {
    motion.matches = true;
    const nodes = getVisibleNodes(true, new Set(defaultExpandedIds), 'coding-projects');
    const { renderer, nodeElements } = mount(nodes, undefined, { size: { width: 320, height: 700 }, compact: true, focusedId: 'coding-projects' });
    renderer.setHeldNode('project-cherry');
    Object.defineProperties(nodeElements.get('project-cherry')!, { offsetWidth: { value: 208 }, offsetHeight: { value: 178 } });
    renderer.setExpanded('project-cherry', true);
    expect(renderer.camera.view.x).toBe(0);
    expect(renderer.camera.view.y).toBe(0);
    for (const node of renderer.layout.nodes) {
      const point = renderer.camera.project(node);
      expect(point.x - node.width * renderer.camera.view.zoom / 2).toBeGreaterThanOrEqual(20);
      expect(point.x + node.width * renderer.camera.view.zoom / 2).toBeLessThanOrEqual(300);
      expect(point.y - node.height * renderer.camera.view.zoom / 2).toBeGreaterThanOrEqual(20);
      expect(point.y + node.height * renderer.camera.view.zoom / 2).toBeLessThanOrEqual(680);
    }
  });
  it('keeps unlabelled semantic curves aligned with live endpoints and camera controls', () => {
    const { renderer, relationElements } = mount([...graphNodes]);
    renderer.panBy(80, -20);
    const group = relationElements.get('after-school')!;
    expect(group.getAttribute('transform')).toBe(renderer.camera.matrix);
    expect(group.querySelector('path')?.getAttribute('d')).toMatch(/^M.+ Q/);
    expect(group.querySelector('text')).toBeNull();
    const path = group.querySelector('path')?.getAttribute('d');
    const endpoint = renderer.layout.byId.get('anime-k-on')!;
    renderer.startDrag(endpoint.id); renderer.moveDrag(endpoint.id, endpoint.x + 60, endpoint.y);
    advanceFrame(16.67);
    expect(group.querySelector('path')?.getAttribute('d')).not.toBe(path);
  });
  it('restores the camera and existing positions when a nested cluster is rebuilt', () => {
    motion.matches = true;
    const first = mount();
    first.renderer.panBy(130, -35); first.renderer.zoomBy(1.1);
    const snapshot = first.renderer.snapshot();
    first.renderer.dispose();
    const next = mount(graphNodes.slice(0, 6), snapshot);
    expect(next.renderer.camera.view).toEqual(snapshot.view);
    expect(next.stage.dataset.panX).toBe(snapshot.view.x.toFixed(1));
    const old = snapshot.positions.get('music')!, restored = next.renderer.layout.byId.get('music')!;
    expect(Math.hypot(old.x - restored.x, old.y - restored.y)).toBeLessThan(20);
  });
  it('eases pointer magnification, holds the reading target, and releases it to drift', () => {
    const { renderer } = mount();
    const node = renderer.layout.byId.get('music')!;
    const screen = renderer.camera.project(node);
    renderer.setPointer(screen.x / 1120 - 0.5, screen.y / 620 - 0.5);
    renderer.setHeldNode('music');
    const held = { x: node.x, y: node.y };
    for (let i = 1; i <= 30; i++) advanceFrame(i * 16.67);
    expect(node.scale).toBeGreaterThan(1.15);
    expect(node.x).toBeCloseTo(held.x);
    expect(node.y).toBeCloseTo(held.y);
    renderer.setPointer(0, 0, false);
    renderer.setHeldNode(null);
    for (let i = 31; i <= 200; i++) advanceFrame(i * 16.67);
    expect(node.scale).toBeCloseTo(1);
    expect(Math.hypot(node.x - held.x, node.y - held.y)).toBeGreaterThan(1);
  });
  it('pauses offscreen, resumes once, and releases frames and listeners on disposal', () => {
    const { stage, renderer } = mount();
    expect(stage.dataset.animationState).toBe('running');
    expect(frames.size).toBe(1);
    observers[0].callback([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(stage.dataset.animationState).toBe('paused');
    expect(frames.size).toBe(0);
    observers[0].callback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(frames.size).toBe(1);
    renderer.setHighlight('music');
    expect(frames.size).toBe(1);
    renderer.dispose();
    expect(frames.size).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(motion.listeners.size + theme.listeners.size).toBe(0);
  });
  it('pauses in a hidden document and resumes when visible', () => {
    const { stage } = mount();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stage.dataset.animationState).toBe('paused');
    expect(frames.size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stage.dataset.animationState).toBe('running');
    expect(frames.size).toBe(1);
  });
  it('renders reduced motion statically, including runtime preference changes', () => {
    motion.matches = true;
    const { stage, nodeElements } = mount();
    expect(stage.dataset.animationState).toBe('reduced');
    expect(frames.size).toBe(0);
    expect(nodeElements.get('atomsh')!.style.transform).toContain('560.00px');
    theme.change(true);
    expect(frames.size).toBe(0);
    motion.change(false);
    expect(stage.dataset.animationState).toBe('running');
    expect(frames.size).toBe(1);
    advanceFrame(1000);
    motion.change(true);
    expect(frames.size).toBe(0);
  });
  it('keeps HTML/SVG positions usable when Canvas fails and stops idle physics', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('unavailable'); });
    const { stage, link, nodeElements } = mount();
    expect(stage.dataset.animationState).toBe('fallback');
    expect(nodeElements.get('music')!.style.transform).toContain('translate3d');
    expect(link.getAttribute('d')).toMatch(/^M.+ Q/);
    for (let i = 0; i < 200; i++) advanceFrame(i * 16.67);
    expect(frames.size).toBe(0);
  });
  it('keeps nodes and links aligned while panning and zooming, and removes the wheel listener', () => {
    const { stage, renderer, nodeElements, link } = mount();
    renderer.panBy(160, -40);
    expect(stage.dataset.panX).toBe('160.0');
    expect(nodeElements.get('atomsh')!.style.transform).toContain('720.00px,270.00px');
    expect(link.getAttribute('transform')).toBe(renderer.camera.matrix);
    const wheel = new WheelEvent('wheel', { deltaY: -90, clientX: 400, clientY: 200, cancelable: true });
    stage.dispatchEvent(wheel);
    for (let i = 1; i <= 80; i++) advanceFrame(i * 16.67);
    expect(wheel.defaultPrevented).toBe(true);
    expect(Number(stage.dataset.zoom)).toBeGreaterThan(1.2);
    expect(link.getAttribute('transform')).toBe(renderer.camera.matrix);
    renderer.dispose();
    const nextWheel = new WheelEvent('wheel', { deltaY: 90, cancelable: true });
    stage.dispatchEvent(nextWheel);
    expect(nextWheel.defaultPrevented).toBe(false);
  });
  it('lets camera controls work immediately with reduced motion', () => {
    motion.matches = true;
    const { renderer, stage } = mount();
    renderer.zoomBy(1.2);
    expect(stage.dataset.zoom).toBe('1.440');
    renderer.panBy(80, 20);
    expect(stage.dataset.panX).toBe('80.0');
    expect(frames.size).toBe(0);
  });
  it('keeps a pinned edge card readable after collisions move it, until the user pans', () => {
    const { renderer, nodeElements } = mount();
    Object.defineProperties(nodeElements.get('music')!, { offsetWidth: { value: 208 }, offsetHeight: { value: 178 } });
    const node = renderer.layout.byId.get('music')!;
    renderer.setExpanded('music', true);
    // Simulate a later collision displacement while the card is opening.
    node.fx = node.x = 1100; node.fy = node.y = 670;
    for (let i = 1; i <= 120; i++) advanceFrame(i * 16.67);
    const screen = renderer.camera.project(node);
    expect(screen.x + 104 * renderer.camera.view.zoom).toBeLessThanOrEqual(1100.1);
    expect(screen.y + 89 * renderer.camera.view.zoom).toBeLessThanOrEqual(600.1);
    renderer.panBy(200, 100);
    renderer.setExpanded('music', true);
    const panned = { ...renderer.camera.view };
    for (let i = 121; i <= 180; i++) advanceFrame(i * 16.67);
    expect(renderer.camera.view).toEqual(panned);
  });
});
