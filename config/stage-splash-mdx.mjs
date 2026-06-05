// @ts-check
/**
 * Copies vault splash MDX pages (index.mdx per locale) into src/content/docs
 * so Starlight's MDX pipeline resolves @astrojs/starlight/components correctly.
 * Only root splash files are copied — all .md content still loads from the vault via glob.
 */
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, resolveVaultPath } from './vault.mjs';

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');

/** Relative splash paths copied from the vault. */
const SPLASH_REL_PATHS = ['index.mdx', 'en/index.mdx'];

/**
 * @returns {string[]} Absolute paths of staged files (for cleanup).
 */
export function stageVaultSplashMdx() {
    const vaultPath = resolveVaultPath();
    /** @type {string[]} */
    const staged = [];

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
    for (const file of staged) {
        try {
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
    return fs.existsSync(path.join(LINKED_DOCS, 'index.mdx'));
}
