// @ts-check
import { filterBacklinksForDisplay } from '../../scripts/lib/link-graph.mjs';
import { isLexiconEnabled } from '../../config/lexicon.mjs';

/** @typedef {import('../../scripts/lib/link-graph.mjs').BacklinkEntry} BacklinkEntry */

export const BACKLINK_HEADING_DOC = 'Références entrantes';
export const BACKLINK_HEADING_LEXICON = 'Pages qui mentionnent ce terme';

/**
 * Lexicon UI variant: vault path under `lexicon.directory`, excluding hub/index slugs.
 * Does not rely on Starlight frontmatter tags (not always exposed in docsSchema).
 * @param {string | null | undefined} currentSlug
 * @param {import('../../config/lexicon.mjs').LexiconConfig} lexicon
 * @param {Set<string>} excludeTargetSlugs
 */
export function isLexiconBacklinkPage(currentSlug, lexicon, excludeTargetSlugs) {
    if (!isLexiconEnabled(lexicon) || !currentSlug) return false;
    const directory = lexicon.directory;
    const isEntryPath =
        currentSlug === directory || currentSlug.startsWith(`${directory}/`);
    return isEntryPath && !excludeTargetSlugs.has(currentSlug);
}

/**
 * @param {boolean} isLexiconPage
 * @returns {string}
 */
export function backlinkPanelHeading(isLexiconPage) {
    return isLexiconPage ? BACKLINK_HEADING_LEXICON : BACKLINK_HEADING_DOC;
}

/**
 * @param {BacklinkEntry[]} rawEntries
 * @param {string | null | undefined} currentSlug
 * @param {{ excludeSourceSlugs: Set<string>, excludeTargetSlugs: Set<string> }} exclusions
 * @returns {BacklinkEntry[]}
 */
export function resolveBacklinkPanelEntries(rawEntries, currentSlug, exclusions) {
    if (!currentSlug) return [];
    return filterBacklinksForDisplay(rawEntries, currentSlug, {
        excludeSourceSlugs: exclusions.excludeSourceSlugs,
        excludeTargetSlugs: exclusions.excludeTargetSlugs,
    });
}

/**
 * @param {BacklinkEntry[]} entries
 * @param {boolean} isLexiconPage
 * @param {string} [sortLocale]
 * @returns {[string, BacklinkEntry[]][]}
 */
export function groupBacklinkEntries(entries, isLexiconPage, sortLocale = 'fr') {
    /** @type {Map<string, BacklinkEntry[]>} */
    const grouped = new Map();
    if (isLexiconPage) {
        for (const entry of entries) {
            const key = entry.section || '';
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)?.push(entry);
        }
    } else {
        grouped.set('', entries);
    }
    return [...grouped.entries()].sort(([a], [b]) =>
        a.localeCompare(b, sortLocale, { sensitivity: 'base' }),
    );
}

/**
 * Pure panel model consumed by PageBacklinks.astro (headings, filtering, grouping).
 * @param {{
 *   currentSlug: string | null | undefined,
 *   rawEntries: BacklinkEntry[],
 *   lexicon: import('../../config/lexicon.mjs').LexiconConfig,
 *   exclusions: { excludeSourceSlugs: Set<string>, excludeTargetSlugs: Set<string> },
 *   sortLocale?: string,
 * }} input
 */
export function buildBacklinkPanel(input) {
    const { currentSlug, rawEntries, lexicon, exclusions, sortLocale = 'fr' } = input;
    const entries = resolveBacklinkPanelEntries(rawEntries, currentSlug, exclusions);
    const isLexiconPage = isLexiconBacklinkPage(
        currentSlug,
        lexicon,
        exclusions.excludeTargetSlugs,
    );
    return {
        entries,
        isLexiconPage,
        heading: backlinkPanelHeading(isLexiconPage),
        grouped: groupBacklinkEntries(entries, isLexiconPage, sortLocale),
        shouldRender: entries.length > 0,
    };
}
