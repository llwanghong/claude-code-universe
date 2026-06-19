import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import remarkMermaid from './src/plugins/remark-mermaid.mjs'

export default defineConfig({
  base: '/claude-code-universe/',
  site: 'https://llwanghong.github.io',
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkMermaid],
  },
})
