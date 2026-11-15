import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEventHandler,
} from 'react';

import { RecommendationCover } from './RecommendationCover';
import {
  finishCanvasDrag,
  moveCanvasDrag,
  startCanvasDrag,
  type CanvasDragState,
} from './canvas-drag';
import styles from './RecommendationExperience.module.css';
import { getGeneratedCoverPalette } from './cover-artwork';
import {
  getCoverEdgeTextColor,
  sampleCoverEdge,
  type CoverEdgeAppearance,
} from './cover-edge-color';
import { getRecommendationIdAtOffset } from './recommendation-navigation';
import { getBookThickness } from './object-appearance';
import {
  resolvePresentation,
  type RecommendationItem,
} from './recommendation-types';
import { getStageItems } from './stage-layout';
import { useDragRotation } from './useDragRotation';

export type RecommendationFallbackStageProps = {
  items: RecommendationItem[];
  activeId: string;
  compact: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
};

const PhysicalObject = ({
  item,
  active,
  offset,
  onSelect,
}: {
  item: RecommendationItem;
  active: boolean;
  offset: number;
  onSelect: (id: string) => void;
}) => {
  const { consumeDraggedClick, rotation, pointerHandlers } =
    useDragRotation();
  const presentation = resolvePresentation(item.category, item.presentation);
  const source = item.cover.kind === 'generated' ? item.id : item.cover.src;
  const [sampledCover, setSampledCover] = useState<{
    source: string;
    edge: CoverEdgeAppearance;
  } | null>(null);
  const edge = sampledCover?.source === source ? sampledCover.edge : null;
  const color = edge?.color ?? getGeneratedCoverPalette(item.id).background;
  const handleCoverLoad = useCallback((image: HTMLImageElement) => {
    const sampled = sampleCoverEdge(image);
    setSampledCover(sampled ? { source, edge: sampled } : null);
  }, [source]);
  const style = {
    '--rx': `${rotation.rotationX}deg`,
    '--ry': `${rotation.rotationY}deg`,
    '--object-ink': color,
    '--object-text': edge?.foreground ?? getCoverEdgeTextColor(color),
    '--book-spine-background': edge?.background ?? color,
    '--book-depth': `${getBookThickness(item.id) * 3}rem`,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`${styles.cssObject} ${
        presentation === 'disc' ? styles.cssDisc : styles.cssBook
      }`}
      aria-label={`${active ? '旋转' : '选择'} ${item.title}`}
      aria-current={active ? 'true' : undefined}
      data-css-recommendation-object=""
      data-css-recommendation-active={active ? '' : undefined}
      data-dragging={String(rotation.dragging)}
      data-offset={offset}
      data-presentation={presentation}
      style={style}
      onClick={() => {
        if (consumeDraggedClick() || active) return;
        onSelect(item.id);
      }}
      {...pointerHandlers}
    >
      {presentation === 'disc' ? (
        <>
          <span className={styles.cssDiscEdge} aria-hidden="true" />
          <span className={styles.cssFace}>
            <RecommendationCover item={item} />
          </span>
          <span className={styles.cssDiscHub} aria-hidden="true" />
        </>
      ) : (
        <>
          <span className={styles.cssBookPages} aria-hidden="true" />
          <span className={styles.cssBookSpine} aria-hidden="true">
            {item.title}
          </span>
          <span className={styles.cssFace}>
            <RecommendationCover
              item={item}
              onImageLoad={handleCoverLoad}
              onImageError={() => setSampledCover(null)}
            />
          </span>
        </>
      )}
    </button>
  );
};

export const RecommendationFallbackStage = ({
  items,
  activeId,
  compact,
  reducedMotion,
  onSelect,
}: RecommendationFallbackStageProps) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CanvasDragState | null>(null);
  const resetFrameRef = useRef<number | null>(null);
  const [trackMotion, setTrackMotion] = useState({
    dragging: false,
    offsetX: 0,
  });
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const stageItems = getStageItems(
    items.map((item) => item.id),
    activeId,
    compact,
  );

  useEffect(
    () => () => {
      if (resetFrameRef.current !== null) {
        cancelAnimationFrame(resetFrameRef.current);
      }
    },
    [],
  );

  const resetTrack = () => {
    dragRef.current = null;
    setTrackMotion({ dragging: false, offsetX: 0 });
  };

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = startCanvasDrag(
      event.clientX,
      event.clientY,
      event.timeStamp,
    );
  };

  const handlePointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    const drag = dragRef.current;
    if (!drag) return;

    const nextDrag = moveCanvasDrag(
      drag,
      event.clientX,
      event.clientY,
      event.timeStamp,
    );
    dragRef.current = nextDrag;

    if (nextDrag.intent === 'pan-x') {
      setTrackMotion({ dragging: true, offsetX: nextDrag.offsetX });
    }
  };

  const handlePointerUp: PointerEventHandler<HTMLDivElement> = () => {
    const drag = dragRef.current;
    if (!drag) return;

    const width = stageRef.current?.getBoundingClientRect().width ?? 0;
    const spacingPx = Math.max(
      compact ? 180 : 220,
      width * (compact ? 0.62 : 0.2),
    );
    const result = finishCanvasDrag(drag, {
      itemCount: items.length,
      spacingPx,
      reducedMotion,
    });
    const nextId = getRecommendationIdAtOffset(
      items,
      activeId,
      result.steps,
    );

    dragRef.current = null;

    if (result.steps !== 0 && nextId && nextId !== activeId) {
      setTrackMotion({
        dragging: false,
        offsetX: reducedMotion ? 0 : result.rebasedOffsetX,
      });
      onSelect(nextId);

      if (!reducedMotion) {
        resetFrameRef.current = requestAnimationFrame(() => {
          resetFrameRef.current = null;
          setTrackMotion({ dragging: false, offsetX: 0 });
        });
      }
      return;
    }

    setTrackMotion({ dragging: false, offsetX: 0 });
  };

  const trackStyle = {
    '--track-x': `${trackMotion.offsetX}px`,
  } as CSSProperties;

  return (
    <div
      ref={stageRef}
      className={styles.cssStage}
      data-css-recommendation-stage=""
      data-compact={String(compact)}
      data-panning={String(trackMotion.dragging)}
      data-reduced-motion={String(reducedMotion)}
      data-testid="recommendation-fallback-stage"
      onLostPointerCapture={() => {
        if (dragRef.current) resetTrack();
      }}
      onPointerCancel={resetTrack}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className={styles.cssTrack}
        data-panning={String(trackMotion.dragging)}
        style={trackStyle}
      >
        {stageItems.map(({ id, offset }) => {
          const item = itemsById.get(id);
          if (!item) return null;

          return (
            <PhysicalObject
              key={id}
              item={item}
              active={id === activeId}
              offset={offset}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
};
