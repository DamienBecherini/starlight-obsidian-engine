// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(__dirname, '../../src/generated/link-graph.json');

/** @typedef {import('./link-graph.mjs').LinkGraphDocument} LinkGraphDocument */

/**
 * @param {string} [jsonPath]
 * @returns {LinkGraphDocument}
 */
export function loadLinkGraph(jsonPath = defaultPath) {
    if (!fs.existsSync(jsonPath)) {
        return { generatedAt: '', backlinks: {} };
    }
    try {
        return /** @type {LinkGraphDocument} */ (JSON.parse(fs.readFileSync(jsonPath, 'utf-8')));
    } catch {
        return { generatedAt: '', backlinks: {} };
    }
}
