import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGeneratedCoverDataUrl,
  getGeneratedCoverPalette,
  getSquareTextureTransform,
  useRecommendationTexture,
} from './create-cover-texture';
import type { RecommendationItem } from './recommendation-types';

const decodeSvgDataUrl = (dataUrl: string) =>
  decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));

describe('getSquareTextureTransform', () => {
  it('crops a portrait image to a centered square', () => {
    const transform = getSquareTextureTransform(1400, 2100);
    expect(transform?.repeat).toEqual([1, 2 / 3]);
    expect(transform?.offset[0]).toBe(0);
    expect(transform?.offset[1]).toBeCloseTo(1 / 6);
  });

  it('crops a landscape image to a centered square', () => {
    const transform = getSquareTextureTransform(2100, 1400);
    expect(transform?.repeat).toEqual([2 / 3, 1]);
    expect(transform?.offset[0]).toBeCloseTo(1 / 6);
    expect(transform?.offset[1]).toBe(0);
  });

  it('leaves a square image unchanged', () => {
    expect(getSquareTextureTransform(1024, 1024)).toEqual({
      repeat: [1, 1],
      offset: [0, 0],
    });
  });

  it('returns null when either image dimension is non-positive', () => {
    expect(getSquareTextureTransform(0, 1024)).toBeNull();
  });

  it('returns null when either image dimension is non-finite', () => {
    expect(getSquareTextureTransform(Number.NaN, 1024)).toBeNull();
    expect(getSquareTextureTransform(1024, Number.NaN)).toBeNull();
    expect(
      getSquareTextureTransform(Number.POSITIVE_INFINITY, 1024),
    ).toBeNull();
    expect(
      getSquareTextureTransform(1024, Number.POSITIVE_INFINITY),
    ).toBeNull();
  });
});

describe('createGeneratedCoverDataUrl', () => {
  it('creates a self-contained 1024px SVG data URL with system typography', () => {
    const result = createGeneratedCoverDataUrl({
      id: 'cover-a',
      title: 'A title',
      creator: 'A creator',
      year: 2026,
    });
    const decoded = decodeSvgDataUrl(result);

    expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decoded).toContain('width="1024"');
    expect(decoded).toContain('height="1024"');
    expect(decoded).toContain('viewBox="0 0 1024 1024"');
    const palette = getGeneratedCoverPalette('cover-a');
    expect(decoded).toContain(`fill="${palette.background}"`);
    expect(decoded).toContain(`fill="${palette.accent}"`);
    expect(decoded).toContain(`fill="${palette.foreground}"`);
    expect(decoded).toContain('font-family="system-ui');
    expect(decoded).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(decoded).not.toMatch(/<(?:image|use)\b|\bhref=|url\(/);
  });

  it('creates a portrait generated cover for a book face without cropping text', () => {
    const bookFaceAspect = 3.12 / 4.12;
    const result = createGeneratedCoverDataUrl(
      {
        id: 'portrait-book',
        title: 'Portrait title',
        creator: 'Portrait creator',
        year: 2026,
      },
      bookFaceAspect,
    );
    const decoded = decodeSvgDataUrl(result);
    const expectedHeight = Math.round(1024 / bookFaceAspect);

    expect(decoded).toContain('width="1024"');
    expect(decoded).toContain(`height="${expectedHeight}"`);
    expect(decoded).toContain(`viewBox="0 0 1024 ${expectedHeight}"`);
  });

  it('XML-escapes title and creator text so they cannot inject SVG', () => {
    const result = createGeneratedCoverDataUrl({
      id: 'cover-b',
      title: `A & B < C > D "quoted" 'single'`,
      creator: `</text><script>alert("x")</script> & 'creator'`,
      year: 2026,
    });
    const decoded = decodeSvgDataUrl(result);

    expect(decoded).toContain(
      'A &amp; B &lt; C &gt; D &quot;quoted&quot; &apos;single&apos;',
    );
    expect(decoded).toContain(
      '&lt;/text&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &apos;creator&apos;',
    );
    expect(decoded).not.toContain('<script>');
  });

  it('creates a stable non-monochrome palette for each item', () => {
    expect(getGeneratedCoverPalette('music-item')).toEqual(
      getGeneratedCoverPalette('music-item'),
    );
    const palette = getGeneratedCoverPalette('music-item');
    expect(
      new Set([palette.background, palette.accent, palette.foreground]).size,
    ).toBe(3);
  });
});

type PendingTextureLoad = {
  url: string;
  texture: THREE.Texture<HTMLImageElement>;
  onLoad?: (texture: THREE.Texture<HTMLImageElement>) => void;
  onError?: (error: unknown) => void;
};

const createItem = (
  id: string,
  cover: RecommendationItem['cover'],
): RecommendationItem => ({
  id,
  title: `Title ${id}`,
  category: 'book',
  presentation: 'book',
  creator: `Creator ${id}`,
  year: 2026,
  externalUrl: 'https://example.com/work',
  cover,
});

describe('useRecommendationTexture', () => {
  const pendingLoads: PendingTextureLoad[] = [];

  beforeEach(() => {
    pendingLoads.length = 0;
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
      (url, onLoad, _onProgress, onError) => {
        const texture = new THREE.Texture<HTMLImageElement>();
        pendingLoads.push({ url, texture, onLoad, onError });
        return texture;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a generated cover in sRGB and disposes it on cleanup', () => {
    const item = createItem('generated', {
      kind: 'generated',
      credit: 'Original',
    });
    const { result, unmount } = renderHook(() =>
      useRecommendationTexture(item),
    );
    const request = pendingLoads[0];
    const dispose = vi.spyOn(request.texture, 'dispose');
    Object.defineProperty(request.texture, 'image', {
      configurable: true,
      value: { width: 1400, height: 2100 },
    });

    expect(request.url).toMatch(/^data:image\/svg\+xml/);

    act(() => request.onLoad?.(request.texture));

    expect(result.current).toBe(request.texture);
    expect(request.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(request.texture.repeat.toArray()).toEqual([1, 2 / 3]);
    expect(request.texture.offset.x).toBe(0);
    expect(request.texture.offset.y).toBeCloseTo(1 / 6);

    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('crops a portrait texture to the full book-face aspect ratio', () => {
    const item = createItem('portrait-book', {
      kind: 'remote',
      src: 'https://covers.openlibrary.org/b/id/314604-L.jpg?default=false',
      sourceUrl: 'https://openlibrary.org/works/OL505740W',
      provider: 'open-library',
      credit: 'Open Library cover repository',
    });
    const bookFaceAspect = 3.12 / 4.12;
    const { result, unmount } = renderHook(() =>
      useRecommendationTexture(item, bookFaceAspect),
    );
    const request = pendingLoads[1];
    Object.defineProperty(request.texture, 'image', {
      configurable: true,
      value: { width: 100, height: 150 },
    });

    act(() => request.onLoad?.(request.texture));

    expect(result.current).toBe(request.texture);
    expect(request.texture.repeat.x).toBe(1);
    expect(request.texture.repeat.y).toBeCloseTo(100 / 150 / bookFaceAspect);
    expect(request.texture.offset.x).toBe(0);
    expect(request.texture.offset.y).toBeCloseTo(
      (1 - 100 / 150 / bookFaceAspect) / 2,
    );

    unmount();
  });

  it('falls back from a failed licensed cover without surfacing the error', () => {
    const item = createItem('licensed', {
      kind: 'licensed',
      src: '/media/recommendations/cover.svg',
      sourceUrl: 'https://example.com/source',
      license: 'CC BY 4.0',
      licenseUrl: 'https://example.com/license',
      credit: 'Creator',
    });
    const { result, unmount } = renderHook(() =>
      useRecommendationTexture(item),
    );
    const licensedRequest = pendingLoads[1];
    const licensedDispose = vi.spyOn(licensedRequest.texture, 'dispose');

    expect(licensedRequest.url).toBe('/media/recommendations/cover.svg');

    act(() => licensedRequest.onError?.(new Error('load failed')));

    expect(licensedDispose).toHaveBeenCalledOnce();
    expect(pendingLoads).toHaveLength(2);
    expect(pendingLoads[0].url).toMatch(/^data:image\/svg\+xml/);

    act(() => pendingLoads[0].onLoad?.(pendingLoads[0].texture));

    expect(result.current).toBe(pendingLoads[0].texture);
    expect(result.current?.colorSpace).toBe(THREE.SRGBColorSpace);
    unmount();
  });

  it('loads a remote cover and falls back to generated artwork on failure', () => {
    const item = createItem('remote', {
      kind: 'remote',
      src: 'https://covers.openlibrary.org/b/id/314604-L.jpg?default=false',
      sourceUrl: 'https://openlibrary.org/works/OL505740W',
      provider: 'open-library',
      credit: 'Open Library cover repository',
    });
    const bookFaceAspect = 3.12 / 4.12;
    const { result, unmount } = renderHook(() =>
      useRecommendationTexture(item, bookFaceAspect),
    );
    const remoteRequest = pendingLoads[1];

    expect(remoteRequest.url).toBe(item.cover.kind === 'remote' ? item.cover.src : '');

    act(() => remoteRequest.onError?.(new Error('load failed')));

    expect(pendingLoads).toHaveLength(2);
    expect(pendingLoads[0].url).toMatch(/^data:image\/svg\+xml/);
    expect(decodeSvgDataUrl(pendingLoads[0].url)).toContain(
      `height="${Math.round(1024 / bookFaceAspect)}"`,
    );

    act(() => pendingLoads[0].onLoad?.(pendingLoads[0].texture));

    expect(result.current).toBe(pendingLoads[0].texture);
    expect(result.current?.colorSpace).toBe(THREE.SRGBColorSpace);
    unmount();
  });

  it('shows local artwork while waiting for a remote cover', () => {
    const item = createItem('slow-remote', {
      kind: 'remote',
      src: 'https://example.com/slow-cover.jpg',
      sourceUrl: 'https://example.com/work',
      provider: 'open-library',
      credit: 'Cover repository',
    });
    const { result, unmount } = renderHook(() => useRecommendationTexture(item));
    const [placeholder, original] = pendingLoads;
    const disposePlaceholder = vi.spyOn(placeholder.texture, 'dispose');

    act(() => placeholder.onLoad?.(placeholder.texture));
    expect(result.current).toBe(placeholder.texture);

    act(() => original.onLoad?.(original.texture));
    expect(result.current).toBe(original.texture);
    expect(disposePlaceholder).toHaveBeenCalledOnce();
    unmount();
  });

  it('keeps the original when a placeholder finishes loading later', () => {
    const item = createItem('fast-remote', {
      kind: 'remote',
      src: 'https://example.com/fast-cover.jpg',
      sourceUrl: 'https://example.com/work',
      provider: 'open-library',
      credit: 'Cover repository',
    });
    const { result, unmount } = renderHook(() => useRecommendationTexture(item));
    const [placeholder, original] = pendingLoads;

    act(() => original.onLoad?.(original.texture));
    act(() => placeholder.onLoad?.(placeholder.texture));

    expect(result.current).toBe(original.texture);
    unmount();
  });

  it('ignores stale callbacks after the item changes', () => {
    const firstItem = createItem('first', {
      kind: 'generated',
      credit: 'Original',
    });
    const secondItem = createItem('second', {
      kind: 'generated',
      credit: 'Original',
    });
    const { result, rerender } = renderHook(
      ({ item }: { item: RecommendationItem }) =>
        useRecommendationTexture(item),
      { initialProps: { item: firstItem } },
    );
    const staleRequest = pendingLoads[0];
    const staleDispose = vi.spyOn(staleRequest.texture, 'dispose');

    rerender({ item: secondItem });
    expect(staleDispose).toHaveBeenCalledOnce();

    act(() => staleRequest.onLoad?.(staleRequest.texture));

    expect(result.current).toBeNull();

    const currentRequest = pendingLoads[1];
    act(() => currentRequest.onLoad?.(currentRequest.texture));
    expect(result.current).toBe(currentRequest.texture);
  });
});
