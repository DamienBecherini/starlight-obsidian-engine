// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { collectUnresolvedLinks, normalizeLinkTarget, pageResolver } from './link-graph.mjs';

/** @typedef {{ from: string, raw: string, path: string }} UnresolvedLink */

/**
 * @typedef {Object} LinkAuditAllowlist
 * @property {Set<string>} slugs
 * @property {string[]} prefixes
 */

/**
 * Normalizes allowlist entries to vault slugs (no extension, posix).
 * @param {string} entry
 * @returns {string}
 */
export function normalizeAllowlistEntry(entry) {
    return normalizeLinkTarget(entry.trim().replace(/^`|`$/g, ''));
}

/**
 * Parses lexicon backlog headings like `### \`00-lexique/nvswitch.md\``.
 * @param {string} backlogPath
 * @returns {Set<string>}
 */
export function parseLexiconBacklogAllowlist(backlogPath) {
    /** @type {Set<string>} */
    const slugs = new Set();
    if (!fs.existsSync(backlogPath)) return slugs;

    const content = fs.readFileSync(backlogPath, 'utf-8');
    for (const match of content.matchAll(/^###\s+`([^`]+)`/gm)) {
        const slug = normalizeAllowlistEntry(match[1]);
        if (slug) slugs.add(slug);
    }
    return slugs;
}

/**
 * Parses `.agents/vault-maintenance/link-audit-allowlist.md`.
 * Supports `## Prefixes` (directory prefixes ending with `/`) and `## Slugs` (exact slugs).
 * @param {string} allowlistPath
 * @returns {LinkAuditAllowlist}
 */
export function parseLinkAuditAllowlistFile(allowlistPath) {
    /** @type {Set<string>} */
    const slugs = new Set();
    /** @type {string[]} */
    const prefixes = [];

    if (!fs.existsSync(allowlistPath)) {
        return { slugs, prefixes };
    }

    let section = '';
    for (const line of fs.readFileSync(allowlistPath, 'utf-8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            if (/^##\s+prefixes/i.test(trimmed)) section = 'prefixes';
            else if (/^##\s+slugs/i.test(trimmed)) section = 'slugs';
            continue;
        }
        if (trimmed.startsWith('- ')) {
            const value = trimmed.slice(2).trim();
            if (section === 'prefixes' && value.endsWith('/')) {
                prefixes.push(value);
            } else if (section === 'slugs' || section === 'prefixes') {
                const slug = normalizeAllowlistEntry(value);
                if (slug) slugs.add(slug);
            }
        }
    }

    return { slugs, prefixes };
}

/**
 * @param {string} vaultRoot
 * @returns {{ backlogPath: string, allowlistPath: string }}
 */
export function resolveAllowlistPaths(vaultRoot) {
    return {
        backlogPath: path.join(vaultRoot, '.agents/vault-maintenance/lexicon-backlog.md'),
        allowlistPath: path.join(vaultRoot, '.agents/vault-maintenance/link-audit-allowlist.md'),
    };
}

/**
 * Builds combined allowlist from backlog + optional allowlist file.
 * @param {string} vaultRoot
 * @returns {LinkAuditAllowlist}
 */
export function loadLinkAuditAllowlist(vaultRoot) {
    const { backlogPath, allowlistPath } = resolveAllowlistPaths(vaultRoot);
    const slugs = parseLexiconBacklogAllowlist(backlogPath);
    const fileAllowlist = parseLinkAuditAllowlistFile(allowlistPath);
    for (const slug of fileAllowlist.slugs) slugs.add(slug);
    return { slugs, prefixes: fileAllowlist.prefixes };
}

/**
 * Candidate slugs for matching an unresolved link path (same resolver chain as link graph).
 * @param {string} pathTarget
 * @returns {string[]}
 */
export function candidateSlugsForPath(pathTarget) {
    const normalized = normalizeLinkTarget(pathTarget);
    if (!normalized) return [];
    const candidates = new Set([normalized]);
    for (const candidate of pageResolver(normalized)) {
        candidates.add(candidate);
    }
    return [...candidates];
}

/**
 * @param {UnresolvedLink} item
 * @param {LinkAuditAllowlist} allowlist
 * @returns {boolean}
 */
export function isAllowedUnresolvedLink(item, allowlist) {
    const candidates = candidateSlugsForPath(item.path);
    for (const candidate of candidates) {
        if (allowlist.slugs.has(candidate)) return true;
        for (const prefix of allowlist.prefixes) {
            if (candidate.startsWith(prefix)) return true;
        }
    }
    return false;
}

/**
 * @param {UnresolvedLink[]} unresolved
 * @param {LinkAuditAllowlist} allowlist
 * @returns {{ allowed: UnresolvedLink[], unexpected: UnresolvedLink[] }}
 */
export function partitionUnresolvedLinks(unresolved, allowlist) {
    /** @type {UnresolvedLink[]} */
    const allowed = [];
    /** @type {UnresolvedLink[]} */
    const unexpected = [];

    for (const item of unresolved) {
        if (isAllowedUnresolvedLink(item, allowlist)) {
            allowed.push(item);
        } else {
            unexpected.push(item);
        }
    }

    return { allowed, unexpected };
}

/**
 * @typedef {Object} LinkAuditResult
 * @property {UnresolvedLink[]} unresolved
 * @property {UnresolvedLink[]} allowed
 * @property {UnresolvedLink[]} unexpected
 * @property {LinkAuditAllowlist} allowlist
 */

/**
 * @param {string} vaultRoot
 * @returns {LinkAuditResult}
 */
export function runLinkAudit(vaultRoot) {
    const unresolved = collectUnresolvedLinks(vaultRoot);
    const allowlist = loadLinkAuditAllowlist(vaultRoot);
    const { allowed, unexpected } = partitionUnresolvedLinks(unresolved, allowlist);
    return { unresolved, allowed, unexpected, allowlist };
}

/**
 * @param {LinkAuditResult} result
 * @param {{ strict?: boolean, warnOnly?: boolean }} [options]
 * @returns {number} process exit code
 */
export function linkAuditExitCode(result, options = {}) {
    if (options.warnOnly) return 0;
    if (options.strict) return result.unresolved.length > 0 ? 1 : 0;
    return result.unexpected.length > 0 ? 1 : 0;
}

/**
 * @param {LinkAuditResult} result
 * @param {{ strict?: boolean }} [options]
 */
export function printLinkAuditReport(result, options = {}) {
    const { unresolved, allowed, unexpected } = result;

    if (!unresolved.length) {
        console.log('✅ No unresolved internal links in published vault content.');
        return;
    }

    const toShow = options.strict ? unresolved : unexpected.length ? unexpected : allowed;

    if (!options.strict && unexpected.length === 0 && allowed.length > 0) {
        console.log(
            `✅ ${allowed.length} unresolved link(s) match the maintenance allowlist (lexicon backlog / roadmap placeholders).`,
        );
        return;
    }

    const label = options.strict
        ? 'unresolved internal link(s)'
        : unexpected.length
          ? 'unexpected unresolved internal link(s)'
          : 'allowlisted unresolved internal link(s)';

    console.log(`⚠️  ${toShow.length} ${label}:\n`);
    for (const item of toShow) {
        console.log(`  ${item.from}`);
        console.log(`    raw: ${item.raw}`);
        console.log(`    path: ${item.path}`);
        console.log('');
    }

    if (!options.strict && allowed.length > 0 && unexpected.length > 0) {
        console.log(`ℹ️  ${allowed.length} additional allowlisted placeholder(s) omitted from report.\n`);
    }
}
