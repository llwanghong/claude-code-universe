import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'
import remarkMermaid from './src/plugins/remark-mermaid.mjs'

export default defineConfig({
  base: '/claude-code-universe/',
  site: 'https://llwanghong.github.io',
  integrations: [tailwind()],
  markdown: {
    remarkPlugins: [remarkMermaid],
  },
})
