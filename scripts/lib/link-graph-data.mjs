// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../config/vault.mjs';

/** @typedef {import('./link-graph.mjs').LinkGraphDocument} LinkGraphDocument */

/** Path used when reading from disk (tests, scripts, Astro pages). */
export const defaultLinkGraphPath = path.join(projectRoot, 'src/generated/link-graph.json');

/**
 * Runtime loader for Astro pages — reads generated JSON from disk (gitignored artefact).
 * Tolerates a missing file (empty graph) until predev/prebuild regenerates it.
 * @returns {LinkGraphDocument}
 */
export function loadLinkGraph() {
    return loadLinkGraphFromFile(defaultLinkGraphPath);
}

/**
 * Read link graph from an explicit path (tests, tooling).
 * @param {string} jsonPath
 * @returns {LinkGraphDocument}
 */
export function loadLinkGraphFromFile(jsonPath = defaultLinkGraphPath) {
    if (!fs.existsSync(jsonPath)) {
        return { generatedAt: '', backlinks: {} };
    }
    try {
        return /** @type {LinkGraphDocument} */ (JSON.parse(fs.readFileSync(jsonPath, 'utf-8')));
    } catch {
        return { generatedAt: '', backlinks: {} };
    }
}
