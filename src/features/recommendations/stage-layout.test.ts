import { describe, expect, it } from 'vitest';

import { compactSlots, desktopSlots, getStageItems } from './stage-layout';

describe('getStageItems', () => {
  it('centers the active item and exposes two neighbors on desktop', () => {
    const result = getStageItems(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      'c',
      false,
    );

    expect(result.map(({ id, offset }) => [id, offset])).toEqual([
      ['b', -1],
      ['c', 0],
      ['d', 1],
    ]);
  });

  it('shows one neighbor on each side on compact screens', () => {
    const result = getStageItems(['a', 'b', 'c', 'd'], 'a', true);

    expect(result.map(({ id, offset }) => [id, offset])).toEqual([
      ['d', -1],
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('does not repeat ids when fewer items exist than slots', () => {
    expect(getStageItems([], 'missing', false)).toEqual([]);
    expect(getStageItems(['a'], 'a', false)).toEqual([
      { id: 'a', offset: 0 },
    ]);
    expect(getStageItems(['a', 'b'], 'b', false)).toEqual([
      { id: 'a', offset: -1 },
      { id: 'b', offset: 0 },
    ]);
  });

  it('falls back to the first id when the active id is unknown', () => {
    expect(getStageItems(['a', 'b', 'c'], 'missing', true)).toEqual([
      { id: 'c', offset: -1 },
      { id: 'a', offset: 0 },
      { id: 'b', offset: 1 },
    ]);
  });
});

describe('stage composition', () => {
  it('gives the focus more size and depth than both neighbors', () => {
    for (const slots of [desktopSlots, compactSlots]) {
      for (const offset of ['-1', '1'] as const) {
        expect(slots['0'].scale).toBeGreaterThan(slots[offset].scale);
        expect(slots['0'].position[2]).toBeGreaterThan(slots[offset].position[2]);
      }
      expect(slots['-1'].position[0]).toBeLessThan(slots['0'].position[0]);
      expect(slots['1'].position[0]).toBeGreaterThan(slots['0'].position[0]);
      expect(Math.abs(slots['0'].rotation[1])).toBeGreaterThan(0.3);
    }
  });

  it('centers the compact focus while leaving room for desktop metadata', () => {
    expect(compactSlots['0'].position[0]).toBe(0);
    expect(desktopSlots['0'].position[0]).toBeGreaterThan(0);
    expect(Math.abs(compactSlots['1'].position[0])).toBeGreaterThan(3);
  });
});
