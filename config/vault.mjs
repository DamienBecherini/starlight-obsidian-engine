// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Engine repository root (parent of config/). Falls back to cwd when bundled for SSR. */
function detectProjectRoot() {
    const fromModule = path.resolve(__dirname, '..');
    if (fs.existsSync(path.join(fromModule, 'astro.config.mjs'))) {
        return fromModule;
    }
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'astro.config.mjs'))) {
        return cwd;
    }
    return fromModule;
}

export const projectRoot = detectProjectRoot();

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');

loadEnvFile(projectRoot);

/**
 * Reads --vault=<name> (or --vault <name>) from process.argv at module load time.
 * Looks up VAULT_<name> in the engine .env registry, then overwrites VAULT_PATH and
 * sets FORCE_VAULT_PATH=1 so every child process (including `npm run build`) inherits
 * the correct vault without any file mutation.
 * The flag is stripped from argv before downstream arg parsers run.
 */
function resolveVaultFromArg() {
    let name = null;
    const eqIdx = process.argv.findIndex((a) => a.startsWith('--vault='));
    if (eqIdx !== -1) {
        name = process.argv[eqIdx].split('=')[1];
        process.argv.splice(eqIdx, 1);
    } else {
        const spaceIdx = process.argv.indexOf('--vault');
        if (spaceIdx !== -1 && process.argv[spaceIdx + 1]) {
            name = process.argv[spaceIdx + 1];
            process.argv.splice(spaceIdx, 2);
        }
    }
    if (!name) return;

    const key = `VAULT_${name}`;
    const raw = process.env[key];
    if (!raw) {
        const registered = Object.keys(process.env)
            .filter((k) => k.startsWith('VAULT_') && k !== 'VAULT_PATH')
            .map((k) => k.replace(/^VAULT_/, ''));
        console.error(`❌ Unknown vault "${name}". Add ${key}=<path> to engine .env`);
        if (registered.length) console.error(`   Registered vaults: ${registered.join(', ')}`);
        process.exit(1);
    }
    const abs = path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
    process.env.VAULT_PATH = abs;
    process.env.FORCE_VAULT_PATH = '1';
    process.env.VAULT_SLUG = name;
}
resolveVaultFromArg();

/**
 * Short vault name for dist/ output and logging.
 * Priority: VAULT_SLUG env → registry reverse-lookup → folder basename (strip trailing -vault).
 * @returns {string}
 */
export function resolveVaultSlug() {
    const slug = process.env.VAULT_SLUG?.trim();
    if (slug) return slug;

    const vaultPath = resolveVaultGitRoot();
    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith('VAULT_') || key === 'VAULT_PATH' || !value?.trim()) continue;
        const raw = value.trim();
        const abs = path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
        let resolved = abs;
        try {
            resolved = fs.realpathSync(abs);
        } catch {
            /* keep abs */
        }
        let candidate = vaultPath;
        try {
            candidate = fs.realpathSync(vaultPath);
        } catch {
            /* keep vaultPath */
        }
        if (path.normalize(resolved) === path.normalize(candidate)) {
            return key.replace(/^VAULT_/, '');
        }
    }

    const base = path.basename(vaultPath);
    return base.replace(/-vault$/i, '') || base;
}

/**
 * Astro outDir value (relative to engine root unless absolute).
 * @returns {string}
 */
export function resolveAstroOutDir() {
    const explicit = process.env.ASTRO_OUT_DIR?.trim();
    if (explicit) return explicit;
    return path.join('dist', resolveVaultSlug()).split(path.sep).join('/');
}

/**
 * Absolute path to the build output directory for the active vault.
 * @returns {string}
 */
export function resolveDistDir() {
    const outDir = resolveAstroOutDir();
    return path.isAbsolute(outDir) ? outDir : path.resolve(projectRoot, outDir);
}

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

    // Prefer the junction only when it actually points at the configured vault.
    if (env && isDocsLinkedToVault(env)) {
        return LINKED_DOCS;
    }

    if (env) {
        return env;
    }

    if (hasMarkdownFiles(LINKED_DOCS)) {
        return LINKED_DOCS;
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
 * True when `src/content/docs` is a junction/symlink pointing to the active vault
 * (or literally IS the vault path). Prevents staging/cleanup from touching vault files.
 * @param {string} [vaultPath]
 * @returns {boolean}
 */
export function isDocsLinkedToVault(vaultPath = resolveVaultPath()) {
    const linked = path.normalize(LINKED_DOCS);
    const normalized = path.normalize(vaultPath);
    if (normalized === linked) return true;
    try {
        if (fs.existsSync(linked)) {
            return fs.realpathSync(linked) === fs.realpathSync(vaultPath);
        }
    } catch {
        /* fall through */
    }
    return false;
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
