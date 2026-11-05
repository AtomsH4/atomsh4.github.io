import { useEffect, useRef, useState } from 'react';

export function useNodePreview(isPreviewEnabled: (id: string) => boolean = () => true) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPreviewId, setHoverPreviewId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const pending = useRef<{ id: string; x: number; y: number } | null>(null);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelPending = () => { clearTimeout(dwellTimer.current); pending.current = null; };
  const cancelTimers = () => { cancelPending(); clearTimeout(exitTimer.current); };
  useEffect(() => () => { clearTimeout(dwellTimer.current); clearTimeout(exitTimer.current); }, []);
  const schedule = (id: string, x: number, y: number) => {
    cancelTimers();
    if (!isPreviewEnabled(id)) { setHoverPreviewId(null); return; }
    pending.current = { id, x, y };
    dwellTimer.current = setTimeout(() => { pending.current = null; setHoverPreviewId(id); }, 360);
  };
  return {
    hoveredId, pinnedId, expandedId: hoverPreviewId ?? pinnedId,
    enter(id: string, x: number, y: number) { setHoveredId(id); schedule(id, x, y); },
    move(id: string, x: number, y: number) {
      const p = pending.current;
      if (p?.id === id && Math.hypot(p.x - x, p.y - y) > 7) schedule(id, x, y);
    },
    leave() { cancelTimers(); setHoveredId(null); exitTimer.current = setTimeout(() => setHoverPreviewId(null), 180); },
    focus(id: string) { cancelTimers(); setHoveredId(id); setHoverPreviewId(isPreviewEnabled(id) ? id : null); },
    pin(id: string) { cancelTimers(); setPinnedId(isPreviewEnabled(id) ? id : null); setHoverPreviewId(null); },
    dismiss() { cancelTimers(); setHoveredId(null); setHoverPreviewId(null); setPinnedId(null); },
    cancelPending,
  };
}
