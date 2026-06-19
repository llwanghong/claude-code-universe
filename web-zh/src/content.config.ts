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

const tutorial = defineCollection({
  loader: glob({ pattern: 's*.md', base: '../upstream/learn-claude-code/docs/zh' }),
});

const philosophy = defineCollection({
  loader: glob({ pattern: 'README-zh.md', base: '../upstream/learn-claude-code' }),
});

const skills = defineCollection({
  loader: glob({ pattern: '**/SKILL.md', base: '../upstream/learn-claude-code/skills' }),
});

export const collections = { chapters, deepdive, supplements, tutorial, philosophy, skills };
