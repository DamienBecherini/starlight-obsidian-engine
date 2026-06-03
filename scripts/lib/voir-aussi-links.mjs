// @ts-check
import {
    extractMarkdownInternalTargets,
    extractWikiTargets,
    resolveLinkTargetPath,
    stripFrontmatter,
} from './link-graph.mjs';

/** Matches `## Voir aussi` and `## 🔗 Voir aussi` (emoji optional). */
const VOIR_AUSSI_HEADING_RE = /^##\s+(?:\S+\s+)*Voir aussi\s*$/im;

/**
 * @param {string} markdown Full file including frontmatter.
 * @returns {string}
 */
export function extractVoirAussiSectionBody(markdown) {
    const body = stripFrontmatter(markdown);
    const match = body.match(VOIR_AUSSI_HEADING_RE);
    if (!match || match.index === undefined) return '';

    const start = match.index + match[0].length;
    const rest = body.slice(start);
    const nextHeading = rest.search(/^##\s/m);
    return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

/**
 * Resolved vault slugs (posix, no extension) linked from the Voir aussi section.
 * @param {string} markdown
 * @param {string} fromSlug Current page vault slug.
 * @returns {string[]}
 */
export function extractVoirAussiTargets(markdown, fromSlug) {
    const section = extractVoirAussiSectionBody(markdown);
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
 * @returns {Set<string>}
 */
export function voirAussiSlugSet(markdown, fromSlug) {
    return new Set(extractVoirAussiTargets(markdown, fromSlug));
}
