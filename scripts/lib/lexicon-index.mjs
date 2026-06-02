// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { loadVaultGitignore } from '../../config/gitignore.mjs';

export const LEXICON_DIR = '00-lexique';
export const GLOSSARY_BASENAME = 'glossaire-ia.md';
export const INDEX_BASENAME = 'index-lexique.md';
export const LEXICON_TAG = 'lexique';

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
 * @param {string} vaultRoot
 * @returns {LexiconEntry[]}
 */
export function collectLexiconEntries(vaultRoot) {
    const lexiconPath = path.join(vaultRoot, LEXICON_DIR);
    if (!fs.existsSync(lexiconPath)) {
        throw new Error(`Lexicon directory not found: ${lexiconPath}`);
    }

    const isIgnored = loadVaultGitignore(vaultRoot);
    /** @type {LexiconEntry[]} */
    const entries = [];

    for (const name of fs.readdirSync(lexiconPath)) {
        if (!name.endsWith('.md')) continue;
        if (name === GLOSSARY_BASENAME || name === INDEX_BASENAME) continue;

        const vaultRel = `${LEXICON_DIR}/${name}`.replace(/\\/g, '/');
        if (isIgnored(vaultRel)) continue;

        const meta = readLexiconEntry(path.join(lexiconPath, name));
        if (!meta?.tags.includes(LEXICON_TAG)) continue;

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

    entries.sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
    return entries;
}

/**
 * @typedef {Object} LexiconEntry
 * @property {string} slug
 * @property {string} title
 * @property {string} description
 * @property {string[]} warnings
 */

/**
 * @param {LexiconEntry[]} entries
 * @returns {string}
 */
/**
 * Markdown link for table cells (wiki [[path|label]] breaks GFM table parsing).
 * @param {string} slug
 * @param {string} title
 * @returns {string}
 */
export function mdLinkCell(slug, title) {
    const label = escapeTableCell(title);
    return `[${label}](/${LEXICON_DIR}/${slug}/)`;
}

export function renderIndexMarkdown(entries) {
    const rows = entries.map((e) => {
        const term = mdLinkCell(e.slug, e.title);
        const def = escapeTableCell(e.description);
        return `| ${term} | ${def} |`;
    });

    return [
        '---',
        'title: Index du lexique',
        'description: Liste alphabétique de toutes les fiches du lexique IA on-premise.',
        '---',
        '',
        'Liste générée automatiquement au build. Pour une lecture guidée, voir [[00-lexique/glossaire-ia|Glossaire IA]].',
        '',
        '| Terme | Définition |',
        '| :-- | :-- |',
        ...rows,
        '',
    ].join('\n');
}

/**
 * @param {string} vaultRoot
 * @returns {{ entries: LexiconEntry[], markdown: string, outputPath: string }}
 */
export function buildLexiconIndex(vaultRoot) {
    const entries = collectLexiconEntries(vaultRoot);
    const markdown = renderIndexMarkdown(entries);
    const outputPath = path.join(vaultRoot, LEXICON_DIR, INDEX_BASENAME);
    return { entries, markdown, outputPath };
}

/**
 * @param {string} vaultRoot
 * @returns {number} Number of entries written
 */
export function writeLexiconIndex(vaultRoot) {
    const { entries, markdown, outputPath } = buildLexiconIndex(vaultRoot);
    fs.writeFileSync(outputPath, markdown, 'utf-8');
    return entries.length;
}
