// @ts-check
/**
 * Regenerates vault 00-lexique/index-lexique.md from lexicon frontmatter.
 */
import { resolveVaultGitRoot } from '../config/vault.mjs';
import { buildLexiconIndex, writeLexiconIndex } from './lib/lexicon-index.mjs';

const vaultRoot = resolveVaultGitRoot();

try {
    const { entries, outputPath } = buildLexiconIndex(vaultRoot);
    writeLexiconIndex(vaultRoot);

    for (const entry of entries) {
        for (const w of entry.warnings) {
            console.warn(`⚠️ 00-lexique/${entry.slug}.md: ${w}`);
        }
    }

    console.log(`✅ Lexicon index: ${entries.length} entries → ${outputPath}`);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
