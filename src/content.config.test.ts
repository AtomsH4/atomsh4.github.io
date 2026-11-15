// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { collections } from './content.config';

const projectSchema = collections.projects.schema as {
  safeParse: (input: unknown) => { success: boolean };
};
const recommendationSchema = collections.recommendations.schema as {
  safeParse: (input: unknown) => { success: boolean };
};

const validRecommendation = {
  title: 'Kind of Blue',
  category: 'music',
  creator: 'Miles Davis',
  year: 1959,
  recommendDate: '2026-09-18',
  externalUrl: 'https://en.wikipedia.org/wiki/Kind_of_Blue',
  cover: {
    kind: 'generated',
    credit: 'Original artwork generated for this site',
  },
};

describe('projects content schema', () => {
  it.each(['own', 'fork', 'member'])('accepts the %s project role', (kind) => {
    expect(projectSchema.safeParse({
      title: 'Project',
      summary: 'A project summary',
      pubDate: '2026-08-31',
      repository: 'https://github.com/CherryHQ/cherry-studio',
      kind,
      order: 0,
    }).success).toBe(true);
  });

  it('rejects unknown project roles', () => {
    expect(projectSchema.safeParse({
      title: 'Project',
      summary: 'A project summary',
      pubDate: '2026-08-31',
      repository: 'https://github.com/CherryHQ/cherry-studio',
      kind: 'unknown',
    }).success).toBe(false);
  });

  it('rejects unknown frontmatter fields', () => {
    const result = projectSchema.safeParse({
      title: 'Project',
      summary: 'A project summary',
      pubDate: '2026-08-31',
      tags: [],
      featured: false,
      repository: 'https://github.com/AtomsH4/example',
      kind: 'own',
      drafft: true,
    });

    expect(result.success).toBe(false);
  });
});

describe('recommendations content schema', () => {
  it('stores no recommendation summaries or local third-party cover paths', () => {
    const directory = join(process.cwd(), 'src/data/recommendations');
    const sources = readdirSync(directory)
      .filter((name) => name.endsWith('.md'))
      .map((name) => readFileSync(join(directory, name), 'utf8'));

    expect(sources).toHaveLength(11);
    expect(sources.every((source) => !/^summary:/m.test(source))).toBe(true);
    expect(
      sources.every(
        (source) => !/src:\s*\/media\/recommendations\//m.test(source),
      ),
    ).toBe(true);
  });

  it('uses the Standard Ebooks cover for The Moon and Sixpence', () => {
    const directory = join(process.cwd(), 'src/data/recommendations');
    const source = readFileSync(
      join(directory, 'the-moon-and-sixpence.md'),
      'utf8',
    );

    expect(source).toContain(
      'raw.githubusercontent.com/standardebooks/w-somerset-maugham_the-moon-and-sixpence/master/images/cover.jpg',
    );
    expect(source).toContain('provider: standard-ebooks');
    expect(source).toContain('credit: "Standard Ebooks contributors"');
  });

  it('accepts a generated cover and applies boolean defaults', () => {
    const result = recommendationSchema.safeParse(validRecommendation);

    expect(result).toMatchObject({
      success: true,
      data: {
        featured: false,
        draft: false,
        cover: { kind: 'generated' },
      },
    });
  });

  it('rejects a licensed cover without licenseUrl', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      cover: {
        kind: 'licensed',
        src: '/media/recommendations/kind-of-blue.webp',
        sourceUrl: 'https://example.com/kind-of-blue',
        license: 'CC BY 4.0',
        credit: 'Example Records',
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts a strict HTTPS remote cover', () => {
    expect(recommendationSchema.safeParse({
      ...validRecommendation,
      cover: {
        kind: 'remote',
        src: 'https://covers.openlibrary.org/b/id/314604-L.jpg?default=false',
        sourceUrl: 'https://openlibrary.org/works/OL505740W',
        provider: 'open-library',
        credit: 'Open Library cover repository',
      },
    }).success).toBe(true);

    expect(recommendationSchema.safeParse({
      ...validRecommendation,
      cover: {
        kind: 'remote',
        src: 'https://raw.githubusercontent.com/standardebooks/w-somerset-maugham_the-moon-and-sixpence/master/images/cover.jpg',
        sourceUrl: 'https://github.com/standardebooks/w-somerset-maugham_the-moon-and-sixpence',
        provider: 'standard-ebooks',
        credit: 'Standard Ebooks contributors',
      },
    }).success).toBe(true);
  });

  it('rejects the removed summary field and insecure remote images', () => {
    expect(recommendationSchema.safeParse({
      ...validRecommendation,
      summary: 'Legacy recommendation copy',
    }).success).toBe(false);

    expect(recommendationSchema.safeParse({
      ...validRecommendation,
      cover: {
        kind: 'remote',
        src: 'http://example.com/cover.jpg',
        sourceUrl: 'https://example.com/item',
        provider: 'youtube',
        credit: 'Example',
      },
    }).success).toBe(false);
  });

  it.each([
    ['unknown category', { category: 'podcast' }],
    ['unknown presentation', { presentation: 'poster' }],
    ['an additional field', { unexpected: true }],
    ['an HTTP external URL', { externalUrl: 'http://example.com/item' }],
    [
      'an HTTP licensed source URL',
      {
        cover: {
          kind: 'licensed',
          src: '/media/recommendations/kind-of-blue.svg',
          sourceUrl: 'http://example.com/kind-of-blue',
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          credit: 'Example Records',
        },
      },
    ],
    [
      'an HTTP license URL',
      {
        cover: {
          kind: 'licensed',
          src: '/media/recommendations/kind-of-blue.svg',
          sourceUrl: 'https://example.com/kind-of-blue',
          license: 'CC BY 4.0',
          licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
          credit: 'Example Records',
        },
      },
    ],
  ])('rejects %s', (_label, override) => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      ...override,
    });

    expect(result.success).toBe(false);
  });
});
