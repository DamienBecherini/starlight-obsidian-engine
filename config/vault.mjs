// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Racine du dépôt moteur (parent de config/). */
export const projectRoot = path.resolve(__dirname, '..');

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');

/**
 * Charge .env dans process.env (sans dépendance) car Node ne le fait pas pour les
 * scripts predev/prebuild. Ne remplace jamais une variable déjà définie.
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
 * Chemin absolu défini par VAULT_PATH (.env ou variable d'environnement), ou null.
 * @returns {string | null}
 */
export function envVaultPath() {
    const env = process.env.VAULT_PATH?.trim();
    if (!env) return null;
    return path.isAbsolute(env) ? env : path.resolve(projectRoot, env);
}

/**
 * Résout le chemin absolu du vault Obsidian.
 * Priorité : (1) junction/contenu sous src/content/docs → (2) VAULT_PATH → (3) fallback src/content/docs
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
