// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../../config/vault.mjs';
import linkGraphDocument from '../../src/generated/link-graph.json' with { type: 'json' };

/** @typedef {import('./link-graph.mjs').LinkGraphDocument} LinkGraphDocument */

/** Path used when reading from disk (tests, scripts). */
export const defaultLinkGraphPath = path.join(projectRoot, 'src/generated/link-graph.json');

/**
 * Runtime loader for Astro pages — bundled JSON import (SSR-safe).
 * @returns {LinkGraphDocument}
 */
export function loadLinkGraph() {
    return /** @type {LinkGraphDocument} */ (linkGraphDocument);
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
