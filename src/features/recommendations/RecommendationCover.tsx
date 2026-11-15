import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { getGeneratedCoverPalette } from './cover-artwork';
import type { RecommendationItem } from './recommendation-types';
import styles from './RecommendationExperience.module.css';

export type RecommendationCoverProps = {
  item: RecommendationItem;
  onImageLoad?: (image: HTMLImageElement) => void;
  onImageError?: () => void;
};

const GeneratedCover = ({ item }: RecommendationCoverProps) => {
  const palette = getGeneratedCoverPalette(item.id);
  const style = {
    '--cover-background': palette.background,
    '--cover-accent': palette.accent,
    '--cover-foreground': palette.foreground,
  } as CSSProperties;

  return (
    <span
      className={styles.generatedCover}
      data-cover-kind="generated"
      style={style}
    >
      <span className={styles.generatedTitle}>{item.title}</span>
      <span className={styles.generatedCreator}>{item.creator}</span>
      <span className={styles.generatedYear}>{item.year}</span>
    </span>
  );
};

export const RecommendationCover = ({
  item,
  onImageLoad,
  onImageError,
}: RecommendationCoverProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageSource = item.cover.kind === 'generated' ? null : item.cover.src;

  useEffect(() => {
    setImageFailed(false);
  }, [item.id, imageSource]);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) onImageLoad?.(image);
  }, [imageFailed, imageSource, onImageLoad]);

  if (!imageSource || imageFailed) {
    return <GeneratedCover item={item} />;
  }

  return (
    <img
      ref={imageRef}
      className={styles.licensedCover}
      src={imageSource}
      style={{ backgroundColor: getGeneratedCoverPalette(item.id).background }}
      alt={`${item.title} 封面`}
      crossOrigin={onImageLoad ? 'anonymous' : undefined}
      draggable={false}
      onLoad={(event) => onImageLoad?.(event.currentTarget)}
      onError={() => {
        setImageFailed(true);
        onImageError?.();
      }}
    />
  );
};
