// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Engine repository root (parent of config/). */
export const projectRoot = path.resolve(__dirname, '..');

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');

/**
 * Loads .env into process.env (no dependency) because Node does not do it for the
 * predev/prebuild scripts. Never overrides an already-defined variable.
 */
function loadEnvFile() {
    const envPath = path.join(projectRoot, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (!match || line.trimStart().startsWith('#')) continue;
        const key = match[1];
        const value = match[2].replace(/^["']|["']$/g, '').trim();
        if (process.env[key] === undefined) process.env[key] = value;
    }
}
loadEnvFile();

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
 * Resolves the absolute path of the Obsidian vault.
 * Priority: (1) junction/content under src/content/docs → (2) VAULT_PATH → (3) fallback src/content/docs
 * @returns {string}
 */
export function resolveVaultPath() {
    if (hasMarkdownFiles(LINKED_DOCS)) {
        return LINKED_DOCS;
    }

    const env = envVaultPath();
    if (env) {
        return env;
    }

    return LINKED_DOCS;
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
