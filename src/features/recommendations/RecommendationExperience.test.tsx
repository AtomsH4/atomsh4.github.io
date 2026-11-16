import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecommendationCover } from './RecommendationCover';
import { RecommendationExperience } from './RecommendationExperience';
import type { RecommendationItem } from './recommendation-types';

vi.mock('./RecommendationStage', () => ({
  RecommendationStage: ({
    activeId,
    compact,
    reducedMotion,
  }: {
    activeId: string;
    compact: boolean;
    reducedMotion: boolean;
  }) => (
    <div
      data-testid="recommendation-stage"
      data-active-id={activeId}
      data-compact={String(compact)}
      data-reduced-motion={String(reducedMotion)}
    />
  ),
}));

const webGLState = vi.hoisted(() => ({ status: 'available' }));

vi.mock('./useWebGLAvailability', () => ({
  useWebGLAvailability: () => ({
    status: webGLState.status,
    markFailed: vi.fn(),
  }),
}));

const mockWebGLStatus = (
  status: 'checking' | 'available' | 'unavailable' | 'failed',
) => {
  webGLState.status = status;
};

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

beforeEach(() => {
  webGLState.status = 'available';
  window.history.replaceState(null, '', '/');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecommendationExperience', () => {
  it('keeps content in the poster while loading its stage independently', async () => {
    render(<RecommendationExperience items={items} mode="catalog" />);

    const experience = screen.getByLabelText('推荐浏览');
    const poster = screen.getByTestId('recommendation-poster');
    const diffusion = screen.getByTestId('recommendation-diffusion-backdrop');

    expect(poster).toContainElement(await screen.findByTestId('recommendation-stage'));
    expect(diffusion.parentElement).toBe(experience);
    expect(poster).not.toContainElement(diffusion);
    expect(
      screen.getByRole('heading', { name: 'Music title', level: 2 }),
    ).toBeVisible();
    expect(screen.getByText('Artist')).toBeVisible();
    expect(screen.getByText('2026')).toBeVisible();
    expect(screen.getByLabelText('推荐浏览')).toHaveAttribute(
      'data-mode',
      'catalog',
    );
    expect(screen.queryByText('01 / 01')).not.toBeInTheDocument();
    expect(screen.queryByText(/拖动画布|拖动作品/)).not.toBeInTheDocument();
  });

  it('defaults the catalog to music without an all filter', () => {
    render(<RecommendationExperience items={items} mode="catalog" />);

    expect(
      screen.queryByRole('button', { name: '全部' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '音乐' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Music title' })).toBeVisible();
  });

  it('filters categories and keeps one explicit active item', async () => {
    const user = userEvent.setup();
    render(<RecommendationExperience items={items} mode="catalog" />);

    await user.click(screen.getByRole('button', { name: '书籍' }));

    expect(screen.getByRole('heading', { name: 'Book title' })).toBeVisible();
    expect(screen.queryByText('Music title')).not.toBeInTheDocument();
    expect(screen.getByTestId('recommendation-stage')).toHaveAttribute(
      'data-active-id',
      'book-item',
    );
  });

  it('publishes the active category for the shared diffused theme', async () => {
    const user = userEvent.setup();
    render(<RecommendationExperience items={items} mode="catalog" />);

    expect(screen.getByTestId('recommendation-poster')).toHaveAttribute(
      'data-category',
      'music',
    );

    await user.click(screen.getByRole('button', { name: '书籍' }));

    expect(screen.getByTestId('recommendation-poster')).toHaveAttribute(
      'data-category',
      'book',
    );
    expect(
      screen.getByTestId('recommendation-diffusion-backdrop'),
    ).toBeInTheDocument();
  });

  it('wraps next and previous navigation and updates the hash without scrolling', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const secondMusic: RecommendationItem = {
      ...items[0],
      id: 'second-music',
      title: 'Second music title',
    };
    render(
      <RecommendationExperience
        items={[items[0], secondMusic, ...items.slice(1)]}
        mode="catalog"
      />,
    );

    await user.click(screen.getByRole('button', { name: '上一项' }));

    expect(
      screen.getByRole('heading', { name: 'Second music title' }),
    ).toBeVisible();
    await waitFor(() => expect(window.location.hash).toBe('#second-music'));

    await user.click(screen.getByRole('button', { name: '下一项' }));

    expect(screen.getByRole('heading', { name: 'Music title' })).toBeVisible();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('uses a valid location hash as the initial selection', async () => {
    window.history.replaceState(null, '', '/#book-item');

    render(<RecommendationExperience items={items} mode="catalog" />);

    expect(
      await screen.findByRole('heading', { name: 'Book title' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '书籍' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('renders the two-dimensional fallback when WebGL is unavailable', () => {
    mockWebGLStatus('unavailable');

    render(<RecommendationExperience items={items} mode="catalog" />);

    expect(screen.getByText('当前设备使用 CSS 立体视图。')).toBeVisible();
    expect(
      screen.queryByTestId('recommendation-stage'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '旋转 Music title' }),
    ).toBeVisible();
  });

  it('keeps featured mode narrow', () => {
    render(
      <RecommendationExperience
        items={items}
        mode="featured"
        allHref="/Atoms-H.github.io/recommendations/"
      />,
    );

    expect(
      screen.queryByRole('button', { name: '全部' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '上一项' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看全部推荐' })).toHaveAttribute(
      'href',
      '/Atoms-H.github.io/recommendations/',
    );
    expect(screen.getByTestId('recommendation-stage')).toHaveAttribute(
      'data-compact',
      'true',
    );
    expect(screen.getByLabelText('推荐浏览')).toHaveAttribute(
      'data-mode',
      'featured',
    );
  });

  it('shows a stable empty state without mounting the stage or navigation', () => {
    render(<RecommendationExperience items={[]} mode="catalog" />);

    expect(screen.getByText('推荐正在整理中。')).toBeVisible();
    expect(
      screen.queryByTestId('recommendation-stage'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not hijack arrow keys from ordinary links', async () => {
    render(<RecommendationExperience items={items} mode="catalog" />);
    const link = screen.getByRole('link', {
      name: '查看 Music title 的外部详情',
    });

    link.focus();
    const wasNotCancelled = fireEvent.keyDown(link, { key: 'ArrowRight' });

    expect(wasNotCancelled).toBe(true);
    expect(screen.getByRole('heading', { name: 'Music title' })).toBeVisible();
  });

  it('passes the reduced-motion preference through to the stage', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<RecommendationExperience items={items} mode="catalog" />);

    await waitFor(() =>
      expect(screen.getByTestId('recommendation-stage')).toHaveAttribute(
        'data-reduced-motion',
        'true',
      ),
    );
  });
});

describe('RecommendationCover', () => {
  it('falls back to generated typography when a licensed image fails', () => {
    const licensedItem: RecommendationItem = {
      ...items[0],
      id: 'licensed-item',
      title: 'Licensed title',
      cover: {
        kind: 'licensed',
        src: '/cover.svg',
        sourceUrl: 'https://example.com/source',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        credit: 'Cover artist',
      },
    };

    render(<RecommendationCover item={licensedItem} />);
    const image = screen.getByRole('img', { name: 'Licensed title 封面' });

    fireEvent.error(image);

    expect(
      screen.queryByRole('img', { name: 'Licensed title 封面' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Licensed title')).toBeVisible();
    expect(screen.getByText('Artist')).toBeVisible();
    expect(screen.getByText('2026')).toBeVisible();
  });

  it('renders a remote image and falls back to generated artwork on failure', () => {
    const remoteItem: RecommendationItem = {
      ...items[0],
      id: 'remote-item',
      title: 'Remote title',
      cover: {
        kind: 'remote',
        src: 'https://covers.openlibrary.org/b/id/314604-L.jpg?default=false',
        sourceUrl: 'https://openlibrary.org/works/OL505740W',
        provider: 'open-library',
        credit: 'Open Library cover repository',
      },
    };

    render(<RecommendationCover item={remoteItem} />);
    const image = screen.getByRole('img', { name: 'Remote title 封面' });
    expect(image).toHaveAttribute(
      'src',
      remoteItem.cover.kind === 'remote' ? remoteItem.cover.src : '',
    );

    fireEvent.error(image);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByText('Remote title').closest('[data-cover-kind]'),
    ).toHaveAttribute('data-cover-kind', 'generated');
    expect(screen.getByText('Artist')).toBeVisible();
    expect(screen.getByText('2026')).toBeVisible();
  });
});
