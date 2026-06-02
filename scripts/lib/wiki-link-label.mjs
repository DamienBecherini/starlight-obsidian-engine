// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { readLexiconEntry } from './lexicon-index.mjs';

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g;

/**
 * @param {string} target Vault-relative path without extension.
 * @returns {string}
 */
export function humanizeSlug(target) {
    const base = target.split('/').pop() ?? target;
    return base
        .split('-')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
}

/**
 * @param {string} [alias]
 * @param {string} target
 * @returns {string | undefined}
 */
export function stripPathSuffixFromAlias(alias, target) {
    if (!alias) return alias;
    const suffix = ` (${target})`;
    if (alias.endsWith(suffix)) {
        return alias.slice(0, -suffix.length).trim();
    }
    return alias.trim();
}

/**
 * @param {string} vaultRoot
 * @returns {Map<string, string>}
 */
export function buildVaultTitleIndex(vaultRoot) {
    /** @type {Map<string, string>} */
    const titles = new Map();

    /**
     * @param {string} dir
     */
    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.md$/i.test(entry.name)) continue;
            const rel = path.relative(vaultRoot, full).split(path.sep).join('/');
            const target = rel.replace(/\.md$/i, '');
            const meta = readLexiconEntry(full);
            const title = meta?.title?.trim();
            if (title) titles.set(target, title);
        }
    }

    walk(vaultRoot);
    return titles;
}

/**
 * @param {string} target
 * @param {string} [alias]
 * @param {Map<string, string>} titles
 * @returns {string}
 */
export function formatWikiLinkDisplay(target, alias, titles) {
    const normalized = target.trim().replace(/^\//, '');
    const cleaned = stripPathSuffixFromAlias(alias, normalized);
    const displayTitle = titles.get(normalized) ?? cleaned ?? humanizeSlug(normalized);
    return `[[${normalized}|${displayTitle}]]`;
}

/** @deprecated Use formatWikiLinkDisplay */
export const formatWikiLinkWithPath = formatWikiLinkDisplay;

/**
 * @param {string} markdown
 * @param {Map<string, string>} titles
 * @returns {string}
 */
export function upgradeWikiLinksInText(markdown, titles) {
    return markdown.replace(WIKI_LINK_RE, (match, target, alias) => {
        const normalized = target.trim().replace(/^\//, '');
        if (!normalized) return match;
        return formatWikiLinkDisplay(normalized, alias, titles);
    });
}

/**
 * @param {string} content
 * @param {Map<string, string>} titles
 * @returns {string}
 */
export function upgradeVoirAussiSection(content, titles) {
    const marker = '## Voir aussi';
    const idx = content.indexOf(marker);
    if (idx === -1) return content;
    const head = content.slice(0, idx + marker.length);
    const tail = content.slice(idx + marker.length);
    return head + upgradeWikiLinksInText(tail, titles);
}
