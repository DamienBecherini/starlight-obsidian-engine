// @ts-check
import { defineConfig } from 'astro/config';
import { markdown } from './config/markdown.mjs';
import { integrations } from './config/integrations.mjs';

// https://astro.build/config
export default defineConfig({
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
