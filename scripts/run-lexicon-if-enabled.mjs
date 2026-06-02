// @ts-check
/**
 * Runs lexicon index generation only when site.config.json has lexicon.enabled.
 * Used by predev/prebuild; exits 0 when disabled or lexicon directory is missing.
 */
import fs from 'node:fs';
import { resolveVaultGitRoot } from '../config/vault.mjs';
import {
    isLexiconEnabled,
    loadLexiconConfig,
    resolveLexiconPaths,
    validateEnabledLexiconConfig,
} from '../config/lexicon.mjs';
import { writeLexiconIndex } from './lib/lexicon-index.mjs';

const vaultRoot = resolveVaultGitRoot();
const config = loadLexiconConfig(vaultRoot);

if (!isLexiconEnabled(config)) {
    console.log('ℹ️ Lexicon disabled in site.config.json — skipping index generation.');
    process.exit(0);
}

const errors = validateEnabledLexiconConfig(config);
if (errors.length > 0) {
    console.warn(`⚠️ Lexicon enabled but invalid config: ${errors.join('; ')} — skipping.`);
    process.exit(0);
}

const paths = resolveLexiconPaths(config, vaultRoot);
if (!fs.existsSync(paths.lexiconDir)) {
    console.warn(
        `⚠️ Lexicon enabled but directory not found: ${paths.lexiconDir} — skipping index generation.`,
    );
    process.exit(0);
}

try {
    const count = writeLexiconIndex(vaultRoot, config);
    console.log(`✅ Lexicon index: ${count} entries → ${paths.indexFilePath}`);
} catch (error) {
    console.warn(
        `⚠️ Lexicon index generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(0);
}
