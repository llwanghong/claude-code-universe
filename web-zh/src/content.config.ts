import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const chapters = defineCollection({
  loader: glob({ pattern: 'ch*.md', base: '../book-zh' }),
});

const deepdive = defineCollection({
  loader: glob({ pattern: '0*.md', base: '../deep-dive' }),
});

const supplements = defineCollection({
  loader: glob({ pattern: 'S*.md', base: '../supplements' }),
});

export const collections = { chapters, deepdive, supplements };
