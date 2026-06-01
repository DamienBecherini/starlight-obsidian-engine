// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { loadEnvFile } from '../../config/env.mjs';
import { projectRoot, resolveVaultGitRoot } from '../../config/vault.mjs';

export { resolveVaultGitRoot };
import { createUploadProgress, humanBytes } from './upload-progress.mjs';
import {
    planIncrementalDeploy,
    manifestFromLocal,
    hashDistTree,
    markUploaded,
    markDeleted,
    saveManifest,
} from './deploy-manifest.mjs';

/**
 * @typedef {'ftps' | 'sftp'} DeployProtocol
 * @typedef {{
 *   protocol: DeployProtocol,
 *   host: string,
 *   port: number,
 *   username: string,
 *   remotePath: string,
 *   password?: string,
 *   privateKey?: Buffer,
 *   passphrase?: string,
 *   ftpsInsecure?: boolean,
 *   protect?: string[],
 * }} DeployConfig
 */

/**
 * Mirror is on by default; `--no-mirror` / `--additive` disables remote deletion.
 * @param {string[]} argv
 * @returns {boolean}
 */
export function mirrorFromArgv(argv) {
    return !argv.some((a) => a === '--no-mirror' || a === '--additive');
}

/**
 * Whether to skip the human confirmation (`--yes` / `-y`).
 * @param {string[]} argv
 * @returns {boolean}
 */
export function assumeYesFromArgv(argv) {
    return argv.some((a) => a === '--yes' || a === '-y');
}

/**
 * Confirmation is requested when running in a terminal and `--yes` was not passed.
 * @param {string[]} argv
 * @returns {boolean}
 */
export function confirmFromArgv(argv) {
    return Boolean(process.stdin.isTTY) && !assumeYesFromArgv(argv);
}

/**
 * @param {string[]} argv
 * @returns {boolean}
 */
export function isFullDeployArgv(argv) {
    return argv.some((a) => a === '--full' || a === 'full' || a === '-full');
}

/**
 * Incremental manifest deploy is default; `--full` restores scan + upload all + mirror.
 * npm must receive script flags after `--` (e.g. `npm run upload -- --full`).
 * @param {string[]} argv
 * @returns {{ incremental: boolean }}
 */
export function deployModeFromArgv(argv) {
    return { incremental: !isFullDeployArgv(argv) };
}

/** Load deploy credentials from the vault `.env` (each vault may target a different host). */
export function loadVaultDeployEnv() {
    const vaultRoot = resolveVaultGitRoot();
    loadEnvFile(vaultRoot, { override: true });
    return vaultRoot;
}

export function runBuild() {
    console.log('\n🔨 Building static site…');
    const build = spawnSync('npm', ['run', 'build'], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
    });
    if (build.status !== 0) {
        console.error('❌ Build failed. Aborted.');
        process.exit(build.status ?? 1);
    }
}

/**
 * Loads the vault `.env` and validates deploy configuration up front (fail-fast).
 * @returns {DeployConfig}
 */
export function prepareDeployConfig() {
    const vaultRoot = loadVaultDeployEnv();
    return deployConfigFromEnv(vaultRoot);
}

/** @deprecated Use deployConfigFromEnv */
export function sftpConfigFromEnv(vaultRoot) {
    return deployConfigFromEnv(vaultRoot);
}

/**
 * @param {string} vaultRoot Vault directory (used to resolve relative key paths).
 * @returns {DeployConfig}
 */
export function deployConfigFromEnv(vaultRoot) {
    // Canonical names are DEPLOY_*; the legacy SFTP_* names are still accepted as a fallback.
    const pick = (name) =>
        process.env[`DEPLOY_${name}`]?.trim() ?? process.env[`SFTP_${name}`]?.trim();
    const host = pick('HOST');
    const user = pick('USER');
    const remotePath = pick('REMOTE_PATH');
    const portRaw = pick('PORT');
    const protocolRaw = process.env.DEPLOY_PROTOCOL?.trim().toLowerCase();

    /** @type {DeployProtocol} */
    let protocol;
    if (protocolRaw === 'ftps' || protocolRaw === 'sftp') {
        protocol = protocolRaw;
    } else if (protocolRaw) {
        console.error('❌ DEPLOY_PROTOCOL must be `ftps` or `sftp`.');
        process.exit(1);
    } else {
        const inferredPort = parseInt(portRaw || '22', 10);
        protocol = inferredPort === 21 ? 'ftps' : 'sftp';
    }

    const defaultPort = protocol === 'ftps' ? 21 : 22;
    const port = parseInt(portRaw || String(defaultPort), 10);

    if (!host || !user || !remotePath) {
        console.error(
            '❌ Deploy requires DEPLOY_HOST, DEPLOY_USER and DEPLOY_REMOTE_PATH in the vault .env file.',
        );
        console.error(`   Copy .env.example → .env in ${vaultRoot} and fill in the deploy section.`);
        process.exit(1);
    }

    const password = pick('PASSWORD');
    const keyPath = pick('PRIVATE_KEY_PATH');
    const passphrase = pick('PASSPHRASE');
    const ftpsInsecure = process.env.DEPLOY_FTPS_INSECURE?.trim().toLowerCase() === 'true';
    // Top-level remote entries never uploaded nor deleted by mirror (server-managed).
    // Default protects o2switch's cgi-bin; dotfiles (.well-known, .ftpquota, .htaccess) are always skipped.
    const protectRaw = process.env.DEPLOY_PROTECT?.trim();
    const protect = (protectRaw ? protectRaw.split(',') : ['cgi-bin'])
        .map((s) => s.trim())
        .filter(Boolean);

    /** @type {DeployConfig} */
    const config = { protocol, host, port, username: user, remotePath, ftpsInsecure, protect };

    if (protocol === 'ftps') {
        if (keyPath) {
            console.error('❌ FTPS deploy uses password auth only. Unset DEPLOY_PRIVATE_KEY_PATH or use DEPLOY_PROTOCOL=sftp.');
            process.exit(1);
        }
        if (!password) {
            console.error('❌ Set DEPLOY_PASSWORD for FTPS deploy.');
            process.exit(1);
        }
        config.password = password;
        return config;
    }

    if (keyPath) {
        const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(vaultRoot, keyPath);
        if (!fs.existsSync(resolved)) {
            console.error(`❌ SFTP private key not found: ${resolved}`);
            process.exit(1);
        }
        config.privateKey = fs.readFileSync(resolved);
        if (passphrase) config.passphrase = passphrase;
    } else if (password) {
        config.password = password;
    } else {
        console.error('❌ Set DEPLOY_PASSWORD or DEPLOY_PRIVATE_KEY_PATH for SFTP deploy.');
        process.exit(1);
    }

    return config;
}

/** Files/dirs starting with `.` are never uploaded nor deleted (protects server-side `.htaccess`, etc.). */
const isHidden = (name) => name.startsWith('.');

/**
 * Builds the set of relative POSIX paths that the upload produces (mirrors the upload filter).
 * @param {string} distDir
 * @returns {Set<string>}
 */
function listLocalFiles(distDir) {
    /** @type {Set<string>} */
    const files = new Set();
    /** @param {string} dir @param {string} rel */
    const walk = (dir, rel) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (isHidden(entry.name)) continue;
            const abs = path.join(dir, entry.name);
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(abs, relPath);
            else if (entry.isFile()) files.add(relPath);
        }
    };
    walk(distDir, '');
    return files;
}

/** @param {string} dir @returns {number} */
function countLocalFiles(dir) {
    let total = 0;
    /** @param {string} d */
    const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (isHidden(entry.name)) continue;
            const abs = path.join(d, entry.name);
            if (entry.isDirectory()) walk(abs);
            else if (entry.isFile()) total += 1;
        }
    };
    walk(dir);
    return total;
}

/** @param {string} dir @returns {boolean} */
function isFlatLocalDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (isHidden(entry.name)) continue;
        if (entry.isDirectory()) return false;
    }
    return true;
}

/** @param {DeployConfig} config */
function ftpsAccessOptions(config) {
    return {
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        secure: true,
        secureOptions: config.ftpsInsecure ? { rejectUnauthorized: false } : undefined,
    };
}

/** @param {unknown} error */
function isFtpsTransientError(error) {
    const err = error instanceof Error ? error : null;
    if (!err) return false;
    const code = 'code' in err && typeof err.code === 'string' ? err.code : '';
    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' || code === 'ECONNABORTED') {
        return true;
    }
    const msg = err.message.toLowerCase();
    return msg.includes('econnreset') || msg.includes('control socket') || msg.includes('timeout');
}

/**
 * Sums the byte size of every file the upload will transfer (mirrors the upload filter).
 * @param {string} distDir
 * @returns {number}
 */
function sumLocalBytes(distDir) {
    let total = 0;
    /** @param {string} dir */
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (isHidden(entry.name)) continue;
            const abs = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(abs);
            else if (entry.isFile()) total += fs.statSync(abs).size;
        }
    };
    walk(distDir);
    return total;
}

/**
 * @param {string} question
 * @returns {Promise<boolean>}
 */
async function confirm(question) {
    const rl = readline.createInterface({ input, output });
    try {
        const answer = (await rl.question(question)).trim().toLowerCase();
        return answer === 'y' || answer === 'yes';
    } finally {
        rl.close();
    }
}

/**
 * Prints a preview of the planned changes against the remote.
 * @param {string[]} created
 * @param {number} overwritten
 * @param {string[]} deletions
 * @param {boolean} mirror
 */
function printPreview(created, overwritten, deletions, mirror) {
    const SAMPLE = 50;
    console.log('\n📋 Planned changes:');
    console.log(`   + new:        ${created.length} file(s)`);
    console.log(`   ~ overwrite:  ${overwritten} file(s)`);
    if (mirror) {
        console.log(`   − delete:     ${deletions.length} file(s) (mirror)`);
        for (const f of deletions.slice(0, SAMPLE)) console.log(`       − ${f}`);
        if (deletions.length > SAMPLE) {
            console.log(`       … and ${deletions.length - SAMPLE} more`);
        }
    } else {
        console.log('   − delete:     0 (mirror disabled, remote-only files kept)');
    }
}

/**
 * @param {import('./deploy-manifest.mjs').ManifestDiff} diff
 * @param {boolean} deleteEnabled
 */
function printIncrementalPreview(diff, deleteEnabled) {
    const SAMPLE = 50;
    const uploadRels = diff.toUpload.map((u) => u.rel);
    const uploadBytes = diff.toUpload.reduce((s, u) => s + u.entry.size, 0);
    console.log('\n📋 Planned changes (incremental, local manifest):');
    console.log(`   + upload:     ${uploadRels.length} file(s) (${humanBytes(uploadBytes)})`);
    console.log(`   ~ skip:       ${diff.unchanged} unchanged`);
    if (deleteEnabled) {
        console.log(`   − delete:     ${diff.toDelete.length} obsolete remote file(s)`);
        for (const f of diff.toDelete.slice(0, SAMPLE)) console.log(`       − ${f}`);
        if (diff.toDelete.length > SAMPLE) {
            console.log(`       … and ${diff.toDelete.length - SAMPLE} more`);
        }
    } else {
        console.log('   − delete:     0 (--no-mirror: obsolete remote files kept)');
    }
}

/**
 * @param {string} normalizedRemote
 * @param {string} rel
 */
function sftpRemotePath(normalizedRemote, rel) {
    const base = normalizedRemote.replace(/\/+$/, '');
    return base ? `${base}/${rel}` : rel;
}

/**
 * @param {SftpClient} sftp
 * @param {string} normalizedRemote
 * @param {string} rel
 */
async function ensureSftpDirs(sftp, normalizedRemote, rel) {
    const parent = path.posix.dirname(rel);
    if (parent === '.') return;
    const parts = parent.split('/');
    let built = normalizedRemote.replace(/\/+$/, '');
    for (const part of parts) {
        built = built ? `${built}/${part}` : part;
        try {
            await sftp.mkdir(built, true);
        } catch {
            /* exists */
        }
    }
}

/**
 * @param {SftpClient} sftp
 * @param {string} normalizedRemote
 * @param {import('./deploy-manifest.mjs').ManifestDiff['toUpload']} uploads
 * @param {import('./deploy-manifest.mjs').DeployManifest} manifest
 * @param {{ lastFile: string, bytesOverall: number, fileOrdinal: number }} transferState
 */
async function uploadSelectedFilesSftp(sftp, normalizedRemote, uploads, manifest, transferState) {
    const vaultRoot = resolveVaultGitRoot();
    const progress = createUploadProgress({ totalFiles: uploads.length });
    let done = 0;
    for (const { rel, abs, entry } of uploads) {
        await ensureSftpDirs(sftp, normalizedRemote, rel);
        await sftp.put(abs, sftpRemotePath(normalizedRemote, rel));
        markUploaded(manifest, rel, entry, vaultRoot, { persist: false });
        done += 1;
        transferState.fileOrdinal = done;
        transferState.lastFile = path.basename(rel);
        progress.onFile(done, rel);
    }
    progress.finish();
    saveManifest(manifest, vaultRoot);
}

/**
 * @param {SftpClient} sftp
 * @param {string} normalizedRemote
 * @param {string[]} relPaths
 * @param {Set<string>} protect
 * @param {import('./deploy-manifest.mjs').DeployManifest} manifest
 */
async function deleteRemoteFilesSftp(sftp, normalizedRemote, relPaths, protect, manifest) {
    const vaultRoot = resolveVaultGitRoot();
    for (const rel of relPaths) {
        if (isProtectedRel(rel, protect)) continue;
        await sftp.delete(sftpRemotePath(normalizedRemote, rel));
        markDeleted(manifest, rel, vaultRoot, { persist: false });
        console.log(`  − ${rel}`);
    }
    saveManifest(manifest, vaultRoot);
}

/**
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 */
async function uploadDistSftpFull(config, distDir, mirror, askConfirm) {
    const normalizedRemote = config.remotePath.replace(/\/+$/, '');
    const mirrorActive = mirror && Boolean(normalizedRemote);
    const localFiles = listLocalFiles(distDir);
    const sftp = new SftpClient();
    const connectOptions = {
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
    };

    try {
        await sftp.connect(connectOptions);

        if (askConfirm || mirrorActive) {
            const remoteFiles = normalizedRemote
                ? await listRemoteFilesSftp(sftp, normalizedRemote)
                : new Set();
            const created = [...localFiles].filter((f) => !remoteFiles.has(f));
            const overwritten = localFiles.size - created.length;
            const deletions = mirrorActive
                ? [...remoteFiles].filter((f) => !localFiles.has(f)).sort()
                : [];

            console.log(`\nTarget: sftp://${config.host}:${config.port}${config.remotePath}`);
            printPreview(created, overwritten, deletions, mirrorActive);

            if (askConfirm) {
                const ok = await confirm('\nProceed with upload? (y/N) ');
                if (!ok) {
                    console.log('Upload cancelled.');
                    await sftp.end();
                    process.exit(0);
                }
            }
        }

        console.log(`\n🚀 Full upload dist/ → sftp://${config.host}:${config.port}${config.remotePath} …`);
        const progress = createUploadProgress({ totalFiles: localFiles.size });
        let uploaded = 0;
        /** @param {{ source: string }} info */
        const onUpload = (info) => {
            uploaded += 1;
            progress.onFile(uploaded, path.basename(info.source));
        };
        sftp.on('upload', onUpload);
        try {
            await sftp.uploadDir(distDir, config.remotePath, {
                filter: (itemPath) => !isHidden(path.basename(itemPath)),
            });
        } finally {
            sftp.removeListener('upload', onUpload);
            progress.finish();
        }
        console.log('✅ Upload complete.');

        if (mirrorActive) {
            console.log('\n🧹 Mirror: removing remote files not present locally…');
            await mirrorRemoteSftp(sftp, normalizedRemote, localFiles);
            console.log('✅ Mirror complete.');
        } else if (!mirror) {
            console.log('ℹ️  Mirror disabled (--no-mirror): remote-only files were kept.');
        }

        console.log('\n📝 Refreshing deploy manifest from dist/…');
        const local = await hashDistTree(distDir);
        manifestFromLocal(config, local);
        console.log('✅ Manifest updated.');
    } catch (error) {
        console.error('❌ SFTP upload failed:', error);
        process.exit(1);
    } finally {
        await sftp.end();
    }
}

/**
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 */
async function uploadDistSftpIncremental(config, distDir, mirror, askConfirm) {
    const normalizedRemote = config.remotePath.replace(/\/+$/, '');
    const deleteEnabled = mirror && Boolean(normalizedRemote);
    const protect = new Set(config.protect ?? []);
    const sftp = new SftpClient();
    /** @type {{ lastFile: string, bytesOverall: number, fileOrdinal: number }} */
    const transferState = { lastFile: '', bytesOverall: 0, fileOrdinal: 0 };

    try {
        console.log('\n🔍 Incremental deploy (local manifest)…');
        const { manifest, diff } = await planIncrementalDeploy(distDir, config, (done, total, rel) => {
            if (done === 1 || done === total || done % 50 === 0) {
                process.stdout.write(`\r   Hashing dist/ … ${done}/${total}  ${rel.slice(-40).padStart(40)}`);
            }
        });
        if (process.stdout.isTTY) process.stdout.write('\n');

        await sftp.connect({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            privateKey: config.privateKey,
            passphrase: config.passphrase,
        });

        console.log(`\nTarget: sftp://${config.host}:${config.port}${config.remotePath}`);
        if (protect.size) console.log(`Protected (never touched): ${[...protect].join(', ')}, dotfiles`);
        printIncrementalPreview(diff, deleteEnabled);

        if (!diff.toUpload.length && (!deleteEnabled || !diff.toDelete.length)) {
            console.log('\n✅ Nothing to deploy — dist/ matches the last successful manifest.');
            return;
        }

        if (askConfirm) {
            const ok = await confirm('\nProceed with upload? (y/N) ');
            if (!ok) {
                console.log('Upload cancelled.');
                return;
            }
        }

        if (diff.toUpload.length) {
            const uploadBytes = diff.toUpload.reduce((s, u) => s + u.entry.size, 0);
            console.log(
                `\n🚀 Uploading ${diff.toUpload.length} file(s) (${humanBytes(uploadBytes)}) → sftp://${config.host}:${config.port} …`,
            );
            await uploadSelectedFilesSftp(sftp, normalizedRemote, diff.toUpload, manifest, transferState);
            console.log('✅ Upload complete.');
        }

        if (deleteEnabled && diff.toDelete.length) {
            console.log(`\n🧹 Removing ${diff.toDelete.length} obsolete remote file(s)…`);
            await deleteRemoteFilesSftp(sftp, normalizedRemote, diff.toDelete, protect, manifest);
            console.log('✅ Cleanup complete.');
        } else if (!deleteEnabled && diff.toDelete.length) {
            console.log(
                `ℹ️  ${diff.toDelete.length} obsolete remote file(s) kept (--no-mirror). Use default mirror or --full to clean up.`,
            );
        }
    } catch (error) {
        console.error('❌ SFTP upload failed:', error);
        process.exit(1);
    } finally {
        await sftp.end();
    }
}

/**
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 * @param {boolean} incremental
 */
async function uploadDistSftp(config, distDir, mirror, askConfirm, incremental) {
    if (incremental) {
        await uploadDistSftpIncremental(config, distDir, mirror, askConfirm);
    } else {
        await uploadDistSftpFull(config, distDir, mirror, askConfirm);
    }
}

/**
 * Recursively lists remote files (relative POSIX paths), skipping dotfiles/dirs.
 * @param {SftpClient} sftp
 * @param {string} remoteRoot Normalized remote path (no trailing slash).
 * @returns {Promise<Set<string>>}
 */
async function listRemoteFilesSftp(sftp, remoteRoot) {
    /** @type {Set<string>} */
    const files = new Set();
    if (!(await sftp.exists(remoteRoot))) return files;
    /** @param {string} dir @param {string} rel */
    const walk = async (dir, rel) => {
        for (const entry of await sftp.list(dir)) {
            if (isHidden(entry.name)) continue;
            const remotePath = `${dir}/${entry.name}`;
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.type === 'd') await walk(remotePath, relPath);
            else if (entry.type === '-') files.add(relPath);
        }
    };
    await walk(remoteRoot, '');
    return files;
}

/**
 * @param {SftpClient} sftp
 * @param {string} remoteRoot
 * @param {Set<string>} localFiles
 */
async function mirrorRemoteSftp(sftp, remoteRoot, localFiles) {
    /** @param {string} remoteDir @param {string} rel */
    const walk = async (remoteDir, rel) => {
        const entries = await sftp.list(remoteDir);
        for (const entry of entries) {
            if (isHidden(entry.name)) continue;
            const remotePath = `${remoteDir}/${entry.name}`;
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.type === 'd') {
                await walk(remotePath, relPath);
                const remaining = (await sftp.list(remotePath)).filter((e) => !isHidden(e.name));
                if (remaining.length === 0) {
                    await sftp.rmdir(remotePath);
                    console.log(`  − ${relPath}/`);
                }
            } else if (entry.type === '-' && !localFiles.has(relPath)) {
                await sftp.delete(remotePath);
                console.log(`  − ${relPath}`);
            }
        }
    };
    await walk(remoteRoot, '');
}

/**
 * Builds the absolute remote child path, avoiding `//` when the base is `/`.
 * @param {string} dir @param {string} name
 */
const joinRemote = (dir, name) => (dir === '/' ? `/${name}` : `${dir}/${name}`);

/**
 * @param {FtpClient} client
 * @param {string} remoteRoot Absolute remote base (e.g. `/` or `/sub`).
 * @param {Set<string>} protect Top-level names to skip.
 * @returns {Promise<Set<string>>}
 */
async function listRemoteFilesFtps(client, remoteRoot, protect) {
    /** @type {Set<string>} */
    const files = new Set();
    /** @param {string} dir @param {string} rel */
    const walk = async (dir, rel) => {
        let entries;
        try {
            entries = await client.list(dir);
        } catch {
            return;
        }
        for (const entry of entries) {
            if (isHidden(entry.name)) continue;
            if (rel === '' && protect.has(entry.name)) continue;
            const remotePath = joinRemote(dir, entry.name);
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory) await walk(remotePath, relPath);
            else if (entry.isFile) files.add(relPath);
        }
    };
    await walk(remoteRoot, '');
    return files;
}

/**
 * @param {FtpClient} client
 * @param {string} remoteRoot Absolute remote base.
 * @param {Set<string>} localFiles
 * @param {Set<string>} protect Top-level names never deleted.
 */
async function mirrorRemoteFtps(client, remoteRoot, localFiles, protect) {
    /** @type {string[]} */
    const pendingDeletes = [];
    /** @param {string} remoteDir @param {string} rel */
    const collect = async (remoteDir, rel) => {
        let entries;
        try {
            entries = await client.list(remoteDir);
        } catch {
            return;
        }
        for (const entry of entries) {
            if (isHidden(entry.name)) continue;
            if (rel === '' && protect.has(entry.name)) continue;
            const remotePath = joinRemote(remoteDir, entry.name);
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory) await collect(remotePath, relPath);
            else if (entry.isFile && !localFiles.has(relPath)) pendingDeletes.push(relPath);
        }
    };
    console.log('   Scanning remote tree (FTP listings, may take a minute)…');
    await collect(remoteRoot, '');
    if (!pendingDeletes.length) return;
    console.log(`   Removing ${pendingDeletes.length} obsolete file(s)…`);
    let removed = 0;
    for (const relPath of pendingDeletes.sort()) {
        const remotePath = joinRemote(remoteRoot, relPath);
        await client.remove(remotePath);
        removed += 1;
        console.log(`  − ${relPath}`);
        if (removed % 20 === 0 && removed < pendingDeletes.length) {
            console.log(`   … ${removed} / ${pendingDeletes.length} removed`);
        }
    }
    /** @param {string} remoteDir @param {string} rel */
    const pruneEmptyDirs = async (remoteDir, rel) => {
        let entries;
        try {
            entries = await client.list(remoteDir);
        } catch {
            return;
        }
        for (const entry of entries) {
            if (isHidden(entry.name)) continue;
            if (rel === '' && protect.has(entry.name)) continue;
            const remotePath = joinRemote(remoteDir, entry.name);
            const relPath = rel ? `${rel}/${entry.name}` : entry.name;
            if (!entry.isDirectory) continue;
            await pruneEmptyDirs(remotePath, relPath);
            const remaining = (await client.list(remotePath)).filter((e) => !isHidden(e.name));
            if (remaining.length === 0) {
                await client.removeDir(remotePath);
                console.log(`  − ${relPath}/`);
            }
        }
    };
    await pruneEmptyDirs(remoteRoot, '');
}

/**
 * Shared hosts (o2switch) drop FTPS after ~90+ passive channels on one control session.
 * Stay under that per session; split flat folders (e.g. `_astro`) into smaller batches.
 */
const FTPS_MAX_FILES_PER_SESSION = 45;

/**
 * @param {{ client: FtpClient }} session
 * @param {DeployConfig} config
 * @param {string} remoteBase
 */
async function prepareFtpsCwd(session, config, remoteBase) {
    if (remoteBase !== '/') await session.client.ensureDir(remoteBase);
    await session.client.cd(remoteBase);
}

/**
 * @param {{ client: FtpClient }} session
 * @param {DeployConfig} config
 * @param {string} remoteBase
 */
async function refreshFtpsSession(session, config, remoteBase) {
    session.client.trackProgress();
    try {
        session.client.close();
    } catch {
        /* ignore */
    }
    session.client = new FtpClient(120_000);
    await session.client.access(ftpsAccessOptions(config));
    await prepareFtpsCwd(session, config, remoteBase);
}

/**
 * @param {{ client: FtpClient }} session
 * @param {string} localPath
 * @param {string} remoteName
 * @param {((name: string) => boolean) | undefined} filter
 */
async function ftpsUploadFromDirOnce(session, localPath, remoteName, filter) {
    await session.client.uploadFromDir(localPath, remoteName, filter ? { filter } : undefined);
}

/**
 * @param {{ client: FtpClient }} session
 * @param {DeployConfig} config
 * @param {string} remoteBase
 * @param {string} localPath
 * @param {string} remoteName
 * @param {((name: string) => boolean) | undefined} filter
 */
async function ftpsUploadFromDirWithRetry(session, config, remoteBase, localPath, remoteName, filter) {
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            await ftpsUploadFromDirOnce(session, localPath, remoteName, filter);
            return;
        } catch (error) {
            if (isFtpsTransientError(error) && attempt < 3) {
                await refreshFtpsSession(session, config, remoteBase);
                continue;
            }
            throw error;
        }
    }
}

/**
 * @param {string} rel
 * @param {Set<string>} protect
 * @returns {boolean}
 */
function isProtectedRel(rel, protect) {
    const top = rel.split('/')[0];
    return protect.has(top);
}

/**
 * @param {string} distDir
 * @param {import('./deploy-manifest.mjs').ManifestDiff['toUpload']} uploads
 */
/** Root files first, heavy `_astro` last (Windows locale sorts `_astro` before `.`). */
function compareUploadParentKeys(a, b) {
    if (a === '.') return -1;
    if (b === '.') return 1;
    if (a === '_astro') return 1;
    if (b === '_astro') return -1;
    return a.localeCompare(b);
}

function groupUploadsByParent(distDir, uploads) {
    /** @type {Map<string, { localDir: string, remoteDir: string, items: typeof uploads, names: Set<string> }>} */
    const groups = new Map();
    for (const item of uploads) {
        const parent = path.posix.dirname(item.rel);
        if (!groups.has(parent)) {
            groups.set(parent, {
                localDir: parent === '.' ? distDir : path.join(distDir, parent),
                remoteDir: parent,
                items: [],
                names: new Set(),
            });
        }
        const group = groups.get(parent);
        group.items.push(item);
        group.names.add(path.posix.basename(item.rel));
    }
    return groups;
}

/**
 * o2switch rejects ensureDir+cd; use uploadFromDir per parent folder (same as full deploy).
 * @param {{ client: FtpClient }} session
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {string} remoteBase
 * @param {import('./deploy-manifest.mjs').ManifestDiff['toUpload']} uploads
 * @param {import('./deploy-manifest.mjs').DeployManifest} manifest
 * @param {{ lastFile: string, bytesOverall: number, fileOrdinal: number }} transferState
 */
async function uploadSelectedFilesFtps(
    session,
    config,
    distDir,
    remoteBase,
    uploads,
    manifest,
    transferState,
) {
    const vaultRoot = resolveVaultGitRoot();
    const totalBytes = uploads.reduce((s, u) => s + u.entry.size, 0);
    const progress = createUploadProgress({ totalBytes });
    let bytesDone = 0;
    let filesSinceReconnect = 0;
    let filesDone = 0;

    /** @param {number} [batchStartBytes] */
    const attachProgress = (batchStartBytes = bytesDone) => {
        session.client.trackProgress((info) => {
            progress.onBytes(batchStartBytes + info.bytesOverall, info.name);
            if (info.name) transferState.lastFile = info.name;
        });
    };

    const groups = groupUploadsByParent(distDir, uploads);
    const parentKeys = [...groups.keys()].sort(compareUploadParentKeys);

    await prepareFtpsCwd(session, config, remoteBase);
    attachProgress();

    for (let parentIdx = 0; parentIdx < parentKeys.length; parentIdx++) {
        const parentKey = parentKeys[parentIdx];
        const group = groups.get(parentKey);
        if (!group) continue;

        if (parentIdx > 0) {
            session.client.trackProgress();
            await refreshFtpsSession(session, config, remoteBase);
            attachProgress();
            filesSinceReconnect = 0;
        }

        if (parentKey === '.') {
            for (const item of group.items) {
                let done = false;
                for (let attempt = 0; attempt < 4 && !done; attempt++) {
                    try {
                        if (filesSinceReconnect >= FTPS_MAX_FILES_PER_SESSION) {
                            session.client.trackProgress();
                            await refreshFtpsSession(session, config, remoteBase);
                            attachProgress();
                            filesSinceReconnect = 0;
                        }
                        const name = path.posix.basename(item.rel);
                        const fileStartBytes = bytesDone;
                        attachProgress(fileStartBytes);
                        await session.client.uploadFrom(item.abs, name);
                        session.client.trackProgress();
                        markUploaded(manifest, item.rel, item.entry, vaultRoot, { persist: false });
                        bytesDone = fileStartBytes + item.entry.size;
                        transferState.bytesOverall = bytesDone;
                        progress.onBytes(bytesDone, item.rel);
                        transferState.fileOrdinal = ++filesDone;
                        filesSinceReconnect += 1;
                        done = true;
                    } catch (error) {
                        session.client.trackProgress();
                        if (isFtpsTransientError(error) && attempt < 3) {
                            await refreshFtpsSession(session, config, remoteBase);
                            attachProgress();
                            filesSinceReconnect = 0;
                            continue;
                        }
                        throw error;
                    }
                }
            }
            saveManifest(manifest, vaultRoot);
            continue;
        }

        const names = [...group.names].sort((a, b) => a.localeCompare(b));
        for (let b = 0; b < names.length; b += FTPS_MAX_FILES_PER_SESSION) {
            const batchNames = names.slice(b, b + FTPS_MAX_FILES_PER_SESSION);
            const batchSet = new Set(batchNames);
            const batchItems = group.items.filter((item) => batchSet.has(path.posix.basename(item.rel)));

            let done = false;
            for (let attempt = 0; attempt < 4 && !done; attempt++) {
                try {
                    if (filesSinceReconnect >= FTPS_MAX_FILES_PER_SESSION || b > 0) {
                        session.client.trackProgress();
                        await refreshFtpsSession(session, config, remoteBase);
                        attachProgress();
                        filesSinceReconnect = 0;
                    }
                    const batchStartBytes = bytesDone;
                    attachProgress(batchStartBytes);
                    await ftpsUploadFromDirWithRetry(
                        session,
                        config,
                        remoteBase,
                        group.localDir,
                        group.remoteDir,
                        (name) => batchSet.has(name),
                    );
                    session.client.trackProgress();
                    const batchBytes = batchItems.reduce((sum, item) => sum + item.entry.size, 0);
                    for (const item of batchItems) {
                        markUploaded(manifest, item.rel, item.entry, vaultRoot, { persist: false });
                        transferState.fileOrdinal = ++filesDone;
                        filesSinceReconnect += 1;
                    }
                    bytesDone = batchStartBytes + batchBytes;
                    transferState.bytesOverall = bytesDone;
                    progress.onBytes(bytesDone, batchItems.at(-1)?.rel ?? group.remoteDir);
                    saveManifest(manifest, vaultRoot);
                    if (group.remoteDir === '_astro' || filesSinceReconnect >= FTPS_MAX_FILES_PER_SESSION) {
                        session.client.trackProgress();
                        await refreshFtpsSession(session, config, remoteBase);
                        attachProgress();
                        filesSinceReconnect = 0;
                    }
                    done = true;
                } catch (error) {
                    session.client.trackProgress();
                    if (isFtpsTransientError(error) && attempt < 3) {
                        await refreshFtpsSession(session, config, remoteBase);
                        attachProgress();
                        filesSinceReconnect = 0;
                        continue;
                    }
                    throw error;
                }
            }
        }
    }

    session.client.trackProgress();
    progress.finish();
    saveManifest(manifest, vaultRoot);
}

/**
 * @param {{ client: FtpClient }} session
 * @param {DeployConfig} config
 * @param {string} remoteBase
 * @param {string[]} relPaths
 * @param {Set<string>} protect
 * @param {import('./deploy-manifest.mjs').DeployManifest} manifest
 */
async function deleteRemoteFilesFtps(session, config, remoteBase, relPaths, protect, manifest) {
    const vaultRoot = resolveVaultGitRoot();
    const toRemove = relPaths.filter((rel) => !isProtectedRel(rel, protect));
    if (!toRemove.length) return;

    let filesSinceReconnect = 0;
    await prepareFtpsCwd(session, config, remoteBase);

    for (let i = 0; i < toRemove.length; i++) {
        const rel = toRemove[i];
        let done = false;
        for (let attempt = 0; attempt < 4 && !done; attempt++) {
            try {
                if (filesSinceReconnect >= FTPS_MAX_FILES_PER_SESSION) {
                    await refreshFtpsSession(session, config, remoteBase);
                    filesSinceReconnect = 0;
                }
                await session.client.remove(rel);
                markDeleted(manifest, rel, vaultRoot, { persist: false });
                console.log(`  − ${rel}`);
                filesSinceReconnect += 1;
                done = true;
            } catch (error) {
                if (isFtpsTransientError(error) && attempt < 3) {
                    await refreshFtpsSession(session, config, remoteBase);
                    filesSinceReconnect = 0;
                    continue;
                }
                throw error;
            }
        }
        if ((i + 1) % FTPS_MAX_FILES_PER_SESSION === 0 || i === toRemove.length - 1) {
            saveManifest(manifest, vaultRoot);
        }
    }
}

/**
 * Upload dist/ using uploadFromDir (compatible with chrooted hosts), fresh session per chunk.
 * @param {{ client: FtpClient }} session
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {string} remoteBase
 * @param {number} totalBytes
 * @param {{ lastFile: string, bytesOverall: number, fileOrdinal: number }} transferState
 */
async function uploadDistResilientFtps(session, config, distDir, remoteBase, totalBytes, transferState) {
    const progress = createUploadProgress({ totalBytes });
    let bytesDone = 0;

    /** @param {string} [chunkLabel] @param {number} [chunkStartBytes] */
    const attachProgress = (chunkLabel, chunkStartBytes = bytesDone) => {
        progress.onBytes(chunkStartBytes, chunkLabel ? `[${chunkLabel}]` : '');
        session.client.trackProgress((info) => {
            progress.onBytes(chunkStartBytes + info.bytesOverall, info.name);
            if (info.name) transferState.lastFile = info.name;
        });
    };

    const detachProgress = () => {
        session.client.trackProgress();
        progress.onBytes(bytesDone, '');
    };

    const topEntries = fs
        .readdirSync(distDir, { withFileTypes: true })
        .filter((e) => !isHidden(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));

    await prepareFtpsCwd(session, config, remoteBase);

    for (let i = 0; i < topEntries.length; i++) {
        const entry = topEntries[i];
        const localPath = path.join(distDir, entry.name);
        const chunkLabel = entry.name;

        if (i > 0) {
            await refreshFtpsSession(session, config, remoteBase);
        }

        if (entry.isFile()) {
            const chunkStartBytes = bytesDone;
            attachProgress(chunkLabel, chunkStartBytes);
            try {
                await session.client.uploadFrom(localPath, entry.name);
            } finally {
                detachProgress();
            }
            bytesDone = chunkStartBytes + fs.statSync(localPath).size;
            progress.onBytes(bytesDone, entry.name);
            transferState.fileOrdinal += 1;
            transferState.bytesOverall = bytesDone;
            continue;
        }

        if (!entry.isDirectory()) continue;

        const fileCount = countLocalFiles(localPath);
        const hiddenFilter = (name) => !isHidden(name);

        if (fileCount <= FTPS_MAX_FILES_PER_SESSION || !isFlatLocalDir(localPath)) {
            const chunkStartBytes = bytesDone;
            attachProgress(chunkLabel, chunkStartBytes);
            try {
                await ftpsUploadFromDirWithRetry(
                    session,
                    config,
                    remoteBase,
                    localPath,
                    entry.name,
                    hiddenFilter,
                );
            } finally {
                detachProgress();
            }
            bytesDone = chunkStartBytes + sumLocalBytes(localPath);
            progress.onBytes(bytesDone, chunkLabel);
            transferState.fileOrdinal += 1;
            transferState.bytesOverall = bytesDone;
            continue;
        }

        const names = fs
            .readdirSync(localPath)
            .filter((n) => !isHidden(n))
            .sort((a, b) => a.localeCompare(b));
        for (let b = 0; b < names.length; b += FTPS_MAX_FILES_PER_SESSION) {
            const batch = names.slice(b, b + FTPS_MAX_FILES_PER_SESSION);
            const batchSet = new Set(batch);
            if (b > 0) {
                await refreshFtpsSession(session, config, remoteBase);
            }
            const batchStartBytes = bytesDone;
            attachProgress(
                `${chunkLabel} (${Math.floor(b / FTPS_MAX_FILES_PER_SESSION) + 1})`,
                batchStartBytes,
            );
            try {
                await ftpsUploadFromDirWithRetry(
                    session,
                    config,
                    remoteBase,
                    localPath,
                    entry.name,
                    (name) => batchSet.has(name),
                );
            } finally {
                detachProgress();
            }
            let batchBytes = 0;
            for (const name of batch) {
                batchBytes += fs.statSync(path.join(localPath, name)).size;
            }
            bytesDone = batchStartBytes + batchBytes;
            progress.onBytes(bytesDone, batch.at(-1) ?? chunkLabel);
            transferState.bytesOverall = bytesDone;
        }
        transferState.fileOrdinal += 1;
    }

    progress.finish();
}

/**
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 */
async function uploadDistFtpsFull(config, distDir, mirror, askConfirm) {
    const remoteBase = config.remotePath.replace(/\/+$/, '') || '/';
    const mirrorActive = mirror;
    const protect = new Set(config.protect ?? []);
    const localFiles = listLocalFiles(distDir);
    /** @type {{ client: FtpClient }} */
    const session = { client: new FtpClient(120_000) };
    /** @type {{ lastFile: string, bytesOverall: number, fileOrdinal: number }} */
    const transferState = { lastFile: '', bytesOverall: 0, fileOrdinal: 0 };

    try {
        await session.client.access(ftpsAccessOptions(config));
        const loginDir = await session.client.pwd();
        const absoluteTarget =
            remoteBase === '/'
                ? loginDir.replace(/\/+$/, '') || '/'
                : `${loginDir.replace(/\/+$/, '')}${remoteBase}`;

        const totalBytes = sumLocalBytes(distDir);
        const doUpload = async () => {
            console.log(
                `\n🚀 Full upload dist/ (${humanBytes(totalBytes)}) → ftps://${config.host}:${config.port} (${absoluteTarget}) …`,
            );
            await uploadDistResilientFtps(session, config, distDir, remoteBase, totalBytes, transferState);
            console.log('✅ Upload complete.');
        };

        const doMirror = mirrorActive
            ? async () => {
                  console.log('\n🧹 Mirror: removing remote files not present locally…');
                  await mirrorRemoteFtps(session.client, remoteBase, localFiles, protect);
                  console.log('✅ Mirror complete.');
              }
            : undefined;

        if (askConfirm || mirrorActive) {
            const remoteFiles = await listRemoteFilesFtps(session.client, remoteBase, protect);
            const created = [...localFiles].filter((f) => !remoteFiles.has(f));
            const overwritten = localFiles.size - created.length;
            const deletions = mirrorActive
                ? [...remoteFiles].filter((f) => !localFiles.has(f)).sort()
                : [];

            console.log(`\nTarget: ftps://${config.host}:${config.port} → ${absoluteTarget}`);
            if (protect.size) console.log(`Protected (never touched): ${[...protect].join(', ')}, dotfiles`);
            printPreview(created, overwritten, deletions, mirrorActive);

            if (askConfirm) {
                const ok = await confirm('\nProceed with upload? (y/N) ');
                if (!ok) {
                    console.log('Upload cancelled.');
                    session.client.close();
                    process.exit(0);
                }
            }

            await refreshFtpsSession(session, config, remoteBase);
            await doUpload();
            if (doMirror) await doMirror();
        } else {
            await doUpload();
            if (!mirror) {
                console.log('ℹ️  Mirror disabled (--no-mirror): remote-only files were kept.');
            }
        }

        console.log('\n📝 Refreshing deploy manifest from dist/…');
        const local = await hashDistTree(distDir);
        manifestFromLocal(config, local);
        console.log('✅ Manifest updated.');
    } catch (error) {
        handleFtpsUploadError(error);
    } finally {
        session.client.close();
    }
}

/**
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 */
async function uploadDistFtpsIncremental(config, distDir, mirror, askConfirm) {
    const remoteBase = config.remotePath.replace(/\/+$/, '') || '/';
    const deleteEnabled = mirror;
    const protect = new Set(config.protect ?? []);
    /** @type {{ client: FtpClient }} */
    const session = { client: new FtpClient(120_000) };
    /** @type {{ lastFile: string, bytesOverall: number, fileOrdinal: number }} */
    const transferState = { lastFile: '', bytesOverall: 0, fileOrdinal: 0 };

    try {
        console.log('\n🔍 Incremental deploy (local manifest)…');
        const { manifest, diff } = await planIncrementalDeploy(distDir, config, (done, total, rel) => {
            if (done === 1 || done === total || done % 50 === 0) {
                process.stdout.write(`\r   Hashing dist/ … ${done}/${total}  ${rel.slice(-40).padStart(40)}`);
            }
        });
        if (process.stdout.isTTY) process.stdout.write('\n');

        await session.client.access(ftpsAccessOptions(config));
        const loginDir = await session.client.pwd();
        const absoluteTarget =
            remoteBase === '/'
                ? loginDir.replace(/\/+$/, '') || '/'
                : `${loginDir.replace(/\/+$/, '')}${remoteBase}`;

        console.log(`\nTarget: ftps://${config.host}:${config.port} → ${absoluteTarget}`);
        if (protect.size) console.log(`Protected (never touched): ${[...protect].join(', ')}, dotfiles`);
        printIncrementalPreview(diff, deleteEnabled);

        if (!diff.toUpload.length && (!deleteEnabled || !diff.toDelete.length)) {
            console.log('\n✅ Nothing to deploy — dist/ matches the last successful manifest.');
            return;
        }

        if (askConfirm) {
            const ok = await confirm('\nProceed with upload? (y/N) ');
            if (!ok) {
                console.log('Upload cancelled.');
                return;
            }
        }

        if (diff.toUpload.length) {
            const uploadBytes = diff.toUpload.reduce((s, u) => s + u.entry.size, 0);
            console.log(
                `\n🚀 Uploading ${diff.toUpload.length} file(s) (${humanBytes(uploadBytes)}) → ftps://${config.host}:${config.port} …`,
            );
            await refreshFtpsSession(session, config, remoteBase);
            await uploadSelectedFilesFtps(
                session,
                config,
                distDir,
                remoteBase,
                diff.toUpload,
                manifest,
                transferState,
            );
            console.log('✅ Upload complete.');
        }

        if (deleteEnabled && diff.toDelete.length) {
            console.log(`\n🧹 Removing ${diff.toDelete.length} obsolete remote file(s)…`);
            await refreshFtpsSession(session, config, remoteBase);
            await deleteRemoteFilesFtps(session, config, remoteBase, diff.toDelete, protect, manifest);
            console.log('✅ Cleanup complete.');
        } else if (!deleteEnabled && diff.toDelete.length) {
            console.log(
                `ℹ️  ${diff.toDelete.length} obsolete remote file(s) kept (--no-mirror). Use default mirror or --full to clean up.`,
            );
        }
    } catch (error) {
        handleFtpsUploadError(error);
    } finally {
        session.client.close();
    }
}

/** @param {unknown} error */
function handleFtpsUploadError(error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('altnames')) {
        console.error('❌ FTPS upload failed: TLS certificate does not match the FTP hostname.');
        console.error('   FileZilla often ignores this; set DEPLOY_FTPS_INSECURE=true in the vault .env');
    } else {
        console.error('❌ FTPS upload failed:', error);
    }
    process.exit(1);
}

/**
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 * @param {boolean} incremental
 */
async function uploadDistFtps(config, distDir, mirror, askConfirm, incremental) {
    if (incremental) {
        await uploadDistFtpsIncremental(config, distDir, mirror, askConfirm);
    } else {
        await uploadDistFtpsFull(config, distDir, mirror, askConfirm);
    }
}

/**
 * Uploads the engine `dist/` over FTPS or SFTP.
 * @param {DeployConfig} [config] Pre-validated config (from prepareDeployConfig).
 * @param {{ mirror?: boolean, confirm?: boolean, incremental?: boolean }} [options]
 */
export async function uploadDist(
    config,
    { mirror = true, confirm: askConfirm = false, incremental = true } = {},
) {
    const resolved = config ?? prepareDeployConfig();
    const distDir = path.join(projectRoot, 'dist');
    if (!fs.existsSync(distDir)) {
        console.error('❌ dist/ not found. Run npm run build first.');
        process.exit(1);
    }

    if (!incremental) {
        console.log('ℹ️  Full deploy (--full): remote scan + upload all files + mirror.');
    }

    if (resolved.protocol === 'ftps') {
        await uploadDistFtps(resolved, distDir, mirror, askConfirm, incremental);
    } else {
        const normalizedRemote = resolved.remotePath.replace(/\/+$/, '');
        const mirrorAllowed = mirror && Boolean(normalizedRemote);
        if (mirror && !normalizedRemote) {
            console.warn(
                '⚠️  Mirror disabled: refusing to mirror the SSH server root. Set a dedicated DEPLOY_REMOTE_PATH.',
            );
        }
        await uploadDistSftp(resolved, distDir, mirrorAllowed, askConfirm, incremental);
    }
}
