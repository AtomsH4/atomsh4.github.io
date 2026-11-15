import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

import {
  presentationValues,
  recommendationCategoryValues,
  remoteCoverProviderValues,
} from './features/recommendations/recommendation-types';

const entrySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  pubDate: z.coerce.date(),
  tags: z.array(z.string().min(1)).default([]),
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
}).strict();

const httpsUrl = z.string().url().refine((url) => url.startsWith('https://'), {
  message: 'URL must use HTTPS',
});

const recommendationCoverSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('generated'),
    credit: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('licensed'),
    src: z.string().regex(
      /^\/media\/recommendations\/[a-z0-9-]+\.(webp|svg)$/,
    ),
    sourceUrl: httpsUrl,
    license: z.string().min(1),
    licenseUrl: httpsUrl,
    credit: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('remote'),
    src: httpsUrl,
    sourceUrl: httpsUrl,
    provider: z.enum(remoteCoverProviderValues),
    credit: z.string().min(1),
  }).strict(),
]);

const recommendationSchema = z.object({
  title: z.string().min(1),
  category: z.enum(recommendationCategoryValues),
  presentation: z.enum(presentationValues).optional(),
  creator: z.string().min(1),
  year: z.number().int().min(1800).max(2100),
  recommendDate: z.coerce.date(),
  externalUrl: httpsUrl,
  featured: z.boolean().default(false),
  draft: z.boolean().default(false),
  cover: recommendationCoverSchema,
}).strict();

const collections = {
  blog: defineCollection({
    loader: glob({ pattern: '**/*.(md|mdx)', base: './src/data/blog' }),
    schema: entrySchema,
  }),
  notes: defineCollection({
    loader: glob({ pattern: '**/*.(md|mdx)', base: './src/data/notes' }),
    schema: entrySchema,
  }),
  projects: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/data/projects' }),
    schema: entrySchema.extend({
      repository: z.string().url(),
      kind: z.enum(['own', 'fork', 'member']),
      order: z.number().int().nonnegative().optional(),
    }),
  }),
  recommendations: defineCollection({
    loader: glob({
      pattern: '**/*.md',
      base: './src/data/recommendations',
    }),
    schema: recommendationSchema,
  }),
};

export { collections };
