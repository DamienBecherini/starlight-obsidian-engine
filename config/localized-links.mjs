// @ts-check
import { normalizePrerequisitePath } from './prerequisites.mjs';

/**
 * Outcome of localizing an internal link:
 * - `localized`: the page exists in the page locale, the href now points to it;
 * - `fallback`: no localized page, the href still points to the default-locale page;
 * - `unchanged`: not an internal page link (external, relative, asset, already localized,
 *   unknown page) or the page is in the default locale.
 * @typedef {'localized' | 'fallback' | 'unchanged'} LocalizedLinkStatus
 */

/**
 * Rewrites a root-relative internal link written in default-locale form (`/02-x/page/#anchor`)
 * so that it points to the page locale (`/en/02-x/page/#anchor`) when that localized page exists.
 * The original href shape (trailing slash, `.md` extension, query string, hash) is kept: only
 * the locale segment is inserted. Links already under a locale folder are left alone.
 *
 * @param {string | undefined | null} href
 * @param {Object} options
 * @param {string | undefined} options.locale Page locale key (`undefined` or `root` for the default locale).
 * @param {string[]} options.localeKeys Non-root locale keys (e.g. `['en']`).
 * @param {(id: string) => boolean} options.hasPage Whether a published page exists for a normalized id
 *   (lower case, no extension, no trailing `/index`; `en/02-x/page`, `02-x/page`, `en`, `` for home).
 * @returns {{ href: string | undefined | null, status: LocalizedLinkStatus }}
 */
export function localizeInternalHref(href, { locale, localeKeys, hasPage }) {
    const unchanged = { href, status: /** @type {LocalizedLinkStatus} */ ('unchanged') };
    if (!locale || locale === 'root') return unchanged;
    if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return unchanged;

    let pathname = href.replace(/[?#].*$/, '');
    try {
        pathname = decodeURI(pathname);
    } catch {
        /* keep the raw path */
    }
    const id = normalizePrerequisitePath(pathname);
    const firstSegment = id.split('/')[0];
    if (localeKeys.includes(firstSegment)) return unchanged;

    const localizedId = id ? `${locale}/${id}` : locale;
    if (hasPage(localizedId)) return { href: `/${locale}${href}`, status: 'localized' };
    if (hasPage(id)) return { href, status: 'fallback' };
    return unchanged;
}

/**
 * Set of normalized page ids (see `localizeInternalHref`) from vault-relative page slugs.
 * @param {Iterable<string>} slugs Vault-relative POSIX paths without extension.
 * @returns {Set<string>}
 */
export function pageIdSet(slugs) {
    /** @type {Set<string>} */
    const ids = new Set();
    for (const slug of slugs) ids.add(normalizePrerequisitePath(slug));
    return ids;
}
