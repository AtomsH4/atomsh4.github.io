import { useEffect, useRef, useState } from 'react';
import { joinBasePath } from '../../lib/site-path';
import type { NodeImage } from './graph-presentation';

export function NodeArtwork({ image, basePath, decorative = false }: { image: NodeImage; basePath: string; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const requestedSrc = image.src.startsWith('https://') ? image.src : joinBasePath(basePath, image.src);
  useEffect(() => {
    setFailed(false); setLoaded(false);
    // SSR images can finish before hydration attaches load/error handlers.
    const element = imageRef.current;
    if (element?.getAttribute('src') === requestedSrc && element.complete) {
      setFailed(element.naturalWidth === 0);
      setLoaded(element.naturalWidth > 0);
    }
  }, [requestedSrc]);
  const src = failed ? image.fallback : image.src;
  if (!src) return null;
  return <span data-artwork="" style={image.fallback ? { backgroundImage: `url("${joinBasePath(basePath, image.fallback)}")` } : undefined}><img ref={imageRef} src={src.startsWith('https://') ? src : joinBasePath(basePath, src)}
    alt={decorative ? '' : image.alt} aria-hidden={decorative || undefined} decoding="async"
    style={{ opacity: loaded || failed || !src.startsWith('https://') ? 1 : 0 }}
    draggable={false} onLoad={() => setLoaded(true)} onError={() => { if (!failed) setFailed(true); }} /></span>;
}
