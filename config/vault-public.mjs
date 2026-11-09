// @ts-check
/**
 * Publishes the static files of the vault's `public/` folder at the site root (images, downloads).
 * A vault file takes precedence over an engine file of the same name. Dotfiles, symbolic links and
 * paths excluded by the vault publish filter (`publish.exclude`, `.gitignore`) are never published.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVaultPublishFilter } from './gitignore.mjs';
import { resolveVaultGitRoot } from './vault.mjs';

const PUBLIC_DIR = 'public';

/** Content types served by the dev server; the production host sets its own. */
const DEV_CONTENT_TYPES = new Map([
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.avif', 'image/avif'],
    ['.svg', 'image/svg+xml'],
    ['.ico', 'image/x-icon'],
    ['.pdf', 'application/pdf'],
    ['.txt', 'text/plain; charset=utf-8'],
    ['.mp4', 'video/mp4'],
    ['.webm', 'video/webm'],
]);

/**
 * Lists the publishable files of the vault's `public/` folder.
 * @param {string} vaultRoot Absolute path to the vault repository root.
 * @returns {string[]} POSIX paths relative to `public/`, sorted.
 */
export function listVaultPublicFiles(vaultRoot) {
    const root = path.join(vaultRoot, PUBLIC_DIR);
    if (!fs.existsSync(root)) return [];

    const isIgnored = loadVaultPublishFilter(vaultRoot);
    /** @type {string[]} */
    const files = [];

    /** @param {string} relativeDir */
    const walk = (relativeDir) => {
        for (const entry of fs.readdirSync(path.join(root, relativeDir), { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            const child = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
            if (isIgnored(`${PUBLIC_DIR}/${child}`)) continue;
            if (entry.isDirectory()) walk(child);
            else if (entry.isFile()) files.push(child);
        }
    };

    walk('');
    return files.sort();
}

/**
 * Copies the publishable files of the vault's `public/` folder into the build output.
 * @param {string} vaultRoot Absolute path to the vault repository root.
 * @param {string} outDir Absolute path to the build output.
 * @returns {string[]} The copied files, relative to the output root.
 */
export function copyVaultPublicFiles(vaultRoot, outDir) {
    const files = listVaultPublicFiles(vaultRoot);
    for (const file of files) {
        const destination = path.join(outDir, file);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(vaultRoot, PUBLIC_DIR, file), destination);
    }
    return files;
}

/**
 * Serves the vault's public files in dev and copies them at build time. Files added while the
 * dev server runs need a restart.
 * @returns {import('astro').AstroIntegration}
 */
export function vaultPublicIntegration() {
    return {
        name: 'vault-public',
        hooks: {
            'astro:server:setup': ({ server }) => {
                const vaultRoot = resolveVaultGitRoot();
                const files = new Set(listVaultPublicFiles(vaultRoot));
                server.middlewares.use((req, res, next) => {
                    let file;
                    try {
                        file = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname).slice(1);
                    } catch {
                        next();
                        return;
                    }
                    // Only exact members of the list are served, so a crafted path cannot leave the folder.
                    if (!files.has(file)) {
                        next();
                        return;
                    }
                    res.setHeader(
                        'Content-Type',
                        DEV_CONTENT_TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream',
                    );
                    fs.createReadStream(path.join(vaultRoot, PUBLIC_DIR, file)).pipe(res);
                });
            },
            'astro:build:done': ({ dir, logger }) => {
                const copied = copyVaultPublicFiles(resolveVaultGitRoot(), fileURLToPath(dir));
                if (copied.length) logger.info(`Copied ${copied.length} file(s) from the vault public folder.`);
            },
        },
    };
}
