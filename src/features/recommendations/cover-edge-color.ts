import { BOOK_COVER_ASPECT, getCoverTextureTransform } from './cover-artwork';

type RGB = [number, number, number];

export type CoverEdgeAppearance = {
  color: string;
  foreground: string;
  colors: string[];
  background: string;
};

const toHex = (rgb: RGB) =>
  `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const relativeLuminance = (hex: string) => {
  const channels = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

export const getCoverEdgeTextColor = (color: string) => {
  const luminance = relativeLuminance(color);
  const darkContrast = (luminance + 0.05) / (relativeLuminance('#24211d') + 0.05);
  const lightContrast = (relativeLuminance('#fffaf0') + 0.05) / (luminance + 0.05);
  return darkContrast >= lightContrast ? '#24211d' : '#fffaf0';
};

// Quantize nearby shades so a small letter or a highlight does not outweigh
// the cover background. Average the winning group without changing its hue.
const dominantRowColor = (pixels: Uint8ClampedArray): RGB | null => {
  const buckets = new Map<number, { count: number; rgb: RGB }>();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const rgb: RGB = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const key = ((rgb[0] >> 4) << 8) | ((rgb[1] >> 4) << 4) | (rgb[2] >> 4);
    const bucket = buckets.get(key) ?? { count: 0, rgb: [0, 0, 0] as RGB };
    bucket.count += 1;
    for (let channel = 0; channel < 3; channel++) bucket.rgb[channel] += rgb[channel];
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
  return dominant ? dominant.rgb.map((value) => value / dominant.count) as RGB : null;
};

export const getCoverEdgeAppearance = ({
  data,
  width,
  height,
}: Pick<ImageData, 'data' | 'width' | 'height'>): CoverEdgeAppearance | null => {
  const rows = Array.from({ length: height }, (_, index) =>
    dominantRowColor(data.subarray(index * width * 4, (index + 1) * width * 4)),
  );
  const opaqueRows = rows.filter((row): row is RGB => row !== null);
  if (opaqueRows.length === 0) return null;

  const middle: RGB = [0, 1, 2].map((channel) =>
    median(opaqueRows.map((row) => row[channel])),
  ) as RGB;
  const color = toHex(middle);
  const colors = rows.map((row) => toHex(row ?? middle));
  return {
    color,
    foreground: getCoverEdgeTextColor(color),
    colors,
    background: colors.every((stop) => stop === colors[0])
      ? color
      : `linear-gradient(180deg, ${colors.map((stop, index) =>
          `${stop} ${(index / Math.max(1, colors.length - 1) * 100).toFixed(2)}%`,
        ).join(', ')})`,
  };
};

export const sampleCoverEdge = (
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  targetAspect = BOOK_COVER_ASPECT,
): CoverEdgeAppearance | null => {
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height;
  const crop = getCoverTextureTransform(width, height, targetAspect);
  if (!crop) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    const visibleWidth = width * crop.repeat[0];
    const visibleHeight = height * crop.repeat[1];
    // Sample the visible left edge, including object-fit/texture cropping.
    context.drawImage(
      image,
      width * crop.offset[0] + Math.min(1, visibleWidth * 0.005),
      height * crop.offset[1],
      Math.max(1, visibleWidth * 0.04),
      visibleHeight,
      0, 0, canvas.width, canvas.height,
    );
    return getCoverEdgeAppearance(context.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    // A failed read (for example, a cross-origin image) must not hide a cover.
    return null;
  }
};
