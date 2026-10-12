// @ts-check
import { entryPathToVaultRelative } from '../gitignore.mjs';
import { splitLocalePath } from '../lexicon-tooltips.mjs';
import { localizeInternalHref, pageIdSet } from '../localized-links.mjs';
import { listPublishedMarkdownFiles } from '../../scripts/lib/link-graph.mjs';

/**
 * @typedef {Object} LocalizedLinksOptions
 * @property {string} vaultRoot Absolute vault root.
 * @property {string} engineRoot Absolute engine root (resolves engine-relative entry paths).
 * @property {string[]} localeKeys Non-root locale keys (e.g. `['en']`).
 * @property {string} [defaultLang] BCP 47 tag of the default locale, set as `hreflang` on links
 *   that fall back to a default-locale page (omitted when empty).
 * @property {Set<string>} [pageIds] Preloaded normalized page ids (tests).
 */

/**
 * Rewrites the internal links of a page rendered in a non-default locale (see
 * `localizeInternalHref`). Links that fall back to the default-locale page get `hreflang`.
 *
 * @param {any} tree hast root
 * @param {string} locale Page locale key (`root` for the default locale: nothing to do).
 * @param {{ localeKeys: string[], pageIds: Set<string>, defaultLang?: string }} options
 * @returns {{ localized: number, fallback: number }}
 */
export function localizeLinks(tree, locale, { localeKeys, pageIds, defaultLang }) {
    const counts = { localized: 0, fallback: 0 };
    if (!locale || locale === 'root') return counts;
    const hasPage = (/** @type {string} */ id) => pageIds.has(id);

    /** @param {any} node */
    const walk = (node) => {
        if (node.type === 'element' && node.tagName === 'a') {
            const { href, status } = localizeInternalHref(node.properties?.href, { locale, localeKeys, hasPage });
            if (status === 'localized') {
                node.properties = { ...node.properties, href };
                counts.localized += 1;
            } else if (status === 'fallback') {
                if (defaultLang && !node.properties.hrefLang) {
                    node.properties = { ...node.properties, hrefLang: defaultLang };
                }
                counts.fallback += 1;
            }
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
    return counts;
}

/**
 * Rehype plugin: on pages under a non-default locale folder (`en/...`), internal links written in
 * default-locale form (wiki links `[[02-x/page]]`, root-relative Markdown links) point to the
 * localized page when it exists. The published page list is read once, when the processor is created.
 * @param {LocalizedLinksOptions} options
 */
export function rehypeLocalizedLinks(options) {
    const { localeKeys, defaultLang } = options;
    const pageIds =
        options.pageIds ??
        (localeKeys.length > 0
            ? pageIdSet(listPublishedMarkdownFiles(options.vaultRoot).map((file) => file.slug))
            : new Set());

    /**
     * @param {any} tree
     * @param {{ path?: string }} file
     */
    return (tree, file) => {
        if (localeKeys.length === 0 || !file.path) return;
        const vaultRel = entryPathToVaultRelative(file.path, options.engineRoot, options.vaultRoot);
        if (!vaultRel) return;
        localizeLinks(tree, splitLocalePath(vaultRel, localeKeys).locale, { localeKeys, pageIds, defaultLang });
    };
}
