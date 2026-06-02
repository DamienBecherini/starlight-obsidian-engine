// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { resolveVaultPath } from './vault.mjs';

/**
 * @typedef {Object} LexiconIndexConfig
 * @property {string} title
 * @property {string} description
 * @property {string} intro
 * @property {{ path: string, label: string } | undefined} [hubLink]
 */

/**
 * @typedef {Object} LexiconConfigEnabled
 * @property {true} enabled
 * @property {string} directory
 * @property {string} entryTag
 * @property {string} hubPage
 * @property {string} indexPage
 * @property {string} sortLocale
 * @property {LexiconIndexConfig} index
 */

/**
 * @typedef {Object} LexiconConfigDisabled
 * @property {false} enabled
 */

/** @typedef {LexiconConfigEnabled | LexiconConfigDisabled} LexiconConfig */

/**
 * @typedef {Object} LexiconPaths
 * @property {string} lexiconDir Absolute path to lexicon directory
 * @property {string} hubFilePath Absolute path to hub markdown file
 * @property {string} indexFilePath Absolute path to index markdown file
 * @property {string} hubBasename Hub filename (e.g. glossaire-ia.md)
 * @property {string} indexBasename Index filename (e.g. index-lexique.md)
 * @property {string} hubSlug Vault-relative slug without extension (e.g. 00-lexique/glossaire-ia)
 * @property {string} indexSlug Vault-relative slug without extension
 */

/**
 * @param {unknown} raw
 * @returns {LexiconConfig}
 */
export function parseLexiconBlock(raw) {
    if (!raw || typeof raw !== 'object') {
        return { enabled: false };
    }

    /** @type {Record<string, unknown>} */
    const block = /** @type {Record<string, unknown>} */ (raw);
    if (block.enabled !== true) {
        return { enabled: false };
    }

    const directory = typeof block.directory === 'string' ? block.directory.trim() : '';
    const hubPage = typeof block.hubPage === 'string' ? block.hubPage.trim() : '';
    const indexPage = typeof block.indexPage === 'string' ? block.indexPage.trim() : '';
    const entryTag =
        typeof block.entryTag === 'string' && block.entryTag.trim()
            ? block.entryTag.trim()
            : 'lexique';
    const sortLocale =
        typeof block.sortLocale === 'string' && block.sortLocale.trim()
            ? block.sortLocale.trim()
            : 'fr';

    /** @type {Record<string, unknown> | undefined} */
    const indexRaw =
        block.index && typeof block.index === 'object'
            ? /** @type {Record<string, unknown>} */ (block.index)
            : undefined;

    const title =
        indexRaw && typeof indexRaw.title === 'string' ? indexRaw.title.trim() : '';
    const description =
        indexRaw && typeof indexRaw.description === 'string'
            ? indexRaw.description.trim()
            : '';
    const intro =
        indexRaw && typeof indexRaw.intro === 'string' ? indexRaw.intro.trim() : '';

    /** @type {{ path: string, label: string } | undefined} */
    let hubLink;
    if (indexRaw?.hubLink && typeof indexRaw.hubLink === 'object') {
        const hl = /** @type {Record<string, unknown>} */ (indexRaw.hubLink);
        const hubPath = typeof hl.path === 'string' ? hl.path.trim() : '';
        const hubLabel = typeof hl.label === 'string' ? hl.label.trim() : '';
        if (hubPath && hubLabel) {
            hubLink = { path: hubPath, label: hubLabel };
        }
    }

    return {
        enabled: true,
        directory,
        entryTag,
        hubPage,
        indexPage,
        sortLocale,
        index: { title, description, intro, hubLink },
    };
}

/**
 * @param {LexiconConfigEnabled} config
 * @returns {string[]}
 */
export function validateEnabledLexiconConfig(config) {
    /** @type {string[]} */
    const errors = [];
    if (!config.directory) errors.push('lexicon.directory is required when lexicon.enabled is true');
    if (!config.hubPage) errors.push('lexicon.hubPage is required when lexicon.enabled is true');
    if (!config.indexPage) errors.push('lexicon.indexPage is required when lexicon.enabled is true');
    if (!config.index.title) errors.push('lexicon.index.title is required when lexicon.enabled is true');
    if (!config.index.description) {
        errors.push('lexicon.index.description is required when lexicon.enabled is true');
    }
    if (!config.index.intro) errors.push('lexicon.index.intro is required when lexicon.enabled is true');
    return errors;
}

/**
 * @param {LexiconConfig} config
 * @returns {config is LexiconConfigEnabled}
 */
export function isLexiconEnabled(config) {
    return config.enabled === true;
}

/**
 * @param {string} vaultRoot
 * @returns {LexiconConfig}
 */
export function loadLexiconConfig(vaultRoot) {
    const root = vaultRoot ?? resolveVaultPath();
    const configPath = path.join(root, 'site.config.json');

    if (!fs.existsSync(configPath)) {
        return { enabled: false };
    }

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        /** @type {{ lexicon?: unknown }} */
        const parsed = JSON.parse(raw);
        return parseLexiconBlock(parsed.lexicon);
    } catch {
        return { enabled: false };
    }
}

/**
 * @param {string} pageFilename
 * @returns {string}
 */
export function pageFilenameToSlug(pageFilename) {
    return pageFilename.replace(/\.md$/i, '');
}

/**
 * @param {LexiconConfigEnabled} config
 * @param {string} vaultRoot
 * @returns {LexiconPaths}
 */
export function resolveLexiconPaths(config, vaultRoot) {
    const dir = config.directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const lexiconDir = path.join(vaultRoot, dir);
    const hubBasename = path.basename(config.hubPage);
    const indexBasename = path.basename(config.indexPage);
    const hubSlug = `${dir}/${pageFilenameToSlug(hubBasename)}`.replace(/\\/g, '/');
    const indexSlug = `${dir}/${pageFilenameToSlug(indexBasename)}`.replace(/\\/g, '/');

    return {
        lexiconDir,
        hubFilePath: path.join(lexiconDir, hubBasename),
        indexFilePath: path.join(lexiconDir, indexBasename),
        hubBasename,
        indexBasename,
        hubSlug,
        indexSlug,
    };
}

/**
 * Slugs to exclude from backlink display lists (hub + generated index).
 * @param {LexiconConfigEnabled} config
 * @returns {string[]}
 */
export function getLexiconExcludeSlugs(config) {
    const dir = config.directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return [
        `${dir}/${pageFilenameToSlug(path.basename(config.hubPage))}`,
        `${dir}/${pageFilenameToSlug(path.basename(config.indexPage))}`,
    ];
}
