// @ts-check
import { defineConfig } from 'astro/config';
import { markdown } from './config/markdown.mjs';
import { integrations } from './config/integrations.mjs';
import { loadSiteConfig } from './config/site.mjs';

const { url: siteUrl } = loadSiteConfig();

// https://astro.build/config
export default defineConfig({
    ...(siteUrl ? { site: siteUrl } : {}),
    markdown,
    integrations,
    vite: {
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
