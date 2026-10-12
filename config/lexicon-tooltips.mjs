// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { collectLexiconEntries } from '../scripts/lib/lexicon-index.mjs';
import { pageFilenameToSlug } from './lexicon.mjs';

/** @typedef {import('./lexicon.mjs').LexiconConfigEnabled} LexiconConfigEnabled */

/**
 * Lexicon entry descriptions keyed by locale (`root` for the default locale), then by entry slug.
 * @typedef {Map<string, Map<string, string>>} LexiconDescriptions
 */

/**
 * @param {string} value
 * @returns {string}
 */
function trimSlashes(value) {
    return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * Splits a vault-relative page path into its locale and its locale-neutral slug (no extension).
 * `en/01-intro/page.md` → `{ locale: 'en', slug: '01-intro/page' }`; root pages get `root`.
 * @param {string} vaultRelPath
 * @param {string[]} localeKeys Non-root locale keys (e.g. `['en']`).
 * @returns {{ locale: string, slug: string }}
 */
export function splitLocalePath(vaultRelPath, localeKeys) {
    const clean = trimSlashes(vaultRelPath).replace(/\.mdx?$/i, '');
    const [first, ...rest] = clean.split('/');
    if (rest.length > 0 && localeKeys.includes(first)) {
        return { locale: first, slug: rest.join('/') };
    }
    return { locale: 'root', slug: clean };
}

/**
 * Returns the lexicon entry slug an internal link points to, or null.
 * Accepts `/<dir>/<slug>/`, `/<locale>/<dir>/<slug>/`, with or without a trailing slash, a `.md`
 * extension, a query string or a hash. External, relative and anchor-only links never match.
 * @param {string | undefined | null} href
 * @param {string} directory Lexicon directory (vault-relative, e.g. `00-lexique`).
 * @param {string[]} localeKeys Non-root locale keys.
 * @returns {string | null}
 */
export function matchLexiconHref(href, directory, localeKeys) {
    if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null;
    let pathname = href.replace(/[?#].*$/, '');
    try {
        pathname = decodeURI(pathname);
    } catch {
        /* keep the raw path */
    }
    const segments = trimSlashes(pathname).replace(/\.md$/i, '').toLowerCase().split('/');
    if (segments.length > 1 && localeKeys.includes(segments[0])) segments.shift();

    const dirSegments = trimSlashes(directory).toLowerCase().split('/');
    if (segments.length !== dirSegments.length + 1) return null;
    if (dirSegments.some((segment, i) => segments[i] !== segment)) return null;
    const slug = segments[segments.length - 1];
    return slug && slug !== 'index' ? slug : null;
}

/**
 * Description of a lexicon entry in a locale, falling back to the default (`root`) locale.
 * @param {LexiconDescriptions} descriptions
 * @param {string} slug
 * @param {string} locale
 * @returns {string | undefined}
 */
export function lookupLexiconDescription(descriptions, slug, locale) {
    return descriptions.get(locale)?.get(slug) ?? descriptions.get('root')?.get(slug);
}

/**
 * Reads entry descriptions for the default locale and every non-root locale that has a mirror of
 * the lexicon directory (`<locale>/<directory>`). Entries without a description are left out.
 * @param {string} vaultRoot
 * @param {LexiconConfigEnabled} config
 * @param {string[]} localeKeys Non-root locale keys.
 * @returns {LexiconDescriptions}
 */
export function loadLexiconDescriptions(vaultRoot, config, localeKeys) {
    /** @type {LexiconDescriptions} */
    const descriptions = new Map();
    const directory = trimSlashes(config.directory);
    for (const locale of ['root', ...localeKeys]) {
        const localeDir = locale === 'root' ? directory : `${locale}/${directory}`;
        if (!directory || !fs.existsSync(path.join(vaultRoot, localeDir))) continue;
        /** @type {Map<string, string>} */
        const bySlug = new Map();
        for (const entry of collectLexiconEntries(vaultRoot, { ...config, directory: localeDir })) {
            if (entry.warnings.includes('missing description')) continue;
            bySlug.set(entry.slug.toLowerCase(), entry.description);
        }
        descriptions.set(locale, bySlug);
    }
    return descriptions;
}

/**
 * Locale-neutral slug of the generated lexicon index page (its links never get tooltips).
 * @param {LexiconConfigEnabled} config
 * @returns {string}
 */
export function lexiconIndexSlug(config) {
    return `${trimSlashes(config.directory)}/${pageFilenameToSlug(path.basename(config.indexPage))}`.toLowerCase();
}

/**
 * Stable, HTML-safe id for the hidden description element of an entry.
 * @param {string} slug
 * @returns {string}
 */
export function lexiconDescriptionId(slug) {
    return `lexicon-def-${slug.replace(/[^a-z0-9_-]+/gi, '-')}`;
}
