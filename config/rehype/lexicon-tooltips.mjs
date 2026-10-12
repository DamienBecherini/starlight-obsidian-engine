// @ts-check
import { entryPathToVaultRelative } from '../gitignore.mjs';
import {
    lexiconDescriptionId,
    lexiconIndexSlug,
    loadLexiconDescriptions,
    lookupLexiconDescription,
    matchLexiconHref,
    splitLocalePath,
} from '../lexicon-tooltips.mjs';

/**
 * @typedef {Object} LexiconTooltipsOptions
 * @property {import('../lexicon.mjs').LexiconConfigEnabled} config
 * @property {string} vaultRoot Absolute vault root.
 * @property {string} engineRoot Absolute engine root (resolves engine-relative entry paths).
 * @property {string[]} localeKeys Non-root locale keys (e.g. `['en']`).
 * @property {import('../lexicon-tooltips.mjs').LexiconDescriptions} [descriptions] Preloaded (tests).
 */

/**
 * @param {any} node
 * @returns {string[]}
 */
function classList(node) {
    const value = node.properties?.className;
    if (Array.isArray(value)) return value.map(String);
    return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

/**
 * Annotates the links of a rendered page that point to lexicon entries.
 * Each link gets `data-lexicon-def` (read by the client popover), the `lexicon-term` class and an
 * `aria-describedby` pointing to a hidden element holding the description (one per entry, appended
 * at the end of the page, ignored by Pagefind). Skips the generated lexicon index page and links an
 * entry makes to itself.
 *
 * @param {any} tree hast root
 * @param {{ locale: string, slug: string }} page Locale and locale-neutral slug of the page.
 * @param {Required<Pick<LexiconTooltipsOptions, 'descriptions' | 'config' | 'localeKeys'>>} options
 * @returns {number} Number of annotated links.
 */
export function annotateLexiconLinks(tree, page, { descriptions, config, localeKeys }) {
    const pageSlug = page.slug.toLowerCase();
    if (pageSlug === lexiconIndexSlug(config)) return 0;
    const directory = config.directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();

    /** @type {Map<string, string>} */
    const used = new Map();
    let count = 0;

    /** @param {any} node */
    const walk = (node) => {
        if (node.type === 'element' && node.tagName === 'a') {
            const slug = matchLexiconHref(node.properties?.href, config.directory, localeKeys);
            const description = slug ? lookupLexiconDescription(descriptions, slug, page.locale) : undefined;
            if (slug && description && `${directory}/${slug}` !== pageSlug) {
                const id = lexiconDescriptionId(slug);
                used.set(id, description);
                const describedBy = String(node.properties.ariaDescribedBy ?? '').trim();
                node.properties = {
                    ...node.properties,
                    className: [...new Set([...classList(node), 'lexicon-term'])],
                    dataLexiconDef: description,
                    ariaDescribedBy: describedBy ? `${describedBy} ${id}` : id,
                };
                count += 1;
            }
            return;
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);

    if (used.size > 0) {
        tree.children.push({
            type: 'element',
            tagName: 'div',
            properties: { className: ['lexicon-defs'], hidden: true, dataPagefindIgnore: true },
            children: [...used].map(([id, description]) => ({
                type: 'element',
                tagName: 'span',
                properties: { id },
                children: [{ type: 'text', value: description }],
            })),
        });
    }
    return count;
}

/**
 * Rehype plugin: lexicon tooltips (see `annotateLexiconLinks`). The page locale comes from the
 * vault-relative path of the rendered file (`en/...` → `en`, otherwise the default locale).
 * Descriptions are read once, when the processor is created.
 * @param {LexiconTooltipsOptions} options
 */
export function rehypeLexiconTooltips(options) {
    const descriptions =
        options.descriptions ??
        loadLexiconDescriptions(options.vaultRoot, options.config, options.localeKeys);
    const { config, localeKeys } = options;

    /**
     * @param {any} tree
     * @param {{ path?: string }} file
     */
    return (tree, file) => {
        const vaultRel = file.path
            ? entryPathToVaultRelative(file.path, options.engineRoot, options.vaultRoot)
            : null;
        if (!vaultRel) return;
        annotateLexiconLinks(tree, splitLocalePath(vaultRel, localeKeys), { descriptions, config, localeKeys });
    };
}
