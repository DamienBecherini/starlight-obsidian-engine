// @ts-check
/**
 * Technical-SEO helpers (pure functions, no Astro import): robots.txt, page titles, JSON-LD.
 * Used by src/pages/robots.txt.ts, src/starlight-route-data.mjs and src/components/Head.astro.
 */

/**
 * One emoji: a pictograph shown as emoji by default, or any pictograph forced to emoji
 * presentation with VS16 (U+FE0F), optionally skin-toned or tagged, joined by ZWJ (U+200D)
 * to further pictographs. Also flags (regional-indicator pairs) and keycaps (`1️⃣`).
 * Text-default symbols without VS16 (`©`, `®`, `™`) are not stripped.
 */
const EMOJI =
    '(?:' +
    '\\p{Regional_Indicator}{2}' +
    '|[#*0-9]\\uFE0F?\\u20E3' +
    '|(?:\\p{Emoji_Presentation}\\uFE0F?|\\p{Extended_Pictographic}\\uFE0F)' +
    '\\p{Emoji_Modifier}?[\\u{E0020}-\\u{E007F}]*' +
    '(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?\\p{Emoji_Modifier}?)*' +
    ')';

const LEADING_EMOJI = new RegExp(`^\\s*(?:${EMOJI}\\s*)+`, 'u');

/**
 * Removes the leading emoji (and the whitespace after it) from a title, to save SERP width.
 * Returns the title unchanged when it has no leading emoji or is made of emoji only.
 * @param {string} title
 * @returns {string}
 */
export function stripLeadingEmoji(title) {
    if (typeof title !== 'string') return title;
    const stripped = title.replace(LEADING_EMOJI, '');
    return stripped.trim() ? stripped : title;
}

/**
 * @typedef {Object} HeadEntry Starlight head entry (`starlightRoute.head`).
 * @property {string} tag
 * @property {Record<string, string | boolean | undefined>} [attrs]
 * @property {string} [content]
 */

/** Meta tags whose `content` is the page title. */
const TITLE_META_KEYS = new Set(['og:title', 'twitter:title']);

/**
 * Strips the leading emoji from `<title>`, `og:title` and `twitter:title` in place.
 * The H1 and the sidebar keep it (they do not read the head entries).
 * @param {HeadEntry[]} head
 * @returns {HeadEntry[]} The same array.
 */
export function stripEmojiFromHeadTitles(head) {
    for (const entry of head) {
        if (entry.tag === 'title' && typeof entry.content === 'string') {
            entry.content = stripLeadingEmoji(entry.content);
            continue;
        }
        if (entry.tag !== 'meta' || !entry.attrs) continue;
        const key = entry.attrs.property ?? entry.attrs.name;
        if (typeof key === 'string' && TITLE_META_KEYS.has(key) && typeof entry.attrs.content === 'string') {
            entry.attrs.content = stripLeadingEmoji(entry.attrs.content);
        }
    }
    return head;
}

/**
 * True when the head already holds a `<meta>` with this `name` or `property`.
 * @param {HeadEntry[] | undefined} head
 * @param {string} key e.g. `twitter:card`
 */
export function hasHeadMeta(head, key) {
    return (head ?? []).some(
        (entry) => entry.tag === 'meta' && (entry.attrs?.name === key || entry.attrs?.property === key),
    );
}

/**
 * Canonical URL from the head entries (`<link rel="canonical">`), if any.
 * @param {HeadEntry[] | undefined} head
 * @returns {string | undefined}
 */
export function canonicalFromHead(head) {
    const link = (head ?? []).find((entry) => entry.tag === 'link' && entry.attrs?.rel === 'canonical');
    const href = link?.attrs?.href;
    return typeof href === 'string' && href ? href : undefined;
}

/**
 * robots.txt body: allow everything, and point to the sitemap when the public URL is known.
 * @param {string | undefined} siteUrl Public site URL (site.config.json `url`).
 * @returns {string}
 */
export function buildRobotsTxt(siteUrl) {
    const lines = ['User-agent: *', 'Allow: /'];
    const base = siteUrl?.trim().replace(/\/+$/, '');
    if (base) lines.push('', `Sitemap: ${base}/sitemap-index.xml`);
    return `${lines.join('\n')}\n`;
}

/**
 * @typedef {Object} JsonLdInput
 * @property {'website' | 'article'} kind `website` on the splash/home page, `article` elsewhere.
 * @property {string} title Page title (headline); for `website`, the site title is used as name.
 * @property {string} siteTitle
 * @property {string} [siteUrl] Public site URL (site.config.json `url`).
 * @property {string} [description]
 * @property {string} [lang] Page language (BCP 47).
 * @property {string} [url] Canonical page URL.
 * @property {string} [dateModified] Frontmatter `last_modified` (YYYY-MM-DD…).
 * @property {{ name?: string, url?: string }} [author] site.config.json `editorial.hitl`.
 */

/** @param {unknown} value @returns {string | undefined} */
const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * Builds the schema.org object for a page: `WebSite` for the home page, `Article` otherwise.
 * Absent fields are omitted (no empty strings).
 * @param {JsonLdInput} input
 * @returns {Record<string, unknown>}
 */
export function buildJsonLd(input) {
    const siteUrl = clean(input.siteUrl)?.replace(/\/+$/, '');
    const siteHome = siteUrl ? `${siteUrl}/` : undefined;
    const description = clean(input.description);
    const lang = clean(input.lang);
    const url = clean(input.url);

    if (input.kind === 'website') {
        return compact({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: input.siteTitle,
            url: url ?? siteHome,
            description,
            inLanguage: lang,
        });
    }

    const dateModified = clean(input.dateModified);
    const authorName = clean(input.author?.name);
    return compact({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: stripLeadingEmoji(input.title),
        description,
        inLanguage: lang,
        url,
        dateModified: dateModified && /^\d{4}-\d{2}-\d{2}/.test(dateModified) ? dateModified : undefined,
        author: authorName
            ? compact({ '@type': 'Person', name: authorName, url: clean(input.author?.url) })
            : undefined,
        isPartOf: compact({ '@type': 'WebSite', name: input.siteTitle, url: siteHome }),
    });
}

/**
 * Drops `undefined` values (keeps key order).
 * @param {Record<string, unknown>} object
 * @returns {Record<string, unknown>}
 */
function compact(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

/**
 * JSON for a `<script type="application/ld+json">` body: `<` is escaped as `<` so the
 * content can never close the script element (`</script>`) or open a comment.
 * @param {unknown} data
 * @returns {string}
 */
export function serializeJsonLd(data) {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}
