import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCoverEdgeAppearance, sampleCoverEdge } from './cover-edge-color';

const pixels = (
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { data, width, height };
};

afterEach(() => vi.restoreAllMocks());

describe('cover edge appearance', () => {
  it('matches the edge background despite a few bright letters', () => {
    const edge = getCoverEdgeAppearance(pixels(12, 8, (x) =>
      x < 3 ? [255, 255, 255, 255] : [29, 63, 87, 255],
    ));

    expect(edge?.color).toBe('#1d3f57');
    expect(edge?.background).toBe('#1d3f57');
    expect(edge?.foreground).toBe('#fffaf0');
  });

  it('preserves vertical color changes instead of flattening a gradient cover', () => {
    const edge = getCoverEdgeAppearance(pixels(12, 4, (_, y) =>
      y < 2 ? [29, 63, 87, 255] : [238, 228, 202, 255],
    ));

    expect(edge?.colors).toEqual(['#1d3f57', '#1d3f57', '#eee4ca', '#eee4ca']);
    expect(edge?.background).toContain('linear-gradient');
    expect(edge?.background).toContain('#1d3f57 0.00%');
    expect(edge?.background).toContain('#eee4ca 100.00%');
    expect(edge?.foreground).toBe('#24211d');
  });

  it('ignores transparent pixels while retaining genuinely light backgrounds', () => {
    const edge = getCoverEdgeAppearance(pixels(12, 4, (x) =>
      x < 8 ? [0, 0, 0, 0] : [238, 228, 202, 255],
    ));

    expect(edge?.color).toBe('#eee4ca');
    expect(edge?.foreground).toBe('#24211d');
    expect(getCoverEdgeAppearance(pixels(12, 4, () => [0, 0, 0, 0]))).toBeNull();
  });
});

describe('sampling the visible cover', () => {
  it('samples the cropped left edge rather than the hidden left margin', () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      getImageData: () => pixels(12, 64, () => [29, 63, 87, 255]),
    } as unknown as CanvasRenderingContext2D);
    const image = document.createElement('canvas');
    image.width = 1000;
    image.height = 500;

    const edge = sampleCoverEdge(image, 0.75);
    const [, sourceX, sourceY, sourceWidth, sourceHeight] = drawImage.mock.calls[0];

    expect(sourceX).toBeCloseTo(313.5);
    expect(sourceY).toBe(0);
    expect(sourceWidth).toBeCloseTo(15);
    expect(sourceHeight).toBe(500);
    expect(edge?.color).toBe('#1d3f57');
  });

  it('falls back safely if the browser disallows reading image pixels', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => { throw new DOMException('Blocked', 'SecurityError'); },
    } as unknown as CanvasRenderingContext2D);
    const image = document.createElement('canvas');
    image.width = 200;
    image.height = 300;

    expect(sampleCoverEdge(image)).toBeNull();
  });
});
