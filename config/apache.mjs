// @ts-check

/**
 * @typedef {Object} LocalizedNotFoundPage
 * @property {string} prefix URL prefix, e.g. `/en/`.
 * @property {string} page Site path served for 404s under that prefix, e.g. `/en/404/`.
 */

/**
 * @typedef {Object} ApacheConfig
 * @property {boolean} forceHttps 301-redirect every http:// request to https://.
 * @property {string | null} notFoundPage Site path served for 404s (`ErrorDocument 404`), e.g. `/404.html`.
 * @property {LocalizedNotFoundPage[]} notFoundPages Per-prefix 404 pages (e.g. one per locale), overriding `notFoundPage`.
 * @property {number | null} hstsMaxAge `Strict-Transport-Security` max-age in seconds (HTTPS responses only), or null.
 */

/** Root-relative path, no whitespace, quotes or control characters (safe in an Apache directive). */
const SAFE_PAGE_PATH = /^\/[^\s"'\\<>#]*$/;

/** Default HSTS max-age: one year. */
export const DEFAULT_HSTS_MAX_AGE = 31536000;

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string | null}
 */
function safePath(value, label) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const candidate = value.trim();
    if (SAFE_PAGE_PATH.test(candidate)) return candidate;
    console.warn(`⚠️ site.config.json apache.${label} must be a root path like "/404.html" (got "${candidate}"); ignored.`);
    return null;
}

/**
 * @param {unknown} raw `{ "/en/": "/en/404/" }`
 * @returns {LocalizedNotFoundPage[]}
 */
function parseNotFoundPages(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    /** @type {LocalizedNotFoundPage[]} */
    const pages = [];
    for (const [prefix, page] of Object.entries(raw)) {
        const safePrefix = safePath(prefix, 'notFoundPages key');
        const safePage = safePath(page, `notFoundPages["${prefix}"]`);
        if (!safePrefix || !safePage) continue;
        if (!safePrefix.endsWith('/') || safePrefix === '/') {
            console.warn(`⚠️ site.config.json apache.notFoundPages key must be a sub-path ending with "/" like "/en/" (got "${safePrefix}"); ignored.`);
            continue;
        }
        pages.push({ prefix: safePrefix, page: safePage });
    }
    return pages;
}

/**
 * @param {unknown} raw `true` (one year) or a positive number of seconds.
 * @returns {number | null}
 */
function parseHsts(raw) {
    if (raw === true) return DEFAULT_HSTS_MAX_AGE;
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
    if (raw !== undefined && raw !== false) {
        console.warn('⚠️ site.config.json apache.hsts must be true or a positive integer (seconds); ignored.');
    }
    return null;
}

/**
 * Parses the optional `apache` block of site.config.json:
 * `{ "forceHttps": true, "notFoundPage": "/404.html", "notFoundPages": { "/en/": "/en/404/" }, "hsts": true }`.
 * Returns `null` when the block is absent or enables nothing (no `.htaccess` site rules).
 * Invalid values are ignored with a warning.
 * @param {unknown} raw
 * @returns {ApacheConfig | null}
 */
export function parseApacheBlock(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { forceHttps, notFoundPage, notFoundPages, hsts } =
        /** @type {{ forceHttps?: unknown, notFoundPage?: unknown, notFoundPages?: unknown, hsts?: unknown }} */ (raw);

    /** @type {ApacheConfig} */
    const config = {
        forceHttps: forceHttps === true,
        notFoundPage: safePath(notFoundPage, 'notFoundPage'),
        notFoundPages: parseNotFoundPages(notFoundPages),
        hstsMaxAge: parseHsts(hsts),
    };
    const enabled =
        config.forceHttps || config.notFoundPage || config.notFoundPages.length > 0 || config.hstsMaxAge;
    return enabled ? config : null;
}
