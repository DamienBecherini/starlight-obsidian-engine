// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import mermaid from 'astro-mermaid';
import { starlightIntegration } from './starlight/index.mjs';
import { vaultPublicIntegration } from './vault-public.mjs';
import { loadSiteConfig } from './site.mjs';
import { seoSitemapIntegration, sitemapOptions } from './seo-indexing.mjs';

/**
 * React renderer. The engine ships no React component (vault pages are Markdown/MDX rendered by
 * Starlight), so the React Compiler (Oxc, @astrojs/react 7) would bring no benefit and would need
 * the optional `oxc-transform-react` peer. Keep it explicitly off so a future default change
 * cannot alter the build silently.
 */
const reactIntegration = react({ compiler: false });

const site = loadSiteConfig();

/**
 * Sitemap declared here rather than added by Starlight (which skips its own when one exists), with the same i18n
 * options, so that `seoSitemapIntegration` runs after it: noindex pages removed, `<lastmod>` added.
 */
const sitemapIntegrations = site.url ? [sitemap(sitemapOptions(site.locales, site.defaultLocale)), seoSitemapIntegration()] : [];

/** All Astro integrations for the project. */
export const integrations = [
    mermaid({ autoTheme: true }),
    starlightIntegration,
    reactIntegration,
    vaultPublicIntegration(),
    ...sitemapIntegrations,
];
