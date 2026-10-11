// @ts-check

/**
 * @typedef {Object} ApacheConfig
 * @property {boolean} forceHttps 301-redirect every http:// request to https://.
 * @property {string | null} notFoundPage Site path served for 404s (`ErrorDocument 404`), e.g. `/404.html`.
 */

/** Root-relative path, no whitespace, quotes or control characters (safe in an Apache directive). */
const SAFE_PAGE_PATH = /^\/[^\s"'\\<>]*$/;

/**
 * Parses the optional `apache` block of site.config.json:
 * `{ "forceHttps": true, "notFoundPage": "/404.html" }`.
 * Returns `null` when the block is absent or enables nothing (no `.htaccess` site rules).
 * Invalid values are ignored with a warning.
 * @param {unknown} raw
 * @returns {ApacheConfig | null}
 */
export function parseApacheBlock(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { forceHttps, notFoundPage } = /** @type {{ forceHttps?: unknown, notFoundPage?: unknown }} */ (raw);

    let page = null;
    if (typeof notFoundPage === 'string' && notFoundPage.trim()) {
        const candidate = notFoundPage.trim();
        if (SAFE_PAGE_PATH.test(candidate)) page = candidate;
        else console.warn(`⚠️ site.config.json apache.notFoundPage must be a root path like "/404.html" (got "${candidate}"); ignored.`);
    }

    /** @type {ApacheConfig} */
    const config = { forceHttps: forceHttps === true, notFoundPage: page };
    return config.forceHttps || config.notFoundPage ? config : null;
}
