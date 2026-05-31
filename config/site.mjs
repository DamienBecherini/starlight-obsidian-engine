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
        label: 'Français',
        lang: 'fr',
    },
};

/**
 * @typedef {Object} SiteConfig
 * @property {string} title
 * @property {string} [defaultLocale]
 * @property {import('@astrojs/starlight/types').StarlightUserConfig['locales']} [locales]
 * @property {import('@astrojs/starlight/types').StarlightUserConfig['sidebar']} [sidebar]
 * @property {import('@astrojs/starlight/types').StarlightUserConfig['social']} [social]
 */

/**
 * Charge site.config.json depuis la racine du vault.
 * @returns {Required<Pick<SiteConfig, 'title' | 'defaultLocale' | 'locales' | 'sidebar'>> & Pick<SiteConfig, 'social'>}
 */
export function loadSiteConfig() {
    const vaultPath = resolveVaultPath();
    const configPath = path.join(vaultPath, 'site.config.json');

    if (!fs.existsSync(configPath)) {
        console.log(
            `ℹ️ Aucun site.config.json dans le vault (${vaultPath}). Configuration moteur par défaut.`,
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
        console.log(`🎯 Configuration du site chargée depuis ${configPath}`);
        return {
            title: parsed.title ?? 'Obsidian Vault Site',
            defaultLocale: parsed.defaultLocale ?? 'root',
            locales: parsed.locales ?? defaultLocales,
            sidebar: parsed.sidebar ?? defaultSidebar,
            social: parsed.social ?? [],
        };
    } catch (error) {
        console.error(
            `⚠️ Erreur lors de la lecture de ${configPath}. Configuration par défaut.`,
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
