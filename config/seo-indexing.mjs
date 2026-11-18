// @ts-check
/**
 * Search engine indexing per page or per section.
 *
 * - `site.config.json` → `seo.noindex`: gitignore-style patterns on the page path without extension, written once
 *   in default-locale form (`00-lexique/**`, `!00-lexique/ai-glossary`); they also cover every locale mirror
 *   (`en/00-lexique/...`).
 * - Page frontmatter `noindex: true | false` overrides the patterns for that page.
 *
 * A noindex page stays published (links, tooltips, on-site search) but carries
 * `<meta name="robots" content="noindex, follow">` and is removed from the sitemap after the build, where every
 * remaining entry also gets a `<lastmod>` taken from the page's `article:modified_time` (frontmatter `last_modified`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';

/**
 * @typedef {Object} SeoConfig
 * @property {string[]} noindex Patterns of pages kept out of search engines.
 */

/**
 * Parses the optional `seo` block of site.config.json. Invalid entries are ignored with a warning.
 * @param {unknown} raw
 * @returns {SeoConfig}
 */
export function parseSeoBlock(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { noindex: [] };
    const { noindex } = /** @type {{ noindex?: unknown }} */ (raw);
    if (noindex === undefined) return { noindex: [] };
    if (!Array.isArray(noindex)) {
        console.warn('⚠️ site.config.json seo.noindex must be an array of path patterns; ignored.');
        return { noindex: [] };
    }
    /** @type {string[]} */
    const patterns = [];
    for (const entry of noindex) {
        if (typeof entry !== 'string' || !entry.trim()) {
            console.warn(`⚠️ site.config.json seo.noindex: ${JSON.stringify(entry)} is not a path pattern; ignored.`);
            continue;
        }
        patterns.push(entry.trim().replace(/\\/g, '/').replace(/^(!?)\/+/, '$1'));
    }
    return { noindex: patterns };
}

/**
 * Page path without locale folder: `en/00-lexique/llm` → `00-lexique/llm`; default-locale paths are unchanged.
 * @param {string} id Page path without extension (Starlight entry id).
 * @param {string[]} localeKeys Non-root locale keys (e.g. `['en']`).
 */
export function stripLocale(id, localeKeys) {
    const clean = id.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.(md|mdx)$/i, '');
    const [first, ...rest] = clean.split('/');
    return localeKeys.includes(first) ? rest.join('/') : clean;
}

/**
 * Whether a page is kept out of search engines.
 * @param {Object} options
 * @param {string} options.id Page path without extension (`en/00-lexique/llm`).
 * @param {unknown} [options.frontmatter] Frontmatter `noindex` value: a boolean overrides the patterns.
 * @param {string[]} options.patterns `seo.noindex` patterns.
 * @param {string[]} options.localeKeys Non-root locale keys.
 * @returns {boolean}
 */
export function isNoindex({ id, frontmatter, patterns, localeKeys }) {
    if (typeof frontmatter === 'boolean') return frontmatter;
    if (!patterns.length) return false;
    const neutral = stripLocale(id, localeKeys);
    if (!neutral) return false;
    return ignore().add(patterns).ignores(neutral);
}

/** `<meta name="robots" content="noindex…">`, attributes in any order. */
const ROBOTS_NOINDEX = /<meta\s+(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*\bnoindex\b)[^>]*>/i;
const CANONICAL = /<link\s+(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i;
const MODIFIED = /<meta\s+(?=[^>]*\bproperty=["']article:modified_time["'])[^>]*\bcontent=["']([^"']+)["'][^>]*>/i;
/** W3C datetime accepted by sitemaps: a date, optionally with a time. */
const W3C_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/**
 * Indexing facts of one built HTML page.
 * @param {string} html
 * @returns {{ url: string | null, noindex: boolean, lastmod: string | null }}
 */
export function pageSeoFromHtml(html) {
    const end = html.search(/<\/head>/i);
    const head = end >= 0 ? html.slice(0, end) : html;
    const modified = head.match(MODIFIED)?.[1]?.trim() ?? null;
    return {
        url: head.match(CANONICAL)?.[1] ?? null,
        noindex: ROBOTS_NOINDEX.test(head),
        lastmod: modified && W3C_DATE.test(modified) ? modified : null,
    };
}

/**
 * Removes noindex pages from a sitemap and adds `<lastmod>` where the page has a date.
 * Alternate links (`xhtml:link`) pointing to a removed page are removed too.
 * @param {string} xml Content of one `sitemap-N.xml`.
 * @param {Set<string>} noindexUrls
 * @param {Map<string, string>} lastmods URL → W3C date.
 * @returns {{ xml: string, removed: number, dated: number }}
 */
export function rewriteSitemap(xml, noindexUrls, lastmods) {
    let removed = 0;
    let dated = 0;
    const out = xml.replace(/<url>([\s\S]*?)<\/url>/g, (block, inner) => {
        const loc = inner.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
        if (!loc) return block;
        if (noindexUrls.has(loc)) {
            removed += 1;
            return '';
        }
        let body = inner.replace(
            /<xhtml:link\b[^>]*\bhref="([^"]+)"[^>]*\/>/g,
            (/** @type {string} */ link, /** @type {string} */ href) => (noindexUrls.has(href) ? '' : link),
        );
        const lastmod = lastmods.get(loc);
        if (lastmod && !/<lastmod>/.test(body)) {
            body = body.replace(/(<loc>[^<]+<\/loc>)/, `$1<lastmod>${lastmod}</lastmod>`);
            dated += 1;
        }
        return `<url>${body}</url>`;
    });
    return { xml: out, removed, dated };
}

/**
 * @param {string} dir
 * @returns {string[]} Absolute paths of the `.html` files under `dir`.
 */
function listHtmlFiles(dir) {
    /** @type {string[]} */
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...listHtmlFiles(full));
        else if (entry.isFile() && entry.name.endsWith('.html')) files.push(full);
    }
    return files;
}

/**
 * Post-processes the sitemap written by `@astrojs/sitemap` in the build output.
 * @param {string} outDir Absolute build output directory.
 * @returns {{ removed: number, dated: number, files: number }}
 */
export function applySeoToSitemaps(outDir) {
    /** @type {Set<string>} */
    const noindexUrls = new Set();
    /** @type {Map<string, string>} */
    const lastmods = new Map();
    for (const file of listHtmlFiles(outDir)) {
        const { url, noindex, lastmod } = pageSeoFromHtml(fs.readFileSync(file, 'utf8'));
        if (!url) continue;
        if (noindex) noindexUrls.add(url);
        else if (lastmod) lastmods.set(url, lastmod);
    }
    let removed = 0;
    let dated = 0;
    const sitemaps = fs.readdirSync(outDir).filter((name) => /^sitemap-\d+\.xml$/.test(name));
    for (const name of sitemaps) {
        const file = path.join(outDir, name);
        const result = rewriteSitemap(fs.readFileSync(file, 'utf8'), noindexUrls, lastmods);
        fs.writeFileSync(file, result.xml);
        removed += result.removed;
        dated += result.dated;
    }
    return { removed, dated, files: sitemaps.length };
}

/**
 * `@astrojs/sitemap` options matching Starlight's own (i18n alternates when the site has several locales).
 * @param {Record<string, { lang?: string } | undefined> | undefined} locales site.config.json `locales`
 * @param {string | undefined} defaultLocale site.config.json `defaultLocale`
 */
export function sitemapOptions(locales, defaultLocale) {
    const entries = Object.entries(locales ?? {});
    if (entries.length < 2) return {};
    return {
        i18n: {
            defaultLocale: defaultLocale || 'root',
            locales: Object.fromEntries(entries.map(([key, value]) => [key, value?.lang ?? key])),
        },
    };
}

/**
 * Astro integration: runs after `@astrojs/sitemap` (it must come after it in the integrations list).
 * @returns {import('astro').AstroIntegration}
 */
export function seoSitemapIntegration() {
    return {
        name: 'seo-sitemap',
        hooks: {
            'astro:build:done': ({ dir, logger }) => {
                const { removed, dated, files } = applySeoToSitemaps(fileURLToPath(dir));
                if (files) logger.info(`Sitemap: ${removed} noindex page(s) removed, ${dated} entr(ies) dated (lastmod).`);
            },
        },
    };
}
