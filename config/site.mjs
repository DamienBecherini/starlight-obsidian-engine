// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { resolveVaultPath } from './vault.mjs';

/** @type {import('@astrojs/starlight/types').StarlightUserConfig['sidebar']} */
const defaultSidebar = [
    {
        label: 'Documentation',
        items: [{ autogenerate: { directory: '' } }],
    },
];

/** @type {import('@astrojs/starlight/types').StarlightUserConfig['locales']} */
const defaultLocales = {
    root: {
        label: 'English',
        lang: 'en',
    },
};

/**
 * @typedef {Object} EditorialHitl
 * @property {string} name Author display name.
 * @property {string} [url] Author profile URL (used as article:author).
 */

/**
 * @typedef {Object} Editorial
 * @property {EditorialHitl} [hitl]
 * @property {string} [defaultAgent]
 */

/**
 * @typedef {Object} SiteConfig
 * @property {string} title
 * @property {string} [url] Public canonical URL (Astro `site`, sitemap, absolute links).
 * @property {string} [ogImage] Absolute URL for the og:image meta tag. If omitted, no og:image tag is injected.
 * @property {Editorial} [editorial]
 * @property {string} [defaultLocale]
 * @property {import('@astrojs/starlight/types').StarlightUserConfig['locales']} [locales]
 * @property {import('@astrojs/starlight/types').StarlightUserConfig['sidebar']} [sidebar]
 * @property {import('@astrojs/starlight/types').StarlightUserConfig['social']} [social]
 */

/**
 * Loads site.config.json from the vault root.
 * @returns {Required<Pick<SiteConfig, 'title' | 'defaultLocale' | 'locales' | 'sidebar'>> & Pick<SiteConfig, 'url' | 'ogImage' | 'editorial' | 'social'>}
 */
export function loadSiteConfig() {
    const vaultPath = resolveVaultPath();
    const configPath = path.join(vaultPath, 'site.config.json');

    if (!fs.existsSync(configPath)) {
        console.log(
            `ℹ️ No site.config.json in the vault (${vaultPath}). Using default engine configuration.`,
        );
        return {
            title: 'Obsidian Vault Site',
            defaultLocale: 'root',
            locales: defaultLocales,
            sidebar: defaultSidebar,
            social: [],
        };
    }

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        /** @type {SiteConfig} */
        const parsed = JSON.parse(raw);
        console.log(`🎯 Site configuration loaded from ${configPath}`);
        return {
            title: parsed.title ?? 'Obsidian Vault Site',
            url: parsed.url?.replace(/\/+$/, '') || undefined,
            ogImage: parsed.ogImage || undefined,
            editorial: parsed.editorial || undefined,
            defaultLocale: parsed.defaultLocale ?? 'root',
            locales: parsed.locales ?? defaultLocales,
            sidebar: parsed.sidebar ?? defaultSidebar,
            social: parsed.social ?? [],
        };
    } catch (error) {
        console.error(
            `⚠️ Error reading ${configPath}. Using default configuration.`,
            error,
        );
        return {
            title: 'Obsidian Vault Site',
            defaultLocale: 'root',
            locales: defaultLocales,
            sidebar: defaultSidebar,
            social: [],
        };
    }
}
