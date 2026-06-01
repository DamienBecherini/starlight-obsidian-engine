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
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 */
async function uploadDistSftp(config, distDir, mirror, askConfirm) {
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

        console.log(`\n🚀 Uploading dist/ → sftp://${config.host}:${config.port}${config.remotePath} …`);
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
    } catch (error) {
        console.error('❌ SFTP upload failed:', error);
        process.exit(1);
    } finally {
        await sftp.end();
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
    /** @param {string} remoteDir @param {string} rel */
    const walk = async (remoteDir, rel) => {
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
            if (entry.isDirectory) {
                await walk(remotePath, relPath);
                const remaining = (await client.list(remotePath)).filter((e) => !isHidden(e.name));
                if (remaining.length === 0) {
                    await client.removeDir(remotePath);
                    console.log(`  − ${relPath}/`);
                }
            } else if (entry.isFile && !localFiles.has(relPath)) {
                await client.remove(remotePath);
                console.log(`  − ${relPath}`);
            }
        }
    };
    await walk(remoteRoot, '');
}

/**
 * @param {DeployConfig} config
 * @param {string} distDir
 * @param {boolean} mirror
 * @param {boolean} askConfirm
 */
async function uploadDistFtps(config, distDir, mirror, askConfirm) {
    // FTP accounts are chrooted to their own space, so `/` is the site root (safe to mirror).
    const remoteBase = config.remotePath.replace(/\/+$/, '') || '/';
    const mirrorActive = mirror;
    const protect = new Set(config.protect ?? []);
    const localFiles = listLocalFiles(distDir);
    const client = new FtpClient(120_000);

    try {
        await client.access({
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            secure: true,
            secureOptions: config.ftpsInsecure ? { rejectUnauthorized: false } : undefined,
        });

        // Resolve where the FTP account actually lands (login dir) so the target is unambiguous.
        const loginDir = await client.pwd();
        const absoluteTarget =
            remoteBase === '/'
                ? loginDir.replace(/\/+$/, '') || '/'
                : `${loginDir.replace(/\/+$/, '')}${remoteBase}`;

        const totalBytes = sumLocalBytes(distDir);
        const doUpload = async () => {
            console.log(
                `\n🚀 Uploading dist/ (${humanBytes(totalBytes)}) → ftps://${config.host}:${config.port} (${absoluteTarget}) …`,
            );
            if (remoteBase !== '/') await client.ensureDir(remoteBase);
            await client.cd(remoteBase);
            const progress = createUploadProgress({ totalBytes });
            client.trackProgress((info) => progress.onBytes(info.bytesOverall, info.name));
            try {
                await client.uploadFromDir(distDir, remoteBase, {
                    filter: (name) => !isHidden(name),
                });
            } finally {
                client.trackProgress();
                progress.finish();
            }
            console.log('✅ Upload complete.');
        };

        const doMirror = mirrorActive
            ? async () => {
                  console.log('\n🧹 Mirror: removing remote files not present locally…');
                  await mirrorRemoteFtps(client, remoteBase, localFiles, protect);
                  console.log('✅ Mirror complete.');
              }
            : undefined;

        if (askConfirm || mirrorActive) {
            const remoteFiles = await listRemoteFilesFtps(client, remoteBase, protect);
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
                    client.close();
                    process.exit(0);
                }
            }

            await doUpload();
            if (doMirror) await doMirror();
        } else {
            await doUpload();
            if (!mirror) {
                console.log('ℹ️  Mirror disabled (--no-mirror): remote-only files were kept.');
            }
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('altnames')) {
            console.error('❌ FTPS upload failed: TLS certificate does not match the FTP hostname.');
            console.error('   FileZilla often ignores this; set DEPLOY_FTPS_INSECURE=true in the vault .env');
        } else {
            console.error('❌ FTPS upload failed:', error);
        }
        process.exit(1);
    } finally {
        client.close();
    }
}

/**
 * Uploads the engine `dist/` over FTPS or SFTP.
 * @param {DeployConfig} [config] Pre-validated config (from prepareDeployConfig).
 * @param {{ mirror?: boolean, confirm?: boolean }} [options]
 */
export async function uploadDist(config, { mirror = true, confirm: askConfirm = false } = {}) {
    const resolved = config ?? prepareDeployConfig();
    const distDir = path.join(projectRoot, 'dist');
    if (!fs.existsSync(distDir)) {
        console.error('❌ dist/ not found. Run npm run build first.');
        process.exit(1);
    }

    if (resolved.protocol === 'ftps') {
        // FTP accounts are chrooted; `/` is the site root, so mirroring there is safe.
        await uploadDistFtps(resolved, distDir, mirror, askConfirm);
    } else {
        // SFTP `/` is the real server filesystem root — refuse to mirror it.
        const normalizedRemote = resolved.remotePath.replace(/\/+$/, '');
        const mirrorAllowed = mirror && Boolean(normalizedRemote);
        if (mirror && !normalizedRemote) {
            console.warn(
                '⚠️  Mirror disabled: refusing to mirror the SSH server root. Set a dedicated DEPLOY_REMOTE_PATH.',
            );
        }
        await uploadDistSftp(resolved, distDir, mirrorAllowed, askConfirm);
    }
}
