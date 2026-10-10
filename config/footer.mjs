// @ts-check

/**
 * @typedef {Object} FooterLink
 * @property {string} label
 * @property {string} href
 */

/**
 * @typedef {Object} FooterNote
 * @property {string} text
 * @property {FooterLink[]} links
 */

/**
 * @typedef {Object} FooterConfig
 * @property {FooterNote | null} note Default-locale note.
 * @property {Record<string, FooterNote>} translations Notes keyed by locale (e.g. `en`).
 */

/**
 * @param {unknown} raw
 * @returns {FooterLink[]}
 */
function parseLinks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter(
            (link) =>
                link &&
                typeof link.label === 'string' &&
                link.label.trim() &&
                typeof link.href === 'string' &&
                link.href.trim(),
        )
        .map((link) => ({ label: link.label.trim(), href: link.href.trim() }));
}

/**
 * @param {unknown} raw
 * @returns {FooterNote | null}
 */
function parseNote(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { text, links } = /** @type {{ text?: unknown, links?: unknown }} */ (raw);
    const cleanText = typeof text === 'string' ? text.trim() : '';
    const cleanLinks = parseLinks(links);
    if (!cleanText && cleanLinks.length === 0) return null;
    return { text: cleanText, links: cleanLinks };
}

/**
 * Parses the optional `footer` block of site.config.json:
 * `{ "text": "...", "links": [{ "label", "href" }], "translations": { "en": { "text", "links" } } }`.
 * @param {unknown} raw
 * @returns {FooterConfig}
 */
export function parseFooterBlock(raw) {
    /** @type {FooterConfig} */
    const config = { note: parseNote(raw), translations: {} };
    const translations =
        raw && typeof raw === 'object'
            ? /** @type {{ translations?: unknown }} */ (raw).translations
            : undefined;
    if (translations && typeof translations === 'object') {
        for (const [locale, value] of Object.entries(translations)) {
            const note = parseNote(value);
            if (note) config.translations[locale] = note;
        }
    }
    return config;
}

/**
 * Returns the note for a locale, falling back to the default-locale note.
 * @param {FooterConfig | undefined} footer
 * @param {string | undefined} locale Starlight locale (`root` or undefined for the default one).
 * @returns {FooterNote | null}
 */
export function resolveFooterNote(footer, locale) {
    if (!footer) return null;
    if (locale && locale !== 'root' && footer.translations[locale]) {
        return footer.translations[locale];
    }
    return footer.note;
}
