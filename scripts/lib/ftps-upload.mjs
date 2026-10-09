// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal surface of `basic-ftp`'s Client used by the directory upload.
 * @typedef {{
 *   ensureDir(remoteDirPath: string): Promise<void>,
 *   uploadFrom(source: string, toRemotePath: string): Promise<unknown>,
 *   cdup(): Promise<unknown>,
 * }} UploadClient
 */

/**
 * Uploads a local directory recursively, skipping entries rejected by `filter`.
 *
 * Mirrors `Client.uploadFromDir` from basic-ftp 6, which has no filter parameter:
 * `ensureDir` creates `remoteDirPath` and leaves the client inside it, files are
 * uploaded in sorted order, subdirectories are entered then left with `cdup`.
 * The filter is evaluated on the entry name at every level (files and directories).
 *
 * @param {UploadClient} client
 * @param {string} localDirPath
 * @param {string} remoteDirPath
 * @param {((name: string) => boolean) | undefined} [filter] Keep the entry when it returns true.
 */
export async function uploadFromDirFiltered(client, localDirPath, remoteDirPath, filter) {
    await client.ensureDir(remoteDirPath);
    await uploadToWorkingDirectory(client, localDirPath, filter);
}

/**
 * @param {UploadClient} client
 * @param {string} localDirPath
 * @param {((name: string) => boolean) | undefined} filter
 */
async function uploadToWorkingDirectory(client, localDirPath, filter) {
    const entries = fs
        .readdirSync(localDirPath, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (filter && !filter(entry.name)) continue;
        const fullPath = path.join(localDirPath, entry.name);
        if (entry.isFile()) {
            await client.uploadFrom(fullPath, entry.name);
        } else if (entry.isDirectory()) {
            await client.ensureDir(entry.name);
            await uploadToWorkingDirectory(client, fullPath, filter);
            await client.cdup();
        }
    }
}
