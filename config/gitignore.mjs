// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';

/** Vault folder for confidential notes — never published, even if negated in `.gitignore`. */
const PRIVATE_PREFIX = '_private/';

/**
 * Loads the vault root `.gitignore` into a matcher function.
 * @param {string} vaultRoot Absolute path to the vault repository root.
 * @returns {(vaultRelativePosixPath: string) => boolean}
 */
export function loadVaultGitignore(vaultRoot) {
    const ig = ignore();
    const gitignorePath = path.join(vaultRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        ig.add(fs.readFileSync(gitignorePath, 'utf-8'));
    }

    return (vaultRelativePosixPath) => {
        if (!vaultRelativePosixPath) return false;
        if (vaultRelativePosixPath === '_private' || vaultRelativePosixPath.startsWith(PRIVATE_PREFIX)) {
            return true;
        }
        return ig.ignores(vaultRelativePosixPath);
    };
}

/**
 * Maps an Astro content entry path (relative to the engine root) to a vault-relative POSIX path.
 * @param {string | undefined} entryFilePath
 * @param {string} engineRoot
 * @param {string} vaultRoot
 * @returns {string | null} Null when the entry is outside the vault.
 */
export function entryPathToVaultRelative(entryFilePath, engineRoot, vaultRoot) {
    if (!entryFilePath) return null;

    let vaultAbs;
    try {
        vaultAbs = fs.realpathSync(vaultRoot);
    } catch {
        vaultAbs = path.resolve(vaultRoot);
    }

    let abs;
    try {
        abs = fs.realpathSync(path.resolve(engineRoot, entryFilePath));
    } catch {
        abs = path.resolve(engineRoot, entryFilePath);
    }

    const rel = path.relative(vaultAbs, abs).split(path.sep).join('/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel;
}
