// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { loadVaultGitignore } from '../../config/gitignore.mjs';

/** @typedef {import('../../config/lexicon.mjs').LexiconConfigEnabled} LexiconConfigEnabled */

/**
 * @param {string} cell
 * @returns {string}
 */
export function escapeTableCell(cell) {
    return String(cell ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ')
        .trim();
}

/**
 * Minimal YAML frontmatter parse for lexicon entries (title, description, tags).
 * @param {string} raw
 * @returns {{ title?: string, description?: string, tags: string[] }}
 */
export function parseLexiconFrontmatter(raw) {
    /** @type {{ title?: string, description?: string, tags: string[] }} */
    const out = { tags: [] };
    let currentList = /** @type {string | null} */ (null);

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const listItem = trimmed.match(/^- (.+)$/);
        if (listItem && currentList === 'tags') {
            out.tags.push(listItem[1].trim().replace(/^['"]|['"]$/g, ''));
            continue;
        }

        currentList = null;
        const kv = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!kv) continue;

        const key = kv[1];
        let value = kv[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (key === 'title') out.title = value;
        else if (key === 'description') out.description = value;
        else if (key === 'tags' && value) {
            out.tags.push(value.replace(/^['"]|['"]$/g, ''));
        } else if (key === 'tags' && !value) {
            currentList = 'tags';
        }
    }

    return out;
}

/**
 * @param {string} filePath
 * @returns {{ title?: string, description?: string, tags: string[] } | null}
 */
export function readLexiconEntry(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;
    return parseLexiconFrontmatter(match[1]);
}

/**
 * @typedef {Object} LexiconEntry
 * @property {string} slug
 * @property {string} title
 * @property {string} description
 * @property {string[]} warnings
 */

/**
 * @param {string} vaultRoot
 * @param {LexiconConfigEnabled} config
 * @returns {LexiconEntry[]}
 */
export function collectLexiconEntries(vaultRoot, config) {
    const { lexiconDir, hubBasename, indexBasename } = resolvePathsFromConfig(config, vaultRoot);
    if (!fs.existsSync(lexiconDir)) {
        throw new Error(`Lexicon directory not found: ${lexiconDir}`);
    }

    const directory = config.directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const isIgnored = loadVaultGitignore(vaultRoot);
    /** @type {LexiconEntry[]} */
    const entries = [];

    for (const name of fs.readdirSync(lexiconDir)) {
        if (!name.endsWith('.md')) continue;
        if (name === hubBasename || name === indexBasename) continue;

        const vaultRel = `${directory}/${name}`.replace(/\\/g, '/');
        if (isIgnored(vaultRel)) continue;

        const meta = readLexiconEntry(path.join(lexiconDir, name));
        if (!meta?.tags.includes(config.entryTag)) continue;

        const slug = name.replace(/\.md$/i, '');
        entries.push({
            slug,
            title: meta.title?.trim() || slug,
            description: meta.description?.trim() || '-',
            warnings: [],
        });

        const entry = entries[entries.length - 1];
        if (!meta.title?.trim()) entry.warnings.push('missing title');
        if (!meta.description?.trim()) entry.warnings.push('missing description');
    }

    entries.sort((a, b) =>
        a.title.localeCompare(b.title, config.sortLocale, { sensitivity: 'base' }),
    );
    return entries;
}

/**
 * @param {LexiconConfigEnabled} config
 * @param {string} vaultRoot
 */
function resolvePathsFromConfig(config, vaultRoot) {
    const dir = config.directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const lexiconDir = path.join(vaultRoot, dir);
    const indexBasename = path.basename(config.indexPage);
    return {
        lexiconDir,
        hubBasename: path.basename(config.hubPage),
        indexBasename,
        directory: dir,
        indexFilePath: path.join(lexiconDir, indexBasename),
    };
}

/**
 * Generates an Obsidian wikilink for a lexicon entry.
 * Uses list format (not table) to avoid GFM table pipe conflicts with the alias divider.
 * @param {string} slug
 * @param {string} title
 * @param {string} directory
 * @returns {string}
 */
export function mdWikiLink(slug, title, directory) {
    return `[[${directory}/${slug}|${title.trim()}]]`;
}

/**
 * @param {LexiconEntry[]} entries
 * @param {LexiconConfigEnabled} config
 * @returns {string}
 */
export function renderIndexMarkdown(entries, config) {
    const directory = config.directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const items = entries.map((e) => {
        const link = mdWikiLink(e.slug, e.title, directory);
        const def = e.description.replace(/\r?\n/g, ' ').trim();
        return `- ${link} — ${def}`;
    });

    return [
        '---',
        `title: ${config.index.title}`,
        `description: ${config.index.description}`,
        '---',
        '',
        config.index.intro,
        '',
        ...items,
        '',
    ].join('\n');
}

/**
 * @param {string} vaultRoot
 * @param {LexiconConfigEnabled} config
 * @returns {{ entries: LexiconEntry[], markdown: string, outputPath: string }}
 */
export function buildLexiconIndex(vaultRoot, config) {
    const entries = collectLexiconEntries(vaultRoot, config);
    const markdown = renderIndexMarkdown(entries, config);
    const { indexFilePath } = resolvePathsFromConfig(config, vaultRoot);
    return { entries, markdown, outputPath: indexFilePath };
}

/**
 * @param {string} vaultRoot
 * @param {LexiconConfigEnabled} config
 * @returns {number} Number of entries written
 */
export function writeLexiconIndex(vaultRoot, config) {
    const { entries, markdown, outputPath } = buildLexiconIndex(vaultRoot, config);
    fs.writeFileSync(outputPath, markdown, 'utf-8');
    return entries.length;
}
