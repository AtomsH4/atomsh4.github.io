import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecommendationStageBoundary } from './RecommendationStageBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecommendationStageBoundary', () => {
  it('keeps the fallback interactive after a renderer failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onFailure = vi.fn();
    const onSelect = vi.fn();
    const FailedStage = () => {
      throw new Error('WebGL initialization failed');
    };

    render(
      <RecommendationStageBoundary
        onFailure={onFailure}
        fallback={<button onClick={onSelect}>选择作品</button>}
      >
        <FailedStage />
      </RecommendationStageBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择作品' }));
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
