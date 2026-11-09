// @ts-check
import path from 'node:path';

/**
 * @param {string} rel
 * @param {Set<string>} protect
 * @returns {boolean}
 */
export function isProtectedRel(rel, protect) {
    const top = rel.split('/')[0];
    return protect.has(top);
}

/**
 * Root files first, heavy `_astro` last (Windows locale sorts `_astro` before `.`).
 * @param {string} a
 * @param {string} b
 */
export function compareUploadParentKeys(a, b) {
    if (a === '.') return -1;
    if (b === '.') return 1;
    if (a === '_astro') return 1;
    if (b === '_astro') return -1;
    return a.localeCompare(b);
}

/**
 * @param {string} distDir
 * @param {import('./deploy-manifest.mjs').ManifestDiff['toUpload']} uploads
 */
export function groupUploadsByParent(distDir, uploads) {
    /** @type {Map<string, { localDir: string, remoteDir: string, items: typeof uploads, names: Set<string> }>} */
    const groups = new Map();
    for (const item of uploads) {
        const parent = path.posix.dirname(item.rel);
        let group = groups.get(parent);
        if (!group) {
            group = {
                localDir: parent === '.' ? distDir : path.join(distDir, parent),
                remoteDir: parent,
                items: [],
                names: new Set(),
            };
            groups.set(parent, group);
        }
        group.items.push(item);
        group.names.add(path.posix.basename(item.rel));
    }
    return groups;
}

/**
 * FTP answers 550 "No such file" when a file to remove is already gone (a deploy that ran at the
 * same time, or an interrupted cleanup). Other 550 answers, such as a permission error, stay errors.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isFtpFileAlreadyGone(error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 550) return false;
    return /no such file/i.test(error.message);
}
