import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeArtwork } from './NodeArtwork';

afterEach(cleanup);
describe('node artwork resilience', () => {
  it('uses an explicitly supplied real image fallback with the base path', () => {
    render(<NodeArtwork basePath="/test/" image={{ src: 'https://example.com/cover.jpg', alt: '封面', fallback: '/media/about-graph/eva.jpg' }} />);
    const image = screen.getByAltText('封面');
    expect(image).toHaveStyle({ opacity: '0' });
    expect(image.parentElement?.style.backgroundImage).toContain('/test/media/about-graph/eva.jpg');
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', '/test/media/about-graph/eva.jpg');
    expect(image).toHaveStyle({ opacity: '1' });
  });
  it('hides an unavailable cover without drawing a placeholder and retries a new source', () => {
    const { rerender } = render(<NodeArtwork basePath="/" image={{ src: 'https://example.com/a.jpg', alt: 'A' }} />);
    fireEvent.error(screen.getByAltText('A'));
    expect(screen.queryByAltText('A')).not.toBeInTheDocument();
    rerender(<NodeArtwork basePath="/" image={{ src: 'https://example.com/b.jpg', alt: 'B' }} />);
    expect(screen.getByAltText('B')).toHaveAttribute('src', 'https://example.com/b.jpg');
    fireEvent.load(screen.getByAltText('B'));
    expect(screen.getByAltText('B')).toHaveStyle({ opacity: '1' });
  });
});
