export type StageOffset = -1 | 0 | 1;

export type StageSlot = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: number;
};

export const desktopSlots = {
  '-1': {
    position: [-3.6, -0.8, -1.45],
    rotation: [-0.06, 0.3, -0.08],
    scale: 0.65,
  },
  '0': {
    position: [0.85, -0.25, 0],
    rotation: [-0.1, 0.35, 0.025],
    scale: 1,
  },
  '1': {
    position: [4.85, 0.05, -1.65],
    rotation: [0.02, -0.46, 0.08],
    scale: 0.62,
  },
} as const satisfies Record<`${StageOffset}`, StageSlot>;

export const compactSlots = {
  '-1': {
    position: [-3.65, 0, -1.4],
    rotation: [-0.06, 0.28, -0.07],
    scale: 0.62,
  },
  '0': {
    position: [0, -0.04, 0],
    rotation: [-0.08, 0.32, 0.025],
    scale: 0.92,
  },
  '1': {
    position: [3.65, 0.05, -1.4],
    rotation: [0.02, -0.4, 0.07],
    scale: 0.62,
  },
} as const satisfies Record<`${StageOffset}`, StageSlot>;

export type StageItem = { id: string; offset: StageOffset };

export const getStageItems = (
  ids: readonly string[],
  activeId: string,
  _compact: boolean,
): StageItem[] => {
  if (ids.length === 0) return [];

  const activeIndex = Math.max(0, ids.indexOf(activeId));
  const seenIds = new Set<string>();
  const result: StageItem[] = [];

  for (const offset of [0, -1, 1] as const) {
    const id = ids[(activeIndex + offset + ids.length) % ids.length];
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    result.push({ id, offset });
  }

  return result.sort((left, right) => left.offset - right.offset);
};
