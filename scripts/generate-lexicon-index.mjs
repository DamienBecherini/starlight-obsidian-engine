// @ts-check
/**
 * Regenerates the vault lexicon index from entry frontmatter.
 * Also generates locale-specific indexes (e.g. en/00-lexique/lexicon-index.md)
 * when translations are defined in site.config.json lexicon.index.translations.
 */
import fs from 'node:fs';
import { resolveVaultGitRoot } from '../config/vault.mjs';
import {
    isLexiconEnabled,
    loadLexiconConfig,
    resolveLexiconPaths,
    validateEnabledLexiconConfig,
} from '../config/lexicon.mjs';
import {
    buildLexiconIndex,
    loadVaultLocales,
    writeLocalizedLexiconIndexes,
} from './lib/lexicon-index.mjs';

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
    // ── Root (default) locale ──────────────────────────────────────────────
    const { entries, markdown, outputPath } = buildLexiconIndex(vaultRoot, config);
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    const directory = config.directory.replace(/\\/g, '/');
    for (const entry of entries) {
        for (const w of entry.warnings) {
            console.warn(`⚠️  ${directory}/${entry.slug}.md: ${w}`);
        }
    }
    console.log(`✅ Lexicon index (root): ${entries.length} entries → ${outputPath}`);

    // ── Non-root locales ───────────────────────────────────────────────────
    for (const { locale, index, skipped } of writeLocalizedLexiconIndexes(vaultRoot, config, loadVaultLocales(vaultRoot))) {
        if (!index) {
            console.log(`ℹ️  Locale "${locale}": ${skipped} — skipped.`);
            continue;
        }
        for (const entry of index.entries) {
            for (const w of entry.fallback ? [] : entry.warnings) {
                console.warn(`⚠️  ${locale}/${directory}/${entry.slug}.md: ${w}`);
            }
        }
        console.log(
            `✅ Lexicon index (${locale}): ${index.entries.length} entries (${index.fallbacks} fallback) → ${index.outputPath}`,
        );
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
