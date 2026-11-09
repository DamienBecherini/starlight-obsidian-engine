// @ts-check

/**
 * Turns the target of a wiki link into its permalink.
 * Inside a Markdown table, the alias separator is written `\|`, so the parser leaves the backslash
 * at the end of the target: `[[page\|label]]` gives `page\`.
 * @param {string} target
 * @returns {string}
 */
export function wikiLinkPermalink(target) {
    return target.trim().replace(/\\+$/, '').trimEnd().replace(/ /g, '-').toLowerCase();
}
