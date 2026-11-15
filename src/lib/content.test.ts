import { describe, expect, it } from 'vitest';

import { getPublishedEntries, getPublishedProjects } from './content';

describe('getPublishedEntries', () => {
  it('filters drafts and sorts published entries by descending publication date', () => {
    const entries = [
      {
        id: 'older',
        data: { draft: false, pubDate: new Date('2026-01-02') },
      },
      {
        id: 'draft',
        data: { draft: true, pubDate: new Date('2026-08-30') },
      },
      {
        id: 'newer',
        data: { draft: false, pubDate: new Date('2026-08-01') },
      },
    ];

    expect(getPublishedEntries(entries).map((entry) => entry.id)).toEqual([
      'newer',
      'older',
    ]);
  });
});

describe('getPublishedProjects', () => {
  it('pins explicitly ordered projects ahead of newer entries without publishing drafts or mutating input', () => {
    const entries = [
      { id: 'newest', data: { draft: false, pubDate: new Date('2026-11-15') } },
      { id: 'gateway', data: { draft: false, pubDate: new Date('2026-11-09'), order: 1 } },
      { id: 'draft', data: { draft: true, pubDate: new Date('2026-11-15'), order: 0 } },
      { id: 'cherry', data: { draft: false, pubDate: new Date('2026-08-31'), order: 0 } },
    ];
    const originalOrder = entries.map((entry) => entry.id);

    expect(getPublishedProjects(entries).map((entry) => entry.id)).toEqual([
      'cherry', 'gateway', 'newest',
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(originalOrder);
  });

  it('keeps publication-date ordering for equal and unspecified priorities', () => {
    const entries = [
      { id: 'older', data: { draft: false, pubDate: new Date('2026-08-31') } },
      { id: 'ordered-older', data: { draft: false, pubDate: new Date('2026-08-31'), order: 1 } },
      { id: 'newer', data: { draft: false, pubDate: new Date('2026-11-15') } },
      { id: 'ordered-newer', data: { draft: false, pubDate: new Date('2026-11-09'), order: 1 } },
    ];

    expect(getPublishedProjects(entries).map((entry) => entry.id)).toEqual([
      'ordered-newer', 'ordered-older', 'newer', 'older',
    ]);
  });
});
