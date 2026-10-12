// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { loadVaultPublishFilter } from '../../config/gitignore.mjs';

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
 * Formats a frontmatter value as a YAML scalar: plain when safe, double-quoted (JSON escaping,
 * valid YAML) when it contains `: `, ` #`, a leading indicator character or a trailing colon.
 * @param {string} value
 * @returns {string}
 */
export function yamlScalar(value) {
    const text = String(value ?? '');
    const unsafe =
        text === '' ||
        text !== text.trim() ||
        /: |\s#|:$/.test(text) ||
        /^[-?:,[\]{}#&*!|>'"%@`]/.test(text) ||
        /[\r\n]/.test(text);
    return unsafe ? JSON.stringify(text) : text;
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
    const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
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
    const isIgnored = loadVaultPublishFilter(vaultRoot);
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
 * Generates a GFM table cell Markdown link for a lexicon entry.
 * Uses `escapeTableCell` on the title so pipe characters don't break the table.
 * @param {string} slug
 * @param {string} title
 * @param {string} directory Site path of the entry folder (e.g. `00-lexique` or `en/00-lexique`).
 * @returns {string}
 */
export function mdLinkCell(slug, title, directory) {
    const label = escapeTableCell(title);
    return `[${label}](/${directory}/${slug}/)`;
}

/** Built-in table header labels; other languages fall back to English. */
const INDEX_LABELS = {
    fr: { term: 'Terme', definition: 'Définition' },
    en: { term: 'Term', definition: 'Definition' },
};

/**
 * Table header labels of a lexicon index for a language (BCP 47 tag such as `fr` or `en-US`).
 * @param {string | undefined} lang
 * @returns {{ term: string, definition: string }}
 */
export function lexiconIndexLabels(lang) {
    const base = (lang ?? '').toLowerCase().split('-')[0];
    return base === 'fr' ? INDEX_LABELS.fr : INDEX_LABELS.en;
}

/**
 * Wiki link to the lexicon hub, or '' when `hubLink` is unset or the intro already links the hub.
 * A bare `hubLink.path` is relative to the lexicon directory.
 * @param {{ intro: string, hubLink?: { path: string, label: string } }} meta
 * @param {string} directory Vault-relative lexicon directory (default-locale form).
 * @returns {string}
 */
export function hubLinkMarkdown(meta, directory) {
    if (!meta.hubLink) return '';
    const target = meta.hubLink.path.includes('/') ? meta.hubLink.path : `${directory}/${meta.hubLink.path}`;
    if (meta.intro.includes(`[[${target}`)) return '';
    return `→ [[${target}|${meta.hubLink.label}]]`;
}

/**
 * @typedef {Object} LexiconIndexRow
 * @property {string} slug
 * @property {string} title
 * @property {string} description
 * @property {string} directory Site path of the entry folder the link points to.
 * @property {string} [note] Text appended after the link (e.g. the language of a fallback entry).
 */

/**
 * Renders an index page: frontmatter, intro, optional hub link, `Term | Definition` table.
 * @param {LexiconIndexRow[]} rows
 * @param {{ title: string, description: string, intro: string, hubLink?: { path: string, label: string } }} meta
 * @param {{ term: string, definition: string }} labels
 * @param {string} directory Vault-relative lexicon directory (default-locale form).
 * @returns {string}
 */
function renderIndexPage(rows, meta, labels, directory) {
    const hubLine = hubLinkMarkdown(meta, directory);
    return [
        '---',
        `title: ${yamlScalar(meta.title)}`,
        `description: ${yamlScalar(meta.description)}`,
        '---',
        '',
        meta.intro,
        '',
        ...(hubLine ? [hubLine, ''] : []),
        `| ${labels.term} | ${labels.definition} |`,
        '| :-- | :-- |',
        ...rows.map((row) => {
            const term = mdLinkCell(row.slug, row.title, row.directory);
            const note = row.note ? ` ${escapeTableCell(row.note)}` : '';
            return `| ${term}${note} | ${escapeTableCell(row.description)} |`;
        }),
        '',
    ].join('\n');
}

/**
 * @param {string} directory
 * @returns {string}
 */
function trimDirectory(directory) {
    return directory.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * Default-locale index (header labels in the `sortLocale` language).
 * @param {LexiconEntry[]} entries
 * @param {LexiconConfigEnabled} config
 * @returns {string}
 */
export function renderIndexMarkdown(entries, config) {
    const directory = trimDirectory(config.directory);
    const rows = entries.map((e) => ({ ...e, directory }));
    return renderIndexPage(rows, config.index, lexiconIndexLabels(config.sortLocale), directory);
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

// ---------------------------------------------------------------------------
// Localized indexes (e.g. en/00-lexique/lexicon-index.md)
// ---------------------------------------------------------------------------

/**
 * @typedef {LexiconEntry & { fallback: boolean }} LocalizedLexiconEntry
 * `fallback` is true when the locale has no mirror of the entry (title, description and link
 * then come from the default-locale entry).
 */

/**
 * @typedef {Object} LocalizedLexiconIndex
 * @property {string} locale
 * @property {LocalizedLexiconEntry[]} entries
 * @property {number} fallbacks Number of entries without a localized mirror.
 * @property {string} markdown
 * @property {string} outputPath
 */

/**
 * Builds the index of a non-default locale from the entries of its mirror folder
 * (`<locale>/<directory>/`), with the same publish filtering as the default index. Every
 * default-locale entry is listed: in the locale (link to `/<locale>/<directory>/<slug>/`) when
 * mirrored, otherwise from the default-locale entry, linked to the default-locale page and marked
 * with the default language code (e.g. `(FR)`). Returns null when the mirror folder does not exist.
 * @param {string} vaultRoot
 * @param {LexiconConfigEnabled} config
 * @param {string} locale Locale key (e.g. `en`).
 * @param {import('../../config/lexicon.mjs').LexiconIndexTranslation} translation
 * @param {{ lang?: string, defaultLang?: string }} [langs] Locale and default-locale BCP 47 tags.
 * @returns {LocalizedLexiconIndex | null}
 */
export function buildLocalizedLexiconIndex(vaultRoot, config, locale, translation, langs = {}) {
    const directory = trimDirectory(config.directory);
    const localeDirectory = `${locale}/${directory}`;
    if (!fs.existsSync(path.join(vaultRoot, localeDirectory))) return null;

    const lang = langs.lang ?? locale;
    const defaultLang = langs.defaultLang ?? config.sortLocale;
    const fallbackNote = `(${defaultLang.split('-')[0].toUpperCase()})`;

    const localized = new Map(
        collectLexiconEntries(vaultRoot, { ...config, directory: localeDirectory }).map((e) => [e.slug, e]),
    );
    /** @type {Array<LocalizedLexiconEntry & { directory: string, note?: string }>} */
    const rows = [];
    for (const entry of collectLexiconEntries(vaultRoot, config)) {
        const mirror = localized.get(entry.slug);
        localized.delete(entry.slug);
        rows.push(
            mirror
                ? { ...mirror, fallback: false, directory: localeDirectory }
                : { ...entry, fallback: true, directory, note: fallbackNote },
        );
    }
    // Entries that only exist in the locale.
    for (const mirror of localized.values()) rows.push({ ...mirror, fallback: false, directory: localeDirectory });
    rows.sort((a, b) => a.title.localeCompare(b.title, lang, { sensitivity: 'base' }));

    return {
        locale,
        entries: rows.map(({ slug, title, description, warnings, fallback }) => ({ slug, title, description, warnings, fallback })),
        fallbacks: rows.filter((row) => row.fallback).length,
        markdown: renderIndexPage(rows, translation, lexiconIndexLabels(lang), directory),
        outputPath: path.join(vaultRoot, localeDirectory, path.basename(config.indexPage)),
    };
}

/**
 * Locales declared in the vault `site.config.json` (`{}` when missing or unreadable).
 * @param {string} vaultRoot
 * @returns {Record<string, { lang?: string }>}
 */
export function loadVaultLocales(vaultRoot) {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(vaultRoot, 'site.config.json'), 'utf-8'));
        return raw.locales && typeof raw.locales === 'object' ? raw.locales : {};
    } catch {
        return {};
    }
}

/**
 * @typedef {Object} LocalizedIndexResult
 * @property {string} locale
 * @property {LocalizedLexiconIndex | null} index Null when skipped.
 * @property {string} [skipped] Why the locale was skipped.
 */

/**
 * Writes the index of every non-default locale that has a `lexicon.index.translations` entry and
 * a mirror of the lexicon folder.
 * @param {string} vaultRoot
 * @param {LexiconConfigEnabled} config
 * @param {Record<string, { lang?: string }>} locales Site locales (`root` = default locale).
 * @returns {LocalizedIndexResult[]}
 */
export function writeLocalizedLexiconIndexes(vaultRoot, config, locales) {
    /** @type {LocalizedIndexResult[]} */
    const results = [];
    const defaultLang = locales.root?.lang ?? config.sortLocale;
    for (const [locale, localeConfig] of Object.entries(locales)) {
        if (locale === 'root') continue;
        const translation = config.index.translations?.[locale];
        if (!translation) {
            results.push({ locale, index: null, skipped: 'no lexicon.index.translations entry' });
            continue;
        }
        const index = buildLocalizedLexiconIndex(vaultRoot, config, locale, translation, {
            lang: localeConfig?.lang ?? locale,
            defaultLang,
        });
        if (!index) {
            results.push({ locale, index: null, skipped: `no ${locale}/${trimDirectory(config.directory)}/ folder` });
            continue;
        }
        fs.writeFileSync(index.outputPath, index.markdown, 'utf-8');
        results.push({ locale, index });
    }
    return results;
}
