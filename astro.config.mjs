import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { blogTables } from './src/lib/blog-tables';

import { noteRedirects } from './config/note-redirects.mjs';

export default defineConfig({
  site: 'https://atomsh4.github.io',
  base: '/',
  markdown: {
    processor: satteri({ hastPlugins: [blogTables] }),
  },
  redirects: noteRedirects,
  integrations: [
    mdx(),
    react(),
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;
        const directoryPath = pathname.endsWith('/') ? pathname : `${pathname}/`;
        return pathname !== '/404.html'
          && directoryPath !== '/404/'
          && !directoryPath.startsWith('/Atoms-H.github.io/')
          && !Object.hasOwn(noteRedirects, directoryPath);
      },
    }),
  ],
});
