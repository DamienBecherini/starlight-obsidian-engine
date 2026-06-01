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

/** Root files first, heavy `_astro` last (Windows locale sorts `_astro` before `.`). */
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
