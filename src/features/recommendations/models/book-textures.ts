import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { getGeneratedCoverPalette } from '../cover-artwork';
import { getCoverEdgeTextColor, sampleCoverEdge } from '../cover-edge-color';
import { getBookThickness } from '../object-appearance';
import type { RecommendationItem } from '../recommendation-types';

const makeTexture = (canvas: HTMLCanvasElement) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

export const useBookTextures = (item: RecommendationItem, cover: THREE.Texture | null) => {
  const edge = useMemo(() => {
    const image = cover?.image;
    return image instanceof HTMLImageElement ? sampleCoverEdge(image) : null;
  }, [cover]);
  const color = edge?.color ?? getGeneratedCoverPalette(item.id).background;
  const foreground = edge?.foreground ?? getCoverEdgeTextColor(color);
  const thickness = getBookThickness(item.id);
  const textures = useMemo(() => {
    const paper = document.createElement('canvas');
    paper.width = 128;
    paper.height = 1024;
    const pages = paper.getContext('2d')!;
    pages.fillStyle = '#f2ecdf';
    pages.fillRect(0, 0, 128, 1024);
    for (let y = 0; y < 1024; y += 5) {
      pages.fillStyle = y % 3 === 0 ? '#d4cbb9' : '#e0d8c9';
      pages.fillRect(0, y, 128, y % 7 === 0 ? 2 : 1);
    }
    const shade = pages.createLinearGradient(0, 0, 128, 0);
    shade.addColorStop(0, 'rgba(78, 57, 30, 0.16)');
    shade.addColorStop(0.3, 'rgba(78, 57, 30, 0)');
    shade.addColorStop(1, 'rgba(78, 57, 30, 0.08)');
    pages.fillStyle = shade;
    pages.fillRect(0, 0, 128, 1024);

    const spine = document.createElement('canvas');
    spine.width = 192;
    spine.height = 1024;
    const label = spine.getContext('2d')!;
    if (edge) {
      const background = label.createLinearGradient(0, 0, 0, 1024);
      edge.colors.forEach((stop, index) =>
        background.addColorStop(index / Math.max(1, edge.colors.length - 1), stop),
      );
      label.fillStyle = background;
    } else {
      label.fillStyle = color;
    }
    label.fillRect(0, 0, 192, 1024);
    label.strokeStyle = foreground;
    label.globalAlpha = 0.35;
    label.lineWidth = 2;
    for (const y of [72, 86, 938, 952]) {
      label.beginPath();
      label.moveTo(32, y);
      label.lineTo(160, y);
      label.stroke();
    }
    label.globalAlpha = 1;
    label.translate(96, 512);
    label.rotate(-Math.PI / 2);
    label.fillStyle = foreground;
    label.textAlign = 'center';
    label.textBaseline = 'middle';
    label.font = '600 54px system-ui, sans-serif';
    label.fillText(item.title, 0, -15, 770);
    label.font = '27px system-ui, sans-serif';
    label.fillText(item.creator, 0, 46, 720);
    return { pages: makeTexture(paper), spine: makeTexture(spine) };
  }, [color, edge, foreground, item.title, item.creator]);

  useEffect(() => () => {
    textures.pages.dispose();
    textures.spine.dispose();
  }, [textures]);

  return { ...textures, color, thickness };
};
