// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Engine repository root (parent of config/). */
export const projectRoot = path.resolve(__dirname, '..');

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');

loadEnvFile(projectRoot);

/**
 * Absolute path defined by VAULT_PATH (.env or environment variable), or null.
 * @returns {string | null}
 */
export function envVaultPath() {
    const env = process.env.VAULT_PATH?.trim();
    if (!env) return null;
    return path.isAbsolute(env) ? env : path.resolve(projectRoot, env);
}

/**
 * When true, `VAULT_PATH` wins over the `src/content/docs` junction (smoke tests, CI fixtures).
 * Set `FORCE_VAULT_PATH=1` together with `VAULT_PATH`.
 * @returns {boolean}
 */
export function forceVaultPathFromEnv() {
    const raw = process.env.FORCE_VAULT_PATH?.trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * Resolves the absolute path of the Obsidian vault.
 * Priority: (1) `VAULT_PATH` when `FORCE_VAULT_PATH=1` → (2) junction/content under
 * `src/content/docs` → (3) `VAULT_PATH` → (4) fallback `src/content/docs`
 * @returns {string}
 */
export function resolveVaultPath() {
    const env = envVaultPath();
    if (env && forceVaultPathFromEnv()) {
        return env;
    }

    if (hasMarkdownFiles(LINKED_DOCS)) {
        return LINKED_DOCS;
    }

    if (env) {
        return env;
    }

    return LINKED_DOCS;
}

/**
 * Absolute vault root for `.env`, `.gitignore`, and git operations.
 * Resolves junctions/symlinks to the real vault directory.
 * @returns {string}
 */
export function resolveVaultGitRoot() {
    const env = envVaultPath();
    if (env && forceVaultPathFromEnv()) {
        try {
            return fs.realpathSync(env);
        } catch {
            return env;
        }
    }

    const candidate = env ?? resolveVaultPath();
    try {
        const stat = fs.lstatSync(candidate);
        if (stat.isSymbolicLink()) {
            return fs.realpathSync(candidate);
        }
    } catch {
        /* fall through */
    }
    try {
        return fs.realpathSync(candidate);
    } catch {
        return candidate;
    }
}

/**
 * @param {string} dir
 * @returns {boolean}
 */
function hasMarkdownFiles(dir) {
    if (!fs.existsSync(dir)) return false;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (
                entry.isFile() &&
                /\.(md|mdx)$/i.test(entry.name) &&
                !entry.name.startsWith('_') &&
                entry.name.toLowerCase() !== 'readme.md'
            ) {
                return true;
            }
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                if (hasMarkdownFiles(full)) return true;
            }
        }
    } catch {
        return false;
    }
    return false;
}
