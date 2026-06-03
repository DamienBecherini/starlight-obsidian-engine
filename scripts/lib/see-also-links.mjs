// @ts-check
import {
    extractMarkdownInternalTargets,
    extractWikiTargets,
    resolveLinkTargetPath,
    stripFrontmatter,
} from './link-graph.mjs';

export const DEFAULT_SEE_ALSO_HEADINGS = [
    'Voir aussi',
    'See also',
    'Related',
    'Related pages',
];

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {readonly string[]} headings
 * @returns {RegExp}
 */
export function seeAlsoHeadingRegex(headings = DEFAULT_SEE_ALSO_HEADINGS) {
    const alternatives = headings.map(escapeRegex).join('|');
    return new RegExp(`^##\\s+(?:\\S+\\s+)*(?:${alternatives})\\s*$`, 'im');
}

/**
 * @param {string} markdown Full file including frontmatter.
 * @param {readonly string[]} [headings] Heading labels that identify a curated related-links section.
 * @returns {string}
 */
export function extractSeeAlsoSectionBody(markdown, headings = DEFAULT_SEE_ALSO_HEADINGS) {
    const body = stripFrontmatter(markdown);
    const match = body.match(seeAlsoHeadingRegex(headings));
    if (!match || match.index === undefined) return '';

    const start = match.index + match[0].length;
    const rest = body.slice(start);
    const nextHeading = rest.search(/^##\s/m);
    return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

/**
 * Resolved vault slugs (posix, no extension) linked from a curated related-links section.
 * @param {string} markdown
 * @param {string} fromSlug Current page vault slug.
 * @param {readonly string[]} [headings] Heading labels that identify a curated related-links section.
 * @returns {string[]}
 */
export function extractSeeAlsoTargets(markdown, fromSlug, headings = DEFAULT_SEE_ALSO_HEADINGS) {
    const section = extractSeeAlsoSectionBody(markdown, headings);
    if (!section.trim()) return [];

    /** @type {string[]} */
    const raw = [
        ...extractWikiTargets(section),
        ...extractMarkdownInternalTargets(section),
    ];

    const resolved = raw
        .map((target) => resolveLinkTargetPath(target, fromSlug))
        .filter(Boolean);

    return [...new Set(resolved)];
}

/**
 * @param {string} markdown
 * @param {string} fromSlug
 * @param {readonly string[]} [headings] Heading labels that identify a curated related-links section.
 * @returns {Set<string>}
 */
export function seeAlsoSlugSet(markdown, fromSlug, headings = DEFAULT_SEE_ALSO_HEADINGS) {
    return new Set(extractSeeAlsoTargets(markdown, fromSlug, headings));
}
