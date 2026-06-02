// @ts-check
import { entryPathToVaultRelative } from '../../config/gitignore.mjs';
import { projectRoot, resolveVaultGitRoot } from '../../config/vault.mjs';

/**
 * @param {string} vaultSlug Posix path without extension.
 * @param {string | undefined} locale Starlight locale segment (undefined for root).
 * @returns {string}
 */
export function siteHrefFromVaultSlug(vaultSlug, locale) {
    const normalized = vaultSlug.replace(/^\//, '').replace(/\/+$/g, '');
    if (!normalized) return '/';
    if (locale) return `/${locale}/${normalized}/`;
    return `/${normalized}/`;
}

/**
 * @param {{ filePath?: string, id?: string }} routeEntry
 * @returns {string | null}
 */
export function vaultSlugFromRouteEntry(routeEntry) {
    const vaultRoot = resolveVaultGitRoot();
    if (routeEntry.filePath) {
        const rel = entryPathToVaultRelative(routeEntry.filePath, projectRoot, vaultRoot);
        if (rel) return rel.replace(/\.mdx?$/i, '');
    }
    if (routeEntry.id) {
        return String(routeEntry.id).replace(/^\//, '').replace(/\/+$/g, '');
    }
    return null;
}
