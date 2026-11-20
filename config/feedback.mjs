// @ts-check

/**
 * @typedef {Object} FeedbackConfig
 * @property {string} email Address a reader's mail program writes to ('' when none).
 * @property {string} repository GitHub repository (`owner/name`) where a reader can open a public issue ('' when none).
 * @property {boolean} rating Whether a note out of five is asked.
 * @property {boolean} topics Whether the reader can say what the opinion is about (writing, outdated content…).
 */

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

/**
 * Parses the optional `feedback` block of site.config.json:
 * `{ "email": "me@example.com", "repository": "owner/name", "rating": true, "topics": true }`.
 * Returns null (nothing is rendered) when the block is absent, or gives neither a valid address nor a valid
 * repository: a reader would have nowhere to send an opinion.
 * @param {unknown} raw
 * @returns {FeedbackConfig | null}
 */
export function parseFeedbackBlock(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const block = /** @type {Record<string, unknown>} */ (raw);
    const text = (/** @type {unknown} */ value) => (typeof value === 'string' ? value.trim() : '');
    const email = EMAIL.test(text(block.email)) ? text(block.email) : '';
    const repository = REPOSITORY.test(text(block.repository)) ? text(block.repository) : '';
    if (!email && !repository) return null;
    return { email, repository, rating: block.rating !== false, topics: block.topics !== false };
}
