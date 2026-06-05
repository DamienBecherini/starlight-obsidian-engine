// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { loadVaultGitignore } from '../../config/gitignore.mjs';
import {
    getLexiconExcludeSlugs,
    isLexiconEnabled,
    loadLexiconConfig,
} from '../../config/lexicon.mjs';
import { readLexiconEntry } from './lexicon-index.mjs';

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g;
const MD_INTERNAL_LINK_RE = /\]\(([^)\s#]+)\)/g;

/** @typedef {{ from: string, title: string, section: string }} BacklinkEntry */

/** @typedef {Object} LinkGraphDocument
 * @property {string} generatedAt
 * @property {Record<string, BacklinkEntry[]>} backlinks
 */

/**
 * Same resolver as remark-wiki-link in config/markdown.mjs.
 * @param {string} name
 * @returns {string[]}
 */
export function pageResolver(name) {
    return [name.trim().replace(/ /g, '-').toLowerCase().replace(/\/index$/i, '')];
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLinkTarget(raw) {
    let t = raw.trim().replace(/^\//, '').replace(/\\+$/g, '');
    const hash = t.indexOf('#');
    if (hash !== -1) t = t.slice(0, hash);
    t = t.replace(/\.mdx?$/i, '');
    return t.replace(/\/+$/g, '');
}

/**
 * @param {string} vaultRel Posix path without extension.
 * @returns {string}
 */
export function sectionFromVaultPath(vaultRel) {
    const parts = vaultRel.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
}

/**
 * @param {string} content
 * @returns {string}
 */
export function stripFrontmatter(content) {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    return match ? content.slice(match[0].length) : content;
}

/**
 * @param {string} body
 * @returns {string[]}
 */
export function extractWikiTargets(body) {
    /** @type {string[]} */
    const targets = [];
    for (const match of body.matchAll(WIKI_LINK_RE)) {
        const target = normalizeLinkTarget(match[1]);
        if (target) targets.push(target);
    }
    return targets;
}

/**
 * @param {string} body
 * @returns {string[]}
 */
export function extractMarkdownInternalTargets(body) {
    /** @type {string[]} */
    const targets = [];
    for (const match of body.matchAll(MD_INTERNAL_LINK_RE)) {
        const raw = match[1].trim();
        if (!raw || /^https?:/i.test(raw) || /^mailto:/i.test(raw) || raw.startsWith('#')) continue;
        targets.push(raw);
    }
    return targets;
}

/**
 * Normalizes a link target relative to the source page slug (posix vault path without extension).
 * @param {string} raw
 * @param {string} fromSlug
 * @returns {string}
 */
export function resolveLinkTargetPath(raw, fromSlug) {
    let t = raw.trim();
    const hash = t.indexOf('#');
    if (hash !== -1) t = t.slice(0, hash);
    t = t.replace(/\.mdx?$/i, '');
    if (t.startsWith('/')) return normalizeLinkTarget(t);
    if (t.startsWith('./') || t.startsWith('../')) {
        const fromDir = fromSlug.includes('/') ? path.posix.dirname(fromSlug) : '';
        const joined = fromDir ? path.posix.join(fromDir, t) : t;
        return path.posix.normalize(joined).replace(/^\.\//, '');
    }
    // Obsidian wiki-links: bare slug or vault-root path (e.g. 00-lexique/apu).
    return normalizeLinkTarget(t);
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function parseAliasesFromFrontmatter(raw) {
    /** @type {string[]} */
    const aliases = [];
    let inAliases = false;
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (/^aliases:\s*$/.test(trimmed)) {
            inAliases = true;
            continue;
        }
        if (inAliases) {
            const item = trimmed.match(/^- (.+)$/);
            if (item) {
                aliases.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
                continue;
            }
            if (/^[A-Za-z0-9_-]+:/.test(trimmed)) {
                inAliases = false;
            }
        }
    }
    return aliases;
}

/**
 * @param {string} vaultRoot
 * @returns {{ publishedSlugs: Set<string>, titles: Map<string, string>, aliasToSlug: Map<string, string> }}
 */
export function buildPublishedIndex(vaultRoot) {
    const isIgnored = loadVaultGitignore(vaultRoot);
    /** @type {Set<string>} */
    const publishedSlugs = new Set();
    /** @type {Map<string, string>} */
    const titles = new Map();
    /** @type {Map<string, string>} */
    const aliasToSlug = new Map();

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
            if (!/\.mdx?$/i.test(entry.name)) continue;
            const vaultRel = path.relative(vaultRoot, full).split(path.sep).join('/');
            if (isIgnored(vaultRel)) continue;

            const slug = vaultRel.replace(/\.mdx?$/i, '');
            publishedSlugs.add(slug);

            const raw = fs.readFileSync(full, 'utf-8');
            const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            const meta = fm ? readLexiconEntry(full) : null;
            const title = meta?.title?.trim() || humanizeSlug(slug);
            titles.set(slug, title);

            if (fm) {
                for (const alias of parseAliasesFromFrontmatter(fm[1])) {
                    const key = alias.toLowerCase();
                    aliasToSlug.set(key, slug);
                }
            }
        }
    }

    walk(vaultRoot);
    return { publishedSlugs, titles, aliasToSlug };
}

/**
 * @param {string} target
 * @returns {string}
 */
function humanizeSlug(target) {
    const base = target.split('/').pop() ?? target;
    return base
        .split('-')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
}

/**
 * @param {string} raw
 * @param {Set<string>} publishedSlugs
 * @param {Map<string, string>} aliasToSlug
 * @returns {string | null}
 */
export function resolveLinkTarget(raw, publishedSlugs, aliasToSlug) {
    const normalized = normalizeLinkTarget(raw);
    if (!normalized) return null;
    if (publishedSlugs.has(normalized)) return normalized;

    for (const candidate of pageResolver(normalized)) {
        if (publishedSlugs.has(candidate)) return candidate;
    }

    const base = normalized.split('/').pop() ?? normalized;
    const fromAlias = aliasToSlug.get(normalized.toLowerCase()) ?? aliasToSlug.get(base.toLowerCase());
    if (fromAlias && publishedSlugs.has(fromAlias)) return fromAlias;

    return null;
}

/**
 * @param {string} raw
 * @param {string} fromSlug
 * @param {Set<string>} publishedSlugs
 * @param {Map<string, string>} aliasToSlug
 * @returns {string | null}
 */
export function resolveLinkTargetFromSource(raw, fromSlug, publishedSlugs, aliasToSlug) {
    const pathTarget = resolveLinkTargetPath(raw, fromSlug);
    return resolveLinkTarget(pathTarget, publishedSlugs, aliasToSlug);
}

/**
 * @param {string} vaultRoot
 * @param {{ sortLocale?: string }} [options]
 * @returns {LinkGraphDocument}
 */
export function buildLinkGraph(vaultRoot, options = {}) {
    const sortLocale = options.sortLocale ?? 'fr';
    const { publishedSlugs, titles, aliasToSlug } = buildPublishedIndex(vaultRoot);
    const isIgnored = loadVaultGitignore(vaultRoot);

    /** @type {Record<string, Map<string, BacklinkEntry>>} */
    const backlinkMaps = {};

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
            if (!/\.mdx?$/i.test(entry.name)) continue;

            const vaultRel = path.relative(vaultRoot, full).split(path.sep).join('/');
            if (isIgnored(vaultRel)) continue;

            const fromSlug = vaultRel.replace(/\.mdx?$/i, '');
            const body = stripFrontmatter(fs.readFileSync(full, 'utf-8'));
            const targets = [
                ...extractWikiTargets(body),
                ...extractMarkdownInternalTargets(body),
            ];

            for (const rawTarget of targets) {
                const toSlug = resolveLinkTargetFromSource(rawTarget, fromSlug, publishedSlugs, aliasToSlug);
                if (!toSlug || toSlug === fromSlug) continue;

                if (!backlinkMaps[toSlug]) backlinkMaps[toSlug] = new Map();
                if (!backlinkMaps[toSlug].has(fromSlug)) {
                    backlinkMaps[toSlug].set(fromSlug, {
                        from: fromSlug,
                        title: titles.get(fromSlug) ?? humanizeSlug(fromSlug),
                        section: sectionFromVaultPath(fromSlug),
                    });
                }
            }
        }
    }

    walk(vaultRoot);

    /** @type {Record<string, BacklinkEntry[]>} */
    const backlinks = {};
    for (const [target, map] of Object.entries(backlinkMaps)) {
        backlinks[target] = [...map.values()].sort((a, b) =>
            a.title.localeCompare(b.title, sortLocale, { sensitivity: 'base' }),
        );
    }

    return {
        generatedAt: new Date().toISOString(),
        backlinks,
    };
}

/** @typedef {{ from: string, raw: string, path: string }} UnresolvedLink */

/**
 * @param {string} vaultRoot
 * @returns {UnresolvedLink[]}
 */
export function collectUnresolvedLinks(vaultRoot) {
    const { publishedSlugs, aliasToSlug } = buildPublishedIndex(vaultRoot);
    const isIgnored = loadVaultGitignore(vaultRoot);
    /** @type {UnresolvedLink[]} */
    const unresolved = [];

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
            if (!/\.mdx?$/i.test(entry.name)) continue;

            const vaultRel = path.relative(vaultRoot, full).split(path.sep).join('/');
            if (isIgnored(vaultRel)) continue;

            const fromSlug = vaultRel.replace(/\.mdx?$/i, '');
            const body = stripFrontmatter(fs.readFileSync(full, 'utf-8'));
            const targets = [
                ...extractWikiTargets(body),
                ...extractMarkdownInternalTargets(body),
            ];

            for (const rawTarget of targets) {
                const pathTarget = resolveLinkTargetPath(rawTarget, fromSlug);
                const toSlug = resolveLinkTarget(pathTarget, publishedSlugs, aliasToSlug);
                if (toSlug && toSlug !== fromSlug) continue;
                if (toSlug === fromSlug) continue;
                unresolved.push({ from: fromSlug, raw: rawTarget, path: pathTarget });
            }
        }
    }

    walk(vaultRoot);
    unresolved.sort((a, b) => a.path.localeCompare(b.path) || a.from.localeCompare(b.from));
    return unresolved;
}

/**
 * @param {BacklinkEntry[]} entries
 * @param {string} currentSlug
 * @param {{ excludeSourceSlugs?: Set<string>, excludeTargetSlugs?: Set<string> }} [filter]
 * @returns {BacklinkEntry[]}
 */
export function filterBacklinksForDisplay(entries, currentSlug, filter = {}) {
    const { excludeSourceSlugs, excludeTargetSlugs } = filter;
    if (excludeTargetSlugs?.has(currentSlug)) return [];

    return entries.filter((e) => {
        if (e.from === currentSlug) return false;
        if (excludeSourceSlugs?.has(e.from)) return false;
        return true;
    });
}

/**
 * @param {string} vaultRoot
 * @returns {{ excludeSourceSlugs: Set<string>, excludeTargetSlugs: Set<string> }}
 */
export function getLexiconDisplayExclusions(vaultRoot) {
    const config = loadLexiconConfig(vaultRoot);
    if (!isLexiconEnabled(config)) {
        return { excludeSourceSlugs: new Set(), excludeTargetSlugs: new Set() };
    }
    const slugs = getLexiconExcludeSlugs(config);
    return {
        excludeSourceSlugs: new Set(slugs),
        excludeTargetSlugs: new Set(slugs),
    };
}
