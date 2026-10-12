// @ts-check

/**
 * @typedef {Object} PrerequisiteItem
 * @property {string} path Normalized vault path (default-locale form, no extension).
 * @property {string} href Site URL of the resolved page.
 * @property {string} title Title of the resolved page.
 * @property {boolean} fallback True when a non-default locale page fell back to the default-locale page.
 */

/**
 * @typedef {Object} PrerequisitesResult
 * @property {PrerequisiteItem[]} items
 * @property {string[]} warnings Human-readable messages for paths that could not be resolved.
 */

/** Built-in box labels; other locales fall back to English. */
const LABELS = {
    fr: 'Pour bien lire cette page',
    en: 'Before reading this page',
};

/**
 * Label of the prerequisites box for a page language (BCP 47 tag such as `fr` or `en-US`).
 * @param {string | undefined} lang
 * @returns {string}
 */
export function prerequisitesLabel(lang) {
    const base = (lang ?? '').toLowerCase().split('-')[0];
    return base === 'fr' ? LABELS.fr : LABELS.en;
}

/**
 * Normalizes a `prerequisites` entry to a collection-id-like path: forward slashes, no leading or
 * trailing slash, no `.md`/`.mdx` extension, no trailing `/index`, spaces → `-`, lower case
 * (matches the wiki-link resolver). Returns '' for unusable values.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePrerequisitePath(value) {
    if (typeof value !== 'string') return '';
    return value
        .trim()
        .replace(/\\/g, '/')
        .replace(/[?#].*$/, '')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\.mdx?$/i, '')
        .replace(/(^|\/)index$/i, '')
        .replace(/ /g, '-')
        .toLowerCase();
}

/**
 * Resolves `prerequisites` frontmatter paths to links in the page locale, falling back to the
 * default-locale page when the localized mirror does not exist. Unknown and duplicate paths are
 * skipped; unknown ones produce a warning.
 * @param {unknown} paths Raw frontmatter value (string array expected).
 * @param {Object} options
 * @param {string | undefined} options.locale Page locale key (`undefined` or `root` for the default locale).
 * @param {(id: string) => string | undefined} options.lookupTitle Title of a collection entry by id.
 * @param {string} [options.pageId] Current page id, for warning messages.
 * @returns {PrerequisitesResult}
 */
export function resolvePrerequisites(paths, { locale, lookupTitle, pageId }) {
    /** @type {PrerequisitesResult} */
    const result = { items: [], warnings: [] };
    if (!Array.isArray(paths)) return result;
    const localePrefix = locale && locale !== 'root' ? `${locale}/` : '';
    const where = pageId ? ` (in ${pageId})` : '';
    /** @type {Set<string>} */
    const seen = new Set();

    for (const raw of paths) {
        const normalized = normalizePrerequisitePath(raw);
        if (!normalized) {
            result.warnings.push(`prerequisites: ignored empty or invalid entry ${JSON.stringify(raw)}${where}`);
            continue;
        }
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        const localized = localePrefix ? lookupTitle(`${localePrefix}${normalized}`) : undefined;
        if (localized !== undefined) {
            result.items.push({ path: normalized, href: `/${localePrefix}${normalized}/`, title: localized, fallback: false });
            continue;
        }
        const base = lookupTitle(normalized);
        if (base !== undefined) {
            result.items.push({ path: normalized, href: `/${normalized}/`, title: base, fallback: Boolean(localePrefix) });
            continue;
        }
        result.warnings.push(`prerequisites: unknown page "${String(raw)}"${where}, skipped`);
    }
    return result;
}

/**
 * Map of collection entry id (normalized like `prerequisites` paths) → title.
 * @param {Array<{ id: string, data: { title: string } }>} entries
 * @returns {Map<string, string>}
 */
export function titlesById(entries) {
    return new Map(entries.map((entry) => [normalizePrerequisitePath(entry.id), entry.data.title]));
}

/** @type {Set<string>} */
const warned = new Set();

/**
 * Prints a build warning once (a page may be rendered more than once).
 * @param {string} message
 * @returns {boolean} True when the message was printed.
 */
export function warnOnce(message) {
    if (warned.has(message)) return false;
    warned.add(message);
    console.warn(`⚠️ ${message}`);
    return true;
}

/**
 * Id of the default-locale page a localized page mirrors (`en/02-x/page` → `02-x/page`), so a
 * mirror without its own `prerequisites` inherits the ones written once on the source page.
 * @param {string} entryId
 * @param {string | undefined} locale Page locale key (`undefined` or `root` for the default locale).
 * @returns {string | null} Null for default-locale pages and ids outside the locale folder.
 */
export function defaultLocaleSourceId(entryId, locale) {
    if (!locale || locale === 'root') return null;
    const prefix = `${locale}/`;
    return entryId.startsWith(prefix) ? entryId.slice(prefix.length) : null;
}
