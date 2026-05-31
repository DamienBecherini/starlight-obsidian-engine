// @ts-check
import starlight from '@astrojs/starlight';
import { loadSiteConfig } from '../site.mjs';

const site = loadSiteConfig();

/** Starlight integration — identity and navigation loaded from the vault (site.config.json). */
export const starlightIntegration = starlight({
    title: site.title,
    customCss: ['./src/styles/mermaid.css'],
    components: {
        Head: './src/components/Head.astro',
    },
    defaultLocale: site.defaultLocale,
    locales: site.locales,
    social: site.social,
    sidebar: site.sidebar,
});
