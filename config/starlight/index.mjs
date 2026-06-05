// @ts-check
import starlight from '@astrojs/starlight';
import { loadSiteConfig } from '../site.mjs';

const site = loadSiteConfig();

/** Starlight integration — identity and navigation loaded from the vault (site.config.json). */
export const starlightIntegration = starlight({
    title: site.title,
    customCss: [
        './src/styles/mermaid.css',
        'katex/dist/katex.min.css',
        './src/styles/katex-starlight.css',
        './src/styles/footnotes-starlight.css',
        './src/styles/external-links-starlight.css',
        './src/styles/backlinks-starlight.css',
    ],
    components: {
        Head: './src/components/Head.astro',
        Footer: './src/components/Footer.astro',
        PageSidebar: './src/components/PageSidebar.astro',
    },
    defaultLocale: site.defaultLocale,
    locales: site.locales,
    social: site.social,
    sidebar: site.sidebar,
});
