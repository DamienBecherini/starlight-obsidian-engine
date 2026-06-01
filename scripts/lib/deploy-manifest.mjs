// @ts-check
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { resolveVaultGitRoot } from '../../config/vault.mjs';

export const MANIFEST_VERSION = 1;
export const MANIFEST_FILENAME = '.deploy-manifest.json';

/** @typedef {{ sha256: string, size: number }} ManifestEntry */
/** @typedef {{
 *   version: number,
 *   deployKey: string,
 *   updatedAt: string,
 *   files: Record<string, ManifestEntry>,
 * }} DeployManifest */

/** @typedef {{
 *   protocol: string,
 *   host: string,
 *   port: number,
 *   remotePath: string,
 * }} DeployKeyInput */

/** @typedef {{
 *   local: Map<string, ManifestEntry>,
 *   toUpload: { rel: string, abs: string, entry: ManifestEntry }[],
 *   toDelete: string[],
 *   unchanged: number,
 * }} ManifestDiff */

/** Files/dirs starting with `.` are never tracked. */
const isHidden = (name) => name.startsWith('.');

/**
 * @param {DeployKeyInput} config
 * @returns {string}
 */
export function buildDeployKey(config) {
    const remote = config.remotePath.replace(/\/+$/, '') || '/';
    return `${config.protocol}|${config.host}|${config.port}|${remote}`;
}

/**
 * @param {string} [vaultRoot]
 * @returns {string}
 */
export function manifestPath(vaultRoot = resolveVaultGitRoot()) {
    return path.join(vaultRoot, MANIFEST_FILENAME);
}

/**
 * @param {string} absPath
 * @returns {Promise<ManifestEntry>}
 */
export function hashDistFile(absPath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(absPath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => {
            resolve({
                sha256: hash.digest('hex'),
                size: fs.statSync(absPath).size,
            });
        });
        stream.on('error', reject);
    });
}

/**
 * @param {string} distDir
 * @param {(done: number, total: number, rel: string) => void} [onProgress]
 * @returns {Promise<Map<string, ManifestEntry>>}
 */
export async function hashDistTree(distDir, onProgress) {
    /** @type {{ rel: string, abs: string }[]} */
    const paths = [];
    /** @param {string} dir @param {string} rel */
    const walk = (dir, rel) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (isHidden(entry.name)) continue;
            const abs = path.join(dir, entry.name);
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(abs, relPath);
            else if (entry.isFile()) paths.push({ rel: relPath, abs });
        }
    };
    walk(distDir, '');
    /** @type {Map<string, ManifestEntry>} */
    const local = new Map();
    let done = 0;
    for (const { rel, abs } of paths) {
        local.set(rel, await hashDistFile(abs));
        done += 1;
        onProgress?.(done, paths.length, rel);
    }
    return local;
}

/**
 * @param {string | null} vaultRoot
 * @returns {DeployManifest | null}
 */
export function loadManifest(vaultRoot = resolveVaultGitRoot()) {
    const filePath = manifestPath(vaultRoot);
    if (!fs.existsSync(filePath)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!raw || typeof raw !== 'object' || !raw.files) return null;
        return /** @type {DeployManifest} */ (raw);
    } catch {
        return null;
    }
}

/**
 * Replace dest from tmp; Windows often returns EPERM on rename-over-open files.
 * @param {string} destPath
 * @param {string} tmpPath
 */
function replaceFileFromTmp(destPath, tmpPath) {
    try {
        fs.renameSync(tmpPath, destPath);
        return;
    } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
        if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY' && code !== 'EXDEV') {
            throw err;
        }
    }
    try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        fs.renameSync(tmpPath, destPath);
        return;
    } catch {
        /* fall through */
    }
    fs.copyFileSync(tmpPath, destPath);
    try {
        fs.unlinkSync(tmpPath);
    } catch {
        /* ignore orphan tmp */
    }
}

/**
 * @param {DeployManifest} manifest
 * @param {string} [vaultRoot]
 */
export function saveManifest(manifest, vaultRoot = resolveVaultGitRoot()) {
    const filePath = manifestPath(vaultRoot);
    const tmpPath = `${filePath}.tmp`;
    manifest.updatedAt = new Date().toISOString();
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(tmpPath, body, 'utf8');
    try {
        replaceFileFromTmp(filePath, tmpPath);
    } catch (err) {
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
            /* ignore */
        }
        fs.writeFileSync(filePath, body, 'utf8');
        if (err instanceof Error) throw err;
        throw err;
    }
}

/**
 * @param {DeployKeyInput} config
 * @returns {DeployManifest}
 */
export function emptyManifest(config) {
    return {
        version: MANIFEST_VERSION,
        deployKey: buildDeployKey(config),
        updatedAt: new Date().toISOString(),
        files: {},
    };
}

/**
 * @param {DeployManifest | null} manifest
 * @param {DeployKeyInput} config
 * @returns {DeployManifest}
 */
export function ensureManifest(manifest, config) {
    const key = buildDeployKey(config);
    if (!manifest || manifest.deployKey !== key) {
        if (manifest && manifest.deployKey !== key) {
            console.warn(
                '⚠️  Deploy manifest target mismatch (host/path changed). Starting fresh manifest for this target.',
            );
        }
        return emptyManifest(config);
    }
    return manifest;
}

/**
 * @param {Map<string, ManifestEntry>} local
 * @param {DeployManifest} manifest
 * @returns {ManifestDiff}
 */
export function diffDistAgainstManifest(local, manifest) {
    /** @type {ManifestDiff['toUpload']} */
    const toUpload = [];
    const manifestFiles = manifest.files ?? {};

    for (const [rel, entry] of local) {
        const prev = manifestFiles[rel];
        if (!prev || prev.sha256 !== entry.sha256 || prev.size !== entry.size) {
            toUpload.push({ rel, abs: '', entry });
        }
    }

    /** @type {string[]} */
    const toDelete = [];
    for (const rel of Object.keys(manifestFiles)) {
        if (!local.has(rel)) toDelete.push(rel);
    }
    toDelete.sort();

    const unchanged = local.size - toUpload.length;
    return { local, toUpload, toDelete, unchanged };
}

/**
 * @param {string} distDir
 * @param {ManifestDiff} diff
 */
export function attachUploadAbsPaths(distDir, diff) {
    for (const item of diff.toUpload) {
        item.abs = path.join(distDir, item.rel);
    }
}

/**
 * @param {DeployManifest} manifest
 * @param {string} rel
 * @param {ManifestEntry} entry
 * @param {string} [vaultRoot]
 * @param {{ persist?: boolean }} [options]
 */
export function markUploaded(manifest, rel, entry, vaultRoot, options = {}) {
    manifest.files[rel] = entry;
    if (options.persist !== false) saveManifest(manifest, vaultRoot);
}

/**
 * @param {DeployManifest} manifest
 * @param {string} rel
 * @param {string} [vaultRoot]
 * @param {{ persist?: boolean }} [options]
 */
export function markDeleted(manifest, rel, vaultRoot, options = {}) {
    delete manifest.files[rel];
    if (options.persist !== false) saveManifest(manifest, vaultRoot);
}

/**
 * @param {DeployKeyInput} config
 * @param {Map<string, ManifestEntry>} local
 * @param {string} [vaultRoot]
 * @returns {DeployManifest}
 */
export function manifestFromLocal(config, local, vaultRoot) {
    /** @type {Record<string, ManifestEntry>} */
    const files = {};
    for (const [rel, entry] of local) {
        files[rel] = entry;
    }
    const manifest = emptyManifest(config);
    manifest.files = files;
    saveManifest(manifest, vaultRoot);
    return manifest;
}

/**
 * @param {string} distDir
 * @param {DeployKeyInput} config
 * @param {(done: number, total: number, rel: string) => void} [onProgress]
 * @returns {Promise<{ manifest: DeployManifest, diff: ManifestDiff }>}
 */
export async function planIncrementalDeploy(distDir, config, onProgress) {
    const local = await hashDistTree(distDir, onProgress);
    const manifest = ensureManifest(loadManifest(), config);
    const diff = diffDistAgainstManifest(local, manifest);
    attachUploadAbsPaths(distDir, diff);
    return { manifest, diff };
}
