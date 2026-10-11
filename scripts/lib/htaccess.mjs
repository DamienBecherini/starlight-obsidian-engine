// @ts-check
/**
 * Apache `.htaccess` site rules from site.config.json → `apache` (HTTPS redirect, 404 pages, HSTS).
 * Deploy never uploads dotfiles, so these rules reach the server through `auth:install`
 * (prepended to the Basic Auth rules), `auth:remove` (uploaded alone) or `htaccess:install`.
 */

/** Apache expression: the request came over HTTPS (directly or through a TLS proxy). */
export const HTTPS_EXPRESSION = "%{HTTPS} == 'on' || req('X-Forwarded-Proto') == 'https'";

/** Marker line opening the generated block. */
const HEADER = '# Site rules generated from site.config.json "apache" (starlight-obsidian-engine).';

/**
 * Builds the `.htaccess` site rules. Returns an empty string when nothing is configured.
 * @param {import('../../config/apache.mjs').ApacheConfig | null | undefined} apache
 * @returns {string}
 */
export function buildSiteHtaccess(apache) {
    if (
        !apache ||
        (!apache.forceHttps && !apache.notFoundPage && !apache.notFoundPages?.length && !apache.hstsMaxAge)
    ) {
        return '';
    }
    const lines = [HEADER];
    if (apache.forceHttps) {
        lines.push(
            '',
            '# Redirect http:// to https:// (one canonical scheme). The X-Forwarded-Proto guard avoids',
            '# a redirect loop behind a TLS-terminating proxy. No <IfModule>: without mod_rewrite',
            '# Apache must fail loudly (500) rather than silently serve http://.',
            'RewriteEngine On',
            'RewriteCond %{HTTPS} off',
            'RewriteCond %{HTTP:X-Forwarded-Proto} !https',
            'RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]',
        );
    }
    if (apache.notFoundPage) {
        lines.push('', '# Serve the site\'s own 404 page.', `ErrorDocument 404 ${apache.notFoundPage}`);
    }
    for (const { prefix, page } of apache.notFoundPages ?? []) {
        lines.push(
            '',
            `# 404 page for ${prefix} (e.g. one per locale).`,
            `<If "%{REQUEST_URI} =~ m#^${prefix}#">`,
            `    ErrorDocument 404 ${page}`,
            '</If>',
        );
    }
    if (apache.hstsMaxAge) {
        lines.push(
            '',
            '# HSTS: browsers stay on https:// for this host (HTTPS responses only; no includeSubDomains or preload).',
            '<IfModule mod_headers.c>',
            `    Header always set Strict-Transport-Security "max-age=${apache.hstsMaxAge}" "expr=${HTTPS_EXPRESSION}"`,
            '</IfModule>',
        );
    }
    return `${lines.join('\n')}\n`;
}

/**
 * Joins `.htaccess` sections (site rules first), skipping empty ones.
 * @param {...string} sections
 * @returns {string}
 */
export function mergeHtaccess(...sections) {
    const parts = sections.map((s) => s.trim()).filter(Boolean);
    return parts.length ? `${parts.join('\n\n')}\n` : '';
}

/**
 * One-line summary of the site rules, for script logs.
 * @param {import('../../config/apache.mjs').ApacheConfig | null | undefined} apache
 * @returns {string}
 */
export function describeApacheConfig(apache) {
    if (!apache) return 'none (no apache block in site.config.json)';
    const localized = apache.notFoundPages?.map(({ prefix, page }) => `${prefix}→${page}`).join(' ') || 'none';
    return `forceHttps=${apache.forceHttps}, notFoundPage=${apache.notFoundPage ?? 'none'}, notFoundPages=${localized}, hsts=${apache.hstsMaxAge ?? 'off'}`;
}

/** Basic Auth settings that mean `.htaccess` is owned by `auth:install`. */
const AUTH_ENV_KEYS = ['AUTH_USER', 'AUTH_PASSWORD', 'AUTH_SERVER_ROOT'];

/**
 * Basic Auth variables set in the environment (non-empty).
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function authEnvKeysSet(env) {
    return AUTH_ENV_KEYS.filter((key) => env[key]?.trim());
}
