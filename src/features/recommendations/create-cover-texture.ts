import { useEffect, useState } from 'react';
import * as THREE from 'three';

import type { RecommendationItem } from './recommendation-types';

import { createGeneratedCoverDataUrl, getCoverTextureTransform } from './cover-artwork';

export {
  createGeneratedCoverDataUrl,
  getCoverTextureTransform,
  getGeneratedCoverPalette,
} from './cover-artwork';

export const getSquareTextureTransform = (width: number, height: number) =>
  getCoverTextureTransform(width, height);

export const useRecommendationTexture = (
  item: RecommendationItem,
  targetAspect = 1,
): THREE.Texture | null => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const imageSource = item.cover.kind === 'generated' ? null : item.cover.src;

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const ownedTextures = new Set<THREE.Texture>();
    const generatedSource = createGeneratedCoverDataUrl(item, targetAspect);
    let cancelled = false;
    let visibleTexture: THREE.Texture | null = null;
    let remoteReady = false;

    const disposeOwnedTexture = (ownedTexture: THREE.Texture) => {
      if (ownedTextures.delete(ownedTexture)) ownedTexture.dispose();
    };

    const loadTexture = (source: string, preferred: boolean) => {
      let requestedTexture: THREE.Texture | null = null;

      const handleError = () => {
        if (cancelled) return;

        if (requestedTexture) disposeOwnedTexture(requestedTexture);

        if (!preferred && !visibleTexture) {
          setTexture(null);
        }
      };

      try {
        requestedTexture = loader.load(
          source,
          (loadedTexture) => {
            if (cancelled || (!preferred && remoteReady)) {
              disposeOwnedTexture(loadedTexture);
              return;
            }

            if (preferred) remoteReady = true;

            loadedTexture.colorSpace = THREE.SRGBColorSpace;
            loadedTexture.anisotropy = 4;
            const image = loadedTexture.image;
            const transform = image
              ? getCoverTextureTransform(
                  image.width,
                  image.height,
                  targetAspect,
                )
              : null;
            if (transform) {
              loadedTexture.repeat.set(...transform.repeat);
              loadedTexture.offset.set(...transform.offset);
            }
            if (visibleTexture && visibleTexture !== loadedTexture) {
              disposeOwnedTexture(visibleTexture);
            }
            visibleTexture = loadedTexture;
            setTexture(loadedTexture);
          },
          undefined,
          handleError,
        );
        ownedTextures.add(requestedTexture);
      } catch {
        handleError();
      }
    };

    setTexture(null);
    // Show local artwork immediately while a remote CDN responds. A late
    // placeholder must never replace an already loaded original cover.
    loadTexture(generatedSource, false);
    if (imageSource) loadTexture(imageSource, true);

    return () => {
      cancelled = true;
      ownedTextures.forEach((ownedTexture) => ownedTexture.dispose());
      ownedTextures.clear();
    };
  }, [
    item.cover.kind,
    item.creator,
    item.id,
    item.title,
    item.year,
    imageSource,
    targetAspect,
  ]);

  return texture;
};
