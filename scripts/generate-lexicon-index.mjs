// @ts-check
/**
 * Regenerates the vault lexicon index from entry frontmatter (strict CLI).
 */
import fs from 'node:fs';
import { resolveVaultGitRoot } from '../config/vault.mjs';
import {
    isLexiconEnabled,
    loadLexiconConfig,
    resolveLexiconPaths,
    validateEnabledLexiconConfig,
} from '../config/lexicon.mjs';
import { buildLexiconIndex, writeLexiconIndex } from './lib/lexicon-index.mjs';

const vaultRoot = resolveVaultGitRoot();
const config = loadLexiconConfig(vaultRoot);

if (!isLexiconEnabled(config)) {
    console.error(
        'Lexicon is not enabled. Add a "lexicon" block with "enabled": true to site.config.json.',
    );
    process.exit(1);
}

const errors = validateEnabledLexiconConfig(config);
if (errors.length > 0) {
    console.error(`Invalid lexicon configuration:\n- ${errors.join('\n- ')}`);
    process.exit(1);
}

const paths = resolveLexiconPaths(config, vaultRoot);
if (!fs.existsSync(paths.lexiconDir)) {
    console.error(`Lexicon directory not found: ${paths.lexiconDir}`);
    process.exit(1);
}

try {
    const { entries, outputPath } = buildLexiconIndex(vaultRoot, config);
    writeLexiconIndex(vaultRoot, config);

    const directory = config.directory.replace(/\\/g, '/');
    for (const entry of entries) {
        for (const w of entry.warnings) {
            console.warn(`⚠️ ${directory}/${entry.slug}.md: ${w}`);
        }
    }

    console.log(`✅ Lexicon index: ${entries.length} entries → ${outputPath}`);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
