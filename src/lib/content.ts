export type DatedEntry = {
  id: string;
  data: { draft: boolean; pubDate: Date };
};

export const getPublishedEntries = <T extends DatedEntry>(entries: T[]): T[] =>
  entries
    .filter((entry) => !entry.data.draft)
    .sort(
      (left, right) =>
        right.data.pubDate.getTime() - left.data.pubDate.getTime(),
    );

export type ProjectEntry = DatedEntry & { data: { order?: number } };

export const getPublishedProjects = <T extends ProjectEntry>(entries: T[]): T[] =>
  getPublishedEntries(entries).sort(
    (left, right) =>
      (left.data.order ?? Number.MAX_SAFE_INTEGER)
      - (right.data.order ?? Number.MAX_SAFE_INTEGER),
  );
