import {
  Environment,
  Lightformer,
  PresentationControls,
} from '@react-three/drei';
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from '@react-three/fiber';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as THREE from 'three';

import {
  finishCanvasDrag,
  getCanvasReleaseOffset,
  moveCanvasDrag,
  startCanvasDrag,
  type CanvasDragState,
} from './canvas-drag';
import { recommendationModelRegistry } from './model-registry';
import { getRecommendationIdAtOffset } from './recommendation-navigation';
import {
  resolvePresentation,
  type RecommendationItem,
} from './recommendation-types';
import {
  compactSlots,
  desktopSlots,
  getStageItems,
  type StageSlot,
} from './stage-layout';

export type RecommendationStageProps = {
  items: RecommendationItem[];
  activeId: string;
  compact: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onFailure: () => void;
};

type StageModelProps = {
  item: RecommendationItem;
  active: boolean;
  reducedMotion: boolean;
  slot: StageSlot;
  onSelect: () => void;
};

const applySlot = (group: THREE.Group, slot: StageSlot) => {
  group.position.set(...slot.position);
  group.rotation.set(...slot.rotation);
  group.scale.setScalar(slot.scale);
};

const isSlotSettled = (group: THREE.Group, slot: StageSlot) => {
  const positionDistance = group.position.distanceToSquared(
    new THREE.Vector3(...slot.position),
  );
  const rotationDistance =
    Math.abs(group.rotation.x - slot.rotation[0]) +
    Math.abs(group.rotation.y - slot.rotation[1]) +
    Math.abs(group.rotation.z - slot.rotation[2]);

  return (
    positionDistance < 0.000001 &&
    rotationDistance < 0.001 &&
    Math.abs(group.scale.x - slot.scale) < 0.001
  );
};

const StageCamera = ({ compact }: { compact: boolean }) => {
  const { camera, size, get, set, invalidate } = useThree();

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = size.width / Math.max(1, size.height);
    const visibleWidth = compact ? 5.9 : Math.max(11.8, aspect * 6.4);
    camera.fov = 34;
    const distance = visibleWidth / (2 * Math.tan(THREE.MathUtils.degToRad(17)) * aspect);
    camera.position.set(0, 0, distance);
    camera.updateProjectionMatrix();
    const viewport = get().viewport;
    set({
      viewport: {
        ...viewport,
        ...viewport.getCurrentViewport(camera, new THREE.Vector3(), size),
      },
    });
    invalidate();
  }, [camera, compact, get, invalidate, set, size.width, size.height]);

  return null;
};

const ObjectPresentation = ({
  children,
  reducedMotion,
  resetKey,
}: {
  children: ReactNode;
  reducedMotion: boolean;
  resetKey: string;
}) => {
  const invalidate = useThree((state) => state.invalidate);
  const dragging = useRef(false);
  const snapTimeRemaining = useRef(0);

  useFrame((_, delta) => {
    if (dragging.current) {
      invalidate();
      return;
    }

    if (snapTimeRemaining.current > 0) {
      snapTimeRemaining.current = Math.max(
        0,
        snapTimeRemaining.current - delta,
      );
      invalidate();
    }
  });

  const beginDrag = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    dragging.current = true;
    snapTimeRemaining.current = 0;
    invalidate();
  };
  const continueDrag = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
  };
  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    dragging.current = false;
    snapTimeRemaining.current = reducedMotion ? 0 : 1.2;
    invalidate();
  };

  return (
    <group
      userData={{ recommendationObject: true }}
      onPointerDown={beginDrag}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <PresentationControls
        key={`${resetKey}-${reducedMotion ? 'reduced' : 'animated'}`}
        rotation={[0, 0, 0]}
        polar={[-Math.PI / 10, Math.PI / 10]}
        azimuth={[-Math.PI / 6, Math.PI / 6]}
        speed={0.8}
        zoom={1}
        snap={reducedMotion ? true : 0.18}
        damping={reducedMotion ? 0.0001 : 0.16}
      >
        {children}
      </PresentationControls>
    </group>
  );
};

const StageModel = ({
  item,
  active,
  reducedMotion,
  slot,
  onSelect,
}: StageModelProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const presentation = resolvePresentation(item.category, item.presentation);
  const Model = recommendationModelRegistry[presentation];

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    if (!initialized.current || reducedMotion) {
      applySlot(group, slot);
      initialized.current = true;
    }

    invalidate();
  }, [invalidate, reducedMotion, slot]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || reducedMotion || isSlotSettled(group, slot)) return;

    const damping = 10;
    group.position.set(
      THREE.MathUtils.damp(
        group.position.x,
        slot.position[0],
        damping,
        delta,
      ),
      THREE.MathUtils.damp(
        group.position.y,
        slot.position[1],
        damping,
        delta,
      ),
      THREE.MathUtils.damp(
        group.position.z,
        slot.position[2],
        damping,
        delta,
      ),
    );
    group.rotation.set(
      THREE.MathUtils.damp(
        group.rotation.x,
        slot.rotation[0],
        damping,
        delta,
      ),
      THREE.MathUtils.damp(
        group.rotation.y,
        slot.rotation[1],
        damping,
        delta,
      ),
      THREE.MathUtils.damp(
        group.rotation.z,
        slot.rotation[2],
        damping,
        delta,
      ),
    );
    group.scale.setScalar(
      THREE.MathUtils.damp(group.scale.x, slot.scale, damping, delta),
    );

    if (isSlotSettled(group, slot)) {
      applySlot(group, slot);
      return;
    }

    invalidate();
  });

  const model = (
    <Model item={item} active={active} onSelect={onSelect} />
  );

  return (
    <group ref={groupRef}>
      <ObjectPresentation
        reducedMotion={reducedMotion}
        resetKey={item.id}
      >
        {model}
      </ObjectPresentation>
    </group>
  );
};

type CanvasTrackProps = {
  children: ReactNode;
  items: RecommendationItem[];
  activeId: string;
  compact: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
};

const CanvasTrack = ({
  children,
  items,
  activeId,
  compact,
  reducedMotion,
  onSelect,
}: CanvasTrackProps) => {
  const trackRef = useRef<THREE.Group>(null);
  const dragRef = useRef<CanvasDragState | null>(null);
  const settlingRef = useRef(false);
  const { gl, invalidate, size, viewport } = useThree();
  const pixelsToWorld = viewport.width / Math.max(1, size.width);
  const spacingWorld = compact ? 3.65 : 4.1;
  const spacingPx = spacingWorld / pixelsToWorld;

  const setPanning = (panning: boolean) => {
    gl.domElement.dataset.trackPanning = String(panning);
  };

  useEffect(() => {
    setPanning(false);

    return () => {
      delete gl.domElement.dataset.trackPanning;
    };
  }, [gl]);

  useFrame((_, delta) => {
    const track = trackRef.current;
    if (!track || dragRef.current || !settlingRef.current) return;

    track.position.x = THREE.MathUtils.damp(
      track.position.x,
      0,
      10,
      delta,
    );

    if (Math.abs(track.position.x) < 0.001) {
      track.position.x = 0;
      settlingRef.current = false;
      return;
    }

    invalidate();
  });

  const beginPan = (event: ThreeEvent<PointerEvent>) => {
    const startedOnRecommendation = event.intersections.some(({ object }) => {
      let current: THREE.Object3D | null = object;

      while (current) {
        if (current.userData.recommendationObject === true) return true;
        current = current.parent;
      }

      return false;
    });

    if (startedOnRecommendation) return;

    event.stopPropagation();
    gl.domElement.setPointerCapture?.(event.pointerId);
    dragRef.current = startCanvasDrag(
      event.clientX,
      event.clientY,
      event.timeStamp,
    );
    settlingRef.current = false;
    setPanning(false);
  };

  const movePan = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;

    event.stopPropagation();
    const nextDrag = moveCanvasDrag(
      drag,
      event.clientX,
      event.clientY,
      event.timeStamp,
    );
    dragRef.current = nextDrag;

    if (nextDrag.intent === 'scroll-y') {
      dragRef.current = null;
      if (gl.domElement.hasPointerCapture?.(event.pointerId)) {
        gl.domElement.releasePointerCapture?.(event.pointerId);
      }
      setPanning(false);
      return;
    }

    if (nextDrag.intent === 'pan-x') {
      track.position.x = nextDrag.offsetX * pixelsToWorld;
      setPanning(true);
      invalidate();
    }
  };

  const endPan = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;

    event.stopPropagation();
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
    setPanning(false);
    track.position.x = getCanvasReleaseOffset(
      result,
      pixelsToWorld,
      reducedMotion,
    );

    if (gl.domElement.hasPointerCapture?.(event.pointerId)) {
      gl.domElement.releasePointerCapture?.(event.pointerId);
    }

    if (result.steps !== 0 && nextId && nextId !== activeId) {
      onSelect(nextId);
    }

    if (reducedMotion) {
      track.position.x = 0;
      settlingRef.current = false;
    } else {
      settlingRef.current = Math.abs(track.position.x) >= 0.001;
    }
    invalidate();
  };

  const cancelPan = (event: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current) return;

    event.stopPropagation();
    dragRef.current = null;
    setPanning(false);
    settlingRef.current = !reducedMotion;

    if (reducedMotion && trackRef.current) {
      trackRef.current.position.x = 0;
    }
    invalidate();
  };

  return (
    <>
      <mesh
        position={[0, 0, -2.5]}
        onLostPointerCapture={cancelPan}
        onPointerCancel={cancelPan}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
      >
        <planeGeometry
          args={[viewport.width * 1.5, viewport.height * 1.5]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={trackRef}>{children}</group>
    </>
  );
};

const ContextLossListener = ({ onFailure }: { onFailure: () => void }) => {
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };

    canvas.dataset.recommendationStageReady = 'true';
    canvas.addEventListener('webglcontextlost', handleContextLost, {
      once: true,
    });

    return () => {
      delete canvas.dataset.recommendationStageReady;
      canvas.removeEventListener('webglcontextlost', handleContextLost);
    };
  }, [canvas, onFailure]);

  return null;
};

export const RecommendationStage = ({
  items,
  activeId,
  compact,
  reducedMotion,
  onSelect,
  onFailure,
}: RecommendationStageProps) => {
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const stageItems = getStageItems(
    items.map((item) => item.id),
    activeId,
    compact,
  );

  return (
    <Canvas
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      dpr={[1, 1.5]}
      frameloop="demand"
      shadows={{ type: THREE.VSMShadowMap }}
      camera={{ position: [0, 0, 9], fov: 34 }}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }}
    >
      <ContextLossListener onFailure={onFailure} />
      <StageCamera compact={compact} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#fffaf2', '#9a9081', 0.45]} />
      <directionalLight
        position={[-3, 4, 12]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={28}
        shadow-normalBias={0.035}
        shadow-bias={-0.0001}
        shadow-radius={5}
        shadow-blurSamples={8}
      />
      <directionalLight position={[5, 1, 5]} intensity={0.65} color="#e8efff" />
      <Environment background={false} resolution={128}>
        <Lightformer
          form="rect"
          intensity={2.2}
          position={[-4, 2, 5]}
          scale={[3, 6]}
        />
        <Lightformer form="rect" intensity={1.4} position={[0, 5, 3]} scale={[6, 2]} />
        <Lightformer form="rect" intensity={2} position={[5, 1, 4]} scale={[1.5, 5]} />
      </Environment>

      <CanvasTrack
        items={items}
        activeId={activeId}
        compact={compact}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
      >
        {stageItems.map(({ id, offset }) => {
          const item = itemsById.get(id);
          if (!item) return null;

          const slot = compact
            ? compactSlots[String(offset) as keyof typeof compactSlots]
            : desktopSlots[String(offset) as keyof typeof desktopSlots];

          return (
            <StageModel
              key={id}
              item={item}
              active={id === activeId}
              reducedMotion={reducedMotion}
              slot={slot}
              onSelect={() => onSelect(id)}
            />
          );
        })}
      </CanvasTrack>

      <mesh position={[0, 0, -3.2]} receiveShadow>
        <planeGeometry args={[40, 24]} />
        <shadowMaterial transparent opacity={0.075} color="#5e5141" depthWrite={false} />
      </mesh>
    </Canvas>
  );
};
