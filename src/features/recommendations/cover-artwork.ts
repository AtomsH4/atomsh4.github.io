const xmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => xmlEntities[character]);

const palettes = [
  { background: '#192a56', accent: '#fbc531', foreground: '#f5f6fa' },
  { background: '#6d214f', accent: '#ffda79', foreground: '#fff7e6' },
  { background: '#0b5345', accent: '#f4d03f', foreground: '#fdfefe' },
  { background: '#7b241c', accent: '#85c1e9', foreground: '#ffffff' },
  { background: '#17202a', accent: '#e67e22', foreground: '#f8f9f9' },
  { background: '#4a235a', accent: '#76d7c4', foreground: '#ffffff' },
] as const;

export const getGeneratedCoverPalette = (id: string) => {
  const hash = [...id].reduce(
    (value, character) =>
      ((value * 31) + character.charCodeAt(0)) >>> 0,
    0,
  );
  return palettes[hash % palettes.length];
};

export const createGeneratedCoverDataUrl = (
  input: {
    id: string;
    title: string;
    creator: string;
    year: number;
  },
  targetAspect = 1,
): string => {
  const title = escapeXml(input.title);
  const creator = escapeXml(input.creator);
  const palette = getGeneratedCoverPalette(input.id);
  const normalizedAspect =
    Number.isFinite(targetAspect) && targetAspect > 0 ? targetAspect : 1;
  const canvasWidth = 1024;
  const canvasHeight = Math.round(canvasWidth / normalizedAspect);
  const scaleY = canvasHeight / canvasWidth;
  const y = (position: number) => Math.round(position * scaleY);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <rect width="${canvasWidth}" height="${canvasHeight}" fill="${palette.background}" />
  <circle cx="846" cy="${y(182)}" r="248" fill="${palette.accent}" opacity="0.92" />
  <path d="M0 ${y(730)} L1024 ${y(470)} L1024 ${canvasHeight} L0 ${canvasHeight} Z" fill="${palette.accent}" opacity="0.28" />
  <g fill="${palette.foreground}" font-family="system-ui, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, sans-serif">
    <text x="96" y="${y(136)}" font-size="30" font-weight="600" letter-spacing="8">RECOMMENDED</text>
    <text x="96" y="${y(500)}" font-size="86" font-weight="750">${title}</text>
    <text x="96" y="${y(790)}" font-size="42" font-weight="500">${creator}</text>
    <text x="96" y="${y(884)}" font-size="34" font-weight="600" letter-spacing="5">${input.year}</text>
  </g>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const BOOK_COVER_ASPECT = 3.12 / 4.12;

export const getCoverTextureTransform = (
  width: number,
  height: number,
  targetAspect = 1,
): { repeat: [number, number]; offset: [number, number] } | null => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(targetAspect) ||
    width <= 0 ||
    height <= 0 ||
    targetAspect <= 0
  ) {
    return null;
  }

  const imageAspect = width / height;

  if (imageAspect > targetAspect) {
    const repeatX = targetAspect / imageAspect;
    return {
      repeat: [repeatX, 1],
      offset: [(1 - repeatX) / 2, 0],
    };
  }

  if (imageAspect < targetAspect) {
    const repeatY = imageAspect / targetAspect;
    return {
      repeat: [1, repeatY],
      offset: [0, (1 - repeatY) / 2],
    };
  }

  return { repeat: [1, 1], offset: [0, 0] };
};
