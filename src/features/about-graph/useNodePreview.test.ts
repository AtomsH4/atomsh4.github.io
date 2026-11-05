import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNodePreview } from './useNodePreview';
import { canPreviewNode } from './graph-presentation';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('node dwell previews', () => {
  it('keeps music and genre labels static while allowing previews for actual works', () => {
    const { result, unmount } = renderHook(() => useNodePreview(canPreviewNode));
    for (const id of ['music', 'music-rnb', 'music-rock', 'music-pop']) {
      act(() => result.current.enter(id, 100, 100));
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.hoveredId).toBe(id);
      expect(result.current.expandedId).toBeNull();
      act(() => result.current.focus(id));
      expect(result.current.expandedId).toBeNull();
      act(() => result.current.pin(id));
      expect(result.current.pinnedId).toBeNull();
      expect(result.current.expandedId).toBeNull();
    }
    act(() => result.current.pin('anime-eva'));
    expect(result.current.expandedId).toBe('anime-eva');
    act(() => result.current.pin('music'));
    expect(result.current.expandedId).toBeNull();
    unmount();
  });
  it('waits for a deliberate stay rather than opening on entry', () => {
    const { result, unmount } = renderHook(useNodePreview);
    act(() => result.current.enter('music', 100, 100));
    act(() => vi.advanceTimersByTime(359));
    expect(result.current.expandedId).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.expandedId).toBe('music');
    unmount();
  });
  it('restarts the dwell while moving and cancels if the pointer leaves', () => {
    const { result, unmount } = renderHook(useNodePreview);
    act(() => result.current.enter('music', 100, 100));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.move('music', 120, 100));
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.expandedId).toBeNull();
    act(() => result.current.leave());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.expandedId).toBeNull();
    unmount();
  });
  it('allows a brief exit grace period and preserves clicked content', () => {
    const { result, unmount } = renderHook(useNodePreview);
    act(() => result.current.pin('coding'));
    act(() => result.current.enter('music', 0, 0));
    act(() => vi.advanceTimersByTime(360));
    expect(result.current.expandedId).toBe('music');
    act(() => result.current.leave());
    act(() => vi.advanceTimersByTime(179));
    expect(result.current.expandedId).toBe('music');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.expandedId).toBe('coding');
    act(() => result.current.dismiss());
    expect(result.current.expandedId).toBeNull();
    unmount();
  });
  it('opens for keyboard focus and clears pending work on unmount', () => {
    const { result, unmount } = renderHook(useNodePreview);
    act(() => result.current.focus('anime-eva'));
    expect(result.current.expandedId).toBe('anime-eva');
    act(() => result.current.enter('games', 100, 0));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
