// @ts-check
/**
 * Lists wiki-links and internal Markdown links that do not resolve to a published vault page.
 * Useful for lexicon backlog maintenance and broken-link audits.
 */
import { resolveVaultGitRoot } from '../config/vault.mjs';
import { collectUnresolvedLinks } from './lib/link-graph.mjs';

const vaultRoot = resolveVaultGitRoot();
const unresolved = collectUnresolvedLinks(vaultRoot);

if (!unresolved.length) {
    console.log('✅ No unresolved internal links in published vault content.');
    process.exit(0);
}

console.log(`⚠️  ${unresolved.length} unresolved internal link(s):\n`);
for (const item of unresolved) {
    console.log(`  ${item.from}`);
    console.log(`    raw: ${item.raw}`);
    console.log(`    path: ${item.path}`);
    console.log('');
}

process.exit(1);
