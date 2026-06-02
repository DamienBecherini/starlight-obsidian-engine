// @ts-check
import { defineConfig } from 'astro/config';
import { markdown } from './config/markdown.mjs';
import { integrations } from './config/integrations.mjs';
import { loadSiteConfig } from './config/site.mjs';
import { linkGraphWatchPlugin } from './config/vite/link-graph-watch.mjs';

const { url: siteUrl } = loadSiteConfig();

// Opt-in bundle analysis: `ANALYZE=true npm run build` writes dist/stats.html.
// Never loaded for normal builds, so it adds zero weight to the shipped site.
const analyze = process.env.ANALYZE === 'true';
const analyzePlugins = analyze
    ? [
          (await import('rollup-plugin-visualizer')).visualizer({
              filename: 'dist/stats.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
          }),
      ]
    : [];

// https://astro.build/config
export default defineConfig({
    ...(siteUrl ? { site: siteUrl } : {}),
    outDir: process.env.ASTRO_OUT_DIR?.trim() || 'dist',
    markdown,
    integrations,
    vite: {
        plugins: [linkGraphWatchPlugin(), ...analyzePlugins],
        resolve: {
            preserveSymlinks: true,
        },
        server: {
            fs: {
                allow: ['..'],
            },
        },
    },
});
