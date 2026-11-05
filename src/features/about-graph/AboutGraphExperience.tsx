import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { branches, coreNodes, defaultExpandedIds, getChildren, getNodePath, getVisibleNodes, graphRelations, type GraphNode } from './graph-data';
import { canPreviewNode, getNodePresentation } from './graph-presentation';
import { GraphRuntime, type GraphSnapshot } from './graph-runtime';
import { joinBasePath } from '../../lib/site-path';
import { NodeArtwork } from './NodeArtwork';
import { useNodePreview } from './useNodePreview';
import styles from './AboutGraphExperience.module.css';

const defaultExpansion = () => new Set<string>(defaultExpandedIds);
type Gesture = { id: string; pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean };

export default function AboutGraphExperience({ basePath = '/' }: { basePath?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeElements = useRef(new Map<string, HTMLButtonElement>());
  const actionElements = useRef(new Map<string, HTMLSpanElement>());
  const linkElements = useRef(new Map<string, SVGPathElement>());
  const relationElements = useRef(new Map<string, SVGGElement>());
  const savedRuntime = useRef<{ key: string; snapshot: GraphSnapshot } | null>(null);
  const runtime = useRef<GraphRuntime | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const panGesture = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef<{ id: string; until: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 660 });
  const [expanded, setExpanded] = useState(defaultExpansion);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('atomsh');
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const preview = useNodePreview(canPreviewNode);
  const compact = size.width > 0 && size.width < 900;
  const visible = useMemo(() => getVisibleNodes(compact, expanded, focusedId), [compact, expanded, focusedId]);
  const visibleIds = new Set(visible.map(n => n.id));
  const interactionId = preview.hoveredId ?? preview.expandedId ?? selectedId;
  const activePath = getNodePath(interactionId);
  const activeIds = new Set(activePath.map(n => n.id));
  const activeBranch = activePath.at(-1)?.branch ?? null;
  const visibleRelations = graphRelations.filter(r => visibleIds.has(r.sourceId) && visibleIds.has(r.targetId));
  const relatedIds = new Set(activeIds);
  for (const relation of visibleRelations) {
    if (relation.sourceId === interactionId || relation.targetId === interactionId) {
      relatedIds.add(relation.sourceId); relatedIds.add(relation.targetId);
    }
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const next = { width: stage.clientWidth, height: stage.clientHeight };
      setSize(old => old.width === next.width && old.height === next.height ? old : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage); measure();
    let active = true;
    document.fonts.ready.then(() => { if (active) setRevision(v => v + 1); });
    return () => { active = false; observer.disconnect(); };
  }, []);

  useEffect(() => { setFocusedId(null); setSelectedId('atomsh'); preview.dismiss(); }, [compact]);
  useEffect(() => {
    if (!stageRef.current || !canvasRef.current || !size.width) return;
    const key = `${size.width}:${size.height}:${compact}:${focusedId}:${revision}`;
    const renderer = new GraphRuntime({ stage: stageRef.current, canvas: canvasRef.current,
      nodeElements: nodeElements.current, actionElements: actionElements.current, linkElements: linkElements.current, relationElements: relationElements.current,
      snapshot: savedRuntime.current?.key === key ? savedRuntime.current.snapshot : undefined,
      nodes: visible, size, compact, focusedId });
    runtime.current = renderer; setReady(true);
    return () => { savedRuntime.current = { key, snapshot: renderer.snapshot() }; renderer.dispose(); runtime.current = null; gesture.current = null; panGesture.current = null; };
  }, [visible, size, compact, focusedId, revision]);
  useEffect(() => { runtime.current?.setHighlight(activeBranch); }, [activeBranch, visible, size, revision]);
  useEffect(() => {
    runtime.current?.setHeldNode(preview.hoveredId ?? preview.expandedId);
    const keyboardFocus = preview.expandedId ? nodeElements.current.get(preview.expandedId)?.matches(':focus-visible') : false;
    runtime.current?.setExpanded(preview.expandedId, !!keyboardFocus || (!!preview.expandedId && preview.pinnedId === preview.expandedId));
  }, [preview.hoveredId, preview.expandedId, preview.pinnedId, visible, size, revision]);

  const selectNode = (node: GraphNode) => {
    const suppressed = suppressClick.current;
    if (suppressed?.id === node.id && performance.now() < suppressed.until) { suppressClick.current = null; return; }
    if (compact && !node.parentId && focusedId) { reset(); return; }
    setSelectedId(node.id); preview.pin(node.id);
    if (!node.parentId) setFocusedId(null);
    else if (compact && getChildren(node.id).length) setFocusedId(node.id);
    else if (!compact && getChildren(node.id).length) setExpanded(old => {
      const next = new Set(old);
      if (selectedId === node.id && next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };
  const reset = () => { preview.dismiss(); setExpanded(defaultExpansion()); setFocusedId(null); setSelectedId('atomsh'); setRevision(v => v + 1); };

  const beginPointer = (event: PointerEvent<HTMLButtonElement>, node: GraphNode) => {
    preview.cancelPending();
    if (compact || !node.parentId || event.button !== 0 || !event.isPrimary) return;
    const position = runtime.current?.layout.byId.get(node.id);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!position || !rect) return;
    const point = runtime.current!.toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    gesture.current = { id: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: position.x - point.x, offsetY: position.y - point.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePointer = (event: PointerEvent<HTMLButtonElement>, node: GraphNode) => {
    if (event.pointerType === 'mouse') preview.move(node.id, event.clientX, event.clientY);
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 5) {
      current.moved = true; preview.cancelPending(); runtime.current?.startDrag(current.id); event.currentTarget.dataset.dragging = 'true';
    }
    if (!current.moved) return;
    event.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const point = runtime.current!.toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    runtime.current?.moveDrag(current.id, point.x + current.offsetX, point.y + current.offsetY);
  };

  const isBackground = (target: EventTarget) => !(target instanceof Element) || !target.closest('[data-node-id], [data-node-action-for]');
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary || !isBackground(event.target)) return;
    panGesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (panGesture.current?.pointerId !== event.pointerId) return;
    if (panGesture.current.moved) suppressClick.current = { id: 'background', until: performance.now() + 450 };
    panGesture.current = null;
    event.currentTarget.dataset.panning = 'false';
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const endPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null; event.currentTarget.dataset.dragging = 'false';
    if (current.moved) {
      runtime.current?.endDrag(current.id);
      if (event.type === 'pointerup') suppressClick.current = { id: current.id, until: performance.now() + 450 };
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const renderNode = (node: GraphNode) => {
    const branch = branches.find(b => b.id === node.branch);
    const kind = !node.parentId ? 'root' : node.appearance === 'concept' ? 'concept' : node.parentId === 'atomsh' ? 'branch' : 'leaf';
    const hasPreview = canPreviewNode(node.id);
    const open = hasPreview && preview.expandedId === node.id;
    const detail = getNodePresentation(node);
    const children = getChildren(node.id);
    const childrenOpen = compact ? focusedId === node.id : expanded.has(node.id);
    const navigation = node.navigation ? node.links?.[0] : undefined;
    const dimmed = !!activeBranch && node.branch !== activeBranch && !!node.parentId && !relatedIds.has(node.id);
    const textWidth = [...node.label].reduce((width, character) => width + (character.charCodeAt(0) > 127 ? kind === 'concept' ? 11 : 13 : kind === 'concept' ? 6 : 7.5), 0);
    const baseWidth = kind === 'root' ? 88 : kind === 'branch' ? Math.max(100, textWidth + 28) : kind === 'concept' ? Math.max(68, textWidth + 24)
      : Math.max(64, textWidth + 28 + (navigation ? 48 : 0));
    return <Fragment key={node.id}><button type="button" className={styles.node}
      ref={element => { if (element) nodeElements.current.set(node.id, element); else nodeElements.current.delete(node.id); }}
      data-node-id={node.id} data-kind={kind} data-branch={node.branch ?? ''} data-expanded={open}
      data-appearance={node.appearance ?? 'label'} data-children-open={childrenOpen}
      data-preview-type={hasPreview ? 'image' : 'none'}
      data-has-navigation={!!navigation}
      data-selected={selectedId === node.id} data-related={relatedIds.has(node.id)}
      data-dimmed={dimmed}
      aria-label={node.label} aria-pressed={selectedId === node.id} aria-expanded={children.length && kind !== 'root' ? childrenOpen : hasPreview ? open : undefined}
      style={{ '--node-width': `${baseWidth}px`, '--node-color': branch?.color ?? '#b9adff' } as CSSProperties}
      onClick={() => selectNode(node)} onPointerDown={event => beginPointer(event, node)}
      onPointerMove={event => movePointer(event, node)} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
      onPointerEnter={event => { if (event.pointerType === 'mouse') preview.enter(node.id, event.clientX, event.clientY); }}
      onPointerLeave={() => preview.leave()}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { preview.focus(node.id); if (!hasPreview) runtime.current?.revealNode(node.id); } }} onBlur={() => preview.leave()}>
      <span className={styles.nodeHeading}>
        {kind === 'root' ? <span className={styles.coreWord}>AtomsH</span>
          : <span className={styles.nodeLabel}>{node.label}</span>}
      </span>
      {hasPreview && detail.image && <span className={styles.nodePreview} aria-hidden={!open}>
        <span className={styles.nodePicture}>{open && <NodeArtwork image={detail.image} basePath={basePath} decorative />}</span>
      </span>}
    </button>
      {navigation && <span className={styles.nodeActions} data-node-action-for={node.id} data-branch={node.branch} data-dimmed={dimmed}
        ref={element => { if (element) actionElements.current.set(node.id, element); else actionElements.current.delete(node.id); }}>
        <a className={styles.nodeLink} href={navigation.href.startsWith('https://') ? navigation.href : joinBasePath(basePath, navigation.href)}
          aria-label={navigation.label} title={navigation.label}
          onPointerEnter={event => { if (event.pointerType === 'mouse') preview.enter(node.id, event.clientX, event.clientY); }}
          onPointerLeave={() => preview.leave()}
          onFocus={() => { preview.focus(node.id); runtime.current?.revealNode(node.id); }} onBlur={() => preview.leave()}>
          <svg className={styles.linkArrow} viewBox="0 0 20 20" aria-hidden="true" fill="none">
            <path d="M4 10h12m-5-5 5 5-5 5" />
          </svg>
        </a>
      </span>}
    </Fragment>;
  };

  const renderOverview = (id: string): ReactNode => <ul>{getChildren(id).map(node => <li key={node.id}>
    {node.links?.length ? <a href={node.links[0].href.startsWith('https://') ? node.links[0].href : joinBasePath(basePath, node.links[0].href)}>{node.label}</a> : node.label}
    {getChildren(node.id).length > 0 && renderOverview(node.id)}
  </li>)}</ul>;

  return <section className={styles.experience} lang="zh-CN" aria-label="AtomsH 兴趣图谱" aria-describedby="about-graph-instructions" data-about-graph="" data-ready={ready}
    onKeyDown={event => {
      if (event.key === 'Escape') { preview.dismiss(); runtime.current?.setPointer(0, 0, false); }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (['+', '=', '-', '0', 'Home'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '0' || event.key === 'Home') reset();
        else runtime.current?.zoomBy(event.key === '-' ? 1 / 1.15 : 1.15);
      }
    }}>
    <div ref={stageRef} className={styles.stage} data-graph-stage="" data-ready={ready} data-compact={compact} tabIndex={0} aria-label="兴趣图谱画布"
      onClick={event => { if (isBackground(event.target) && !(suppressClick.current?.id === 'background' && performance.now() < suppressClick.current.until)) preview.dismiss(); }}
      onDoubleClick={event => { if (isBackground(event.target)) reset(); }}
      onPointerDown={beginPan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan}
      onPointerMove={event => {
        const pan = panGesture.current;
        if (pan?.pointerId === event.pointerId) {
          const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
          if (pan.moved || Math.hypot(dx, dy) > 4) {
            pan.moved = true; runtime.current?.panBy(dx, dy);
            pan.x = event.clientX; pan.y = event.clientY; event.currentTarget.dataset.panning = 'true';
          }
          return;
        }
        if (event.pointerType !== 'mouse') return;
        const rect = event.currentTarget.getBoundingClientRect();
        runtime.current?.setPointer((event.clientX - rect.left) / rect.width - 0.5, (event.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => { runtime.current?.setPointer(0, 0, false); preview.leave(); }}>
      <div className={styles.stageBackdrop} aria-hidden="true" />
      <svg className={styles.connections} viewBox={`0 0 ${size.width || 1280} ${size.height}`} aria-hidden="true">
        {visible.filter(n => n.parentId && visibleIds.has(n.parentId)).map(n => <path key={n.id} data-link-to={n.id} data-branch={n.branch} data-concept={n.appearance === 'concept'}
          data-active={activeIds.has(n.id)} data-dimmed={!!activeBranch && n.branch !== activeBranch}
          ref={element => { if (element) linkElements.current.set(n.id, element); else linkElements.current.delete(n.id); }} />)}
        {visibleRelations.map(relation => <g key={relation.id} className={styles.relation} data-relation-id={relation.id}
          data-active={relation.sourceId === interactionId || relation.targetId === interactionId}
          ref={element => { if (element) relationElements.current.set(relation.id, element); else relationElements.current.delete(relation.id); }}>
          <path />
        </g>)}
      </svg>
      <canvas ref={canvasRef} className={styles.particles} aria-hidden="true" />
      <div className={styles.nodes}>{visible.map(renderNode)}</div>
      <div className={styles.staticOverview}><p>AtomsH</p><ul className={styles.coreOverview}>{coreNodes.map(node => <li key={node.id}>{node.label}</li>)}</ul>
        <div>{branches.map(branch => <section key={branch.id}><h2>{branch.label}</h2>{renderOverview(branch.id)}</section>)}</div></div>
    </div>
    <p id="about-graph-instructions" className="sr-only">拖动空白平移，滚轮或加减键缩放，双击空白、0 或 Home 键复位。鼠标靠近放大节点，停留查看配图，点击保留。点击类别展开子项，再次点击折叠。Escape 或点击空白收起配图。项目和算法右侧的箭头分别跳转博客和笔记。聚焦节点可查看相关连线。手机点击类别逐层浏览，点击祖先节点返回，点击 AtomsH 返回总览。</p>
    <p className="sr-only" role="status" aria-live="polite">当前节点：{getNodePath(selectedId).map(n => n.label).join('，')}</p>
  </section>;
}
