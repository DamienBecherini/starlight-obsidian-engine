// @ts-check
/**
 * Copies vault splash MDX pages (index.mdx per locale) into src/content/docs
 * so Starlight's MDX pipeline resolves @astrojs/starlight/components correctly.
 * Only root splash files are copied — all .md content still loads from the vault via glob.
 */
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, resolveVaultPath, resolveVaultGitRoot, isDocsLinkedToVault } from './vault.mjs';

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');

/** Relative splash paths copied from the vault. */
const SPLASH_REL_PATHS = ['index.mdx', 'en/index.mdx'];

/**
 * @returns {string[]} Absolute paths of staged files (for cleanup).
 */
export function stageVaultSplashMdx() {
    // When src/content/docs is a junction → vault, MDX is already reachable via docsLoader.
    // Staging would copy vault files on top of the junction (no-op at best, destructive at worst).
    if (isDocsLinkedToVault()) return [];

    const vaultPath = resolveVaultPath();
    /** @type {string[]} */
    const staged = [];

    // Remove stale splash files from a previous vault before copying the active one.
    for (const rel of SPLASH_REL_PATHS) {
        const dest = path.join(LINKED_DOCS, rel);
        try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
        } catch {
            /* ignore */
        }
    }

    for (const rel of SPLASH_REL_PATHS) {
        const src = path.join(vaultPath, rel);
        if (!fs.existsSync(src)) continue;

        const dest = path.join(LINKED_DOCS, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        staged.push(dest);
    }

    if (staged.length) {
        console.log(
            `📄 Vault splash MDX → src/content/docs : ${staged.map((f) => path.relative(projectRoot, f)).join(', ')}`,
        );
    }

    return staged;
}

/** @param {string[]} staged Absolute paths previously returned by stageVaultSplashMdx(). */
export function cleanupStagedSplashMdx(staged) {
    // Never delete a file that resolves into the vault directory.
    let vaultRoot = '';
    try { vaultRoot = path.normalize(resolveVaultGitRoot()); } catch { /* ignore */ }

    for (const file of staged) {
        try {
            if (vaultRoot) {
                const real = path.normalize(fs.realpathSync(file));
                if (real === vaultRoot || real.startsWith(`${vaultRoot}${path.sep}`)) continue;
            }
            fs.unlinkSync(file);
        } catch {
            /* ignore */
        }
    }

    // Remove empty locale dirs and docs root if we created them.
    for (const rel of ['en', '']) {
        const dir = rel ? path.join(LINKED_DOCS, rel) : LINKED_DOCS;
        try {
            if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
                fs.rmdirSync(dir);
            }
        } catch {
            /* ignore */
        }
    }

    if (staged.length) {
        console.log('🧹 Cleaned staged splash MDX from src/content/docs');
    }
}

/** @returns {boolean} */
export function hasStagedSplashMdx() {
    if (isDocsLinkedToVault()) return false;
    return fs.existsSync(path.join(LINKED_DOCS, 'index.mdx'));
}
