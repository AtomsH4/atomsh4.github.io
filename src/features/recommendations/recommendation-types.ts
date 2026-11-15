export const recommendationCategoryValues = ['music', 'book', 'screen'] as const;
export const presentationValues = ['disc', 'book'] as const;
export const remoteCoverProviderValues = [
  'cover-art-archive',
  'open-library',
  'standard-ebooks',
  'netflix',
  'youtube',
  'netease',
  'wikimedia',
  'goodreads',
  'tmdb',
] as const;

export type RecommendationCategory =
  (typeof recommendationCategoryValues)[number];
export type RecommendationPresentation = (typeof presentationValues)[number];
export type RemoteCoverProvider =
  (typeof remoteCoverProviderValues)[number];

export type RecommendationCover =
  | {
      kind: 'generated';
      credit: string;
    }
  | {
      kind: 'licensed';
      src: string;
      sourceUrl: string;
      license: string;
      licenseUrl: string;
      credit: string;
    }
  | {
      kind: 'remote';
      src: string;
      sourceUrl: string;
      provider: RemoteCoverProvider;
      credit: string;
    };

export type RecommendationItem = {
  id: string;
  title: string;
  category: RecommendationCategory;
  presentation?: RecommendationPresentation;
  creator: string;
  year: number;
  externalUrl: string;
  cover: RecommendationCover;
};

type RecommendationCategoryConfig = {
  label: string;
  creatorLabel: string;
  defaultPresentation: RecommendationPresentation;
};

export const recommendationCategoryConfig = {
  music: {
    label: '音乐',
    creatorLabel: '音乐人',
    defaultPresentation: 'disc',
  },
  book: {
    label: '书籍',
    creatorLabel: '作者',
    defaultPresentation: 'book',
  },
  screen: {
    label: '影视与动画',
    creatorLabel: '导演 / 主创',
    defaultPresentation: 'disc',
  },
} satisfies Record<RecommendationCategory, RecommendationCategoryConfig>;

export function resolvePresentation(
  category: RecommendationCategory,
  presentation?: RecommendationPresentation,
): RecommendationPresentation {
  return presentation ?? recommendationCategoryConfig[category].defaultPresentation;
}
