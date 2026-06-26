import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import remarkMermaidRaw from './src/plugins/remark-mermaid-raw.mjs';
import remarkDiagramSlots from './src/plugins/remark-diagram-slots.mjs';

export default defineConfig({
  base: '/claude-code-universe/',
  site: 'https://llwanghong.github.io',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
    remarkPlugins: [remarkDiagramSlots, remarkMermaidRaw],
  },
  output: 'static',
});
