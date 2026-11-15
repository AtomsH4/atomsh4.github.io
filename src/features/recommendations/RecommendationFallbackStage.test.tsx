import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecommendationFallbackStage } from './RecommendationFallbackStage';
import type { RecommendationItem } from './recommendation-types';

const items: RecommendationItem[] = [
  {
    id: 'music-item',
    title: 'Music title',
    category: 'music',
    presentation: 'disc',
    creator: 'Artist',
    year: 2026,
    externalUrl: 'https://example.com/music',
    cover: { kind: 'generated', credit: 'AtomsH4' },
  },
  {
    id: 'book-item',
    title: 'Book title',
    category: 'book',
    presentation: 'book',
    creator: 'Author',
    year: 2025,
    externalUrl: 'https://example.com/book',
    cover: { kind: 'generated', credit: 'AtomsH4' },
  },
  {
    id: 'screen-item',
    title: 'Screen title',
    category: 'screen',
    presentation: 'disc',
    creator: 'Director',
    year: 2024,
    externalUrl: 'https://example.com/screen',
    cover: { kind: 'generated', credit: 'AtomsH4' },
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecommendationFallbackStage', () => {
  it('resamples the spine when the same book receives a new cover URL', () => {
    let rgb = [29, 63, 87];
    let complete = true;
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockImplementation(() => complete);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({
        width: 12,
        height: 64,
        data: new Uint8ClampedArray(Array.from({ length: 12 * 64 }, () => [...rgb, 255]).flat()),
      }),
    } as unknown as CanvasRenderingContext2D);
    const book: RecommendationItem = {
      ...items[1],
      cover: {
        kind: 'remote',
        src: 'https://example.com/blue.jpg',
        sourceUrl: 'https://example.com/book',
        provider: 'open-library',
        credit: 'Book cover',
      },
    };
    const props = { activeId: book.id, compact: false, reducedMotion: false, onSelect: vi.fn() };
    const { rerender } = render(<RecommendationFallbackStage {...props} items={[book]} />);
    // A cached image may finish loading before React attaches onLoad.
    const object = screen.getByRole('button', { name: '旋转 Book title' });
    expect(object.style.getPropertyValue('--object-ink')).toBe('#1d3f57');

    complete = false;
    rerender(<RecommendationFallbackStage {...props} items={[{
      ...book,
      cover: { ...book.cover, kind: 'remote', src: 'https://example.com/cream.jpg' } as RecommendationItem['cover'],
    }]} />);
    expect(object.style.getPropertyValue('--object-ink')).not.toBe('#1d3f57');

    rgb = [238, 228, 202];
    complete = true;
    fireEvent.load(screen.getByRole('img', { name: 'Book title 封面' }));
    expect(object.style.getPropertyValue('--object-ink')).toBe('#eee4ca');
    expect(object.style.getPropertyValue('--object-text')).toBe('#24211d');
  });

  it('renders one active physical presentation and its neighbor', () => {
    render(
      <RecommendationFallbackStage
        items={items}
        activeId="music-item"
        compact={false}
        reducedMotion={false}
        onSelect={vi.fn()}
      />,
    );

    const active = screen.getByRole('button', { name: '旋转 Music title' });
    expect(active).toHaveAttribute('aria-current', 'true');
    expect(active).toHaveAttribute('data-presentation', 'disc');
    expect(
      screen.getAllByRole('button').filter(
        (button) => button.getAttribute('aria-current') === 'true',
      ),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: '选择 Book title' })).toHaveAttribute(
      'data-presentation',
      'book',
    );
  });

  it('updates rotation while dragging and resets it on release', () => {
    render(
      <RecommendationFallbackStage
        items={items}
        activeId="music-item"
        compact={false}
        reducedMotion={false}
        onSelect={vi.fn()}
      />,
    );

    const active = screen.getByRole('button', { name: '旋转 Music title' });
    expect(active).toHaveStyle({ '--rx': '0deg', '--ry': '0deg' });

    fireEvent.pointerDown(active, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(active, { pointerId: 1, clientX: 180, clientY: 50 });

    expect(active).not.toHaveStyle({ '--rx': '0deg', '--ry': '0deg' });
    expect(active).toHaveAttribute('data-dragging', 'true');

    fireEvent.pointerUp(active, { pointerId: 1 });

    expect(active).toHaveStyle({ '--rx': '0deg', '--ry': '0deg' });
    expect(active).toHaveAttribute('data-dragging', 'false');
  });

  it('pans from the stage background and selects the snapped item', () => {
    const onSelect = vi.fn();
    render(
      <RecommendationFallbackStage
        items={items}
        activeId="music-item"
        compact={false}
        reducedMotion
        onSelect={onSelect}
      />,
    );

    const stage = screen.getByTestId('recommendation-fallback-stage');
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 600,
      top: 0,
      width: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 260,
      clientY: 200,
      timeStamp: 0,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 40,
      clientY: 204,
      timeStamp: 300,
    });

    expect(stage).toHaveAttribute('data-panning', 'true');

    fireEvent.pointerUp(stage, { pointerId: 1, timeStamp: 320 });

    expect(onSelect).toHaveBeenCalledWith('book-item');
  });

  it('rotates a neighboring object without panning or selecting it', () => {
    const onSelect = vi.fn();
    render(
      <RecommendationFallbackStage
        items={items}
        activeId="music-item"
        compact={false}
        reducedMotion={false}
        onSelect={onSelect}
      />,
    );

    const stage = screen.getByTestId('recommendation-fallback-stage');
    const neighbor = screen.getByRole('button', {
      name: '选择 Book title',
    });

    fireEvent.pointerDown(neighbor, {
      pointerId: 2,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(neighbor, {
      pointerId: 2,
      clientX: 170,
      clientY: 120,
    });

    expect(neighbor).toHaveAttribute('data-dragging', 'true');
    expect(stage).toHaveAttribute('data-panning', 'false');

    fireEvent.pointerUp(neighbor, { pointerId: 2 });
    fireEvent.click(neighbor);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('lets a neighboring object become active', () => {
    const onSelect = vi.fn();
    render(
      <RecommendationFallbackStage
        items={items}
        activeId="music-item"
        compact
        reducedMotion={false}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择 Book title' }));

    expect(onSelect).toHaveBeenCalledWith('book-item');
  });
});
