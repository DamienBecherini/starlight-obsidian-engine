// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} PublishConfig
 * @property {string[]} exclude Glob patterns (vault-relative POSIX paths) excluded from the site build.
 */

/**
 * @param {unknown} raw
 * @returns {PublishConfig}
 */
export function parsePublishBlock(raw) {
    if (!raw || typeof raw !== 'object') {
        return { exclude: [] };
    }

    /** @type {Record<string, unknown>} */
    const block = /** @type {Record<string, unknown>} */ (raw);
    if (!Array.isArray(block.exclude)) {
        return { exclude: [] };
    }

    const exclude = block.exclude
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => normalizePublishPattern(/** @type {string} */ (entry)));

    return { exclude };
}

/**
 * @param {string} pattern
 * @returns {string}
 */
export function normalizePublishPattern(pattern) {
    return pattern.trim().replace(/\\/g, '/');
}

/**
 * Reads `publish.exclude` patterns from the vault `site.config.json`.
 * @param {string} vaultRoot
 * @returns {string[]}
 */
export function loadPublishExcludePatterns(vaultRoot) {
    const configPath = path.join(vaultRoot, 'site.config.json');
    if (!fs.existsSync(configPath)) {
        return [];
    }

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        /** @type {{ publish?: unknown }} */
        const parsed = JSON.parse(raw);
        return parsePublishBlock(parsed.publish).exclude;
    } catch {
        return [];
    }
}
