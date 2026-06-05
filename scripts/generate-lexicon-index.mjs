// @ts-check
/**
 * Regenerates the vault lexicon index from entry frontmatter.
 * Also generates locale-specific indexes (e.g. en/00-lexique/lexicon-index.md)
 * when translations are defined in site.config.json lexicon.index.translations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveVaultGitRoot } from '../config/vault.mjs';
import {
    isLexiconEnabled,
    loadLexiconConfig,
    resolveLexiconPaths,
    validateEnabledLexiconConfig,
} from '../config/lexicon.mjs';
import {
    buildLexiconIndex,
    writeLexiconIndex,
    writeLocaleIndex,
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

// Load site.config.json once to read locales alongside config
let siteLocales = /** @type {Record<string, { lang?: string }> | undefined} */ (undefined);
try {
    const raw = JSON.parse(fs.readFileSync(path.join(vaultRoot, 'site.config.json'), 'utf-8'));
    if (raw.locales && typeof raw.locales === 'object') {
        siteLocales = raw.locales;
    }
} catch {
    // non-fatal: locale generation will be skipped
}

try {
    // ── Root (default) locale ──────────────────────────────────────────────
    const { entries, outputPath } = buildLexiconIndex(vaultRoot, config);
    writeLexiconIndex(vaultRoot, config);

    const directory = config.directory.replace(/\\/g, '/');
    for (const entry of entries) {
        for (const w of entry.warnings) {
            console.warn(`⚠️  ${directory}/${entry.slug}.md: ${w}`);
        }
    }
    console.log(`✅ Lexicon index (root): ${entries.length} entries → ${outputPath}`);

    // ── Non-root locales ───────────────────────────────────────────────────
    const translations = config.index.translations;
    if (translations && siteLocales) {
        for (const [locale, localeConfig] of Object.entries(siteLocales)) {
            if (locale === 'root') continue; // root already generated above

            const translation = translations[locale];
            if (!translation) {
                console.log(`ℹ️  Locale "${locale}": no translations defined in lexicon.index.translations — skipped.`);
                continue;
            }

            // Use the locale's lang tag for sorting (fallback to locale key)
            const sortLocale = localeConfig?.lang ?? locale;

            const { count, outputPath: localePath } = writeLocaleIndex(
                vaultRoot,
                config,
                locale,
                translation,
                sortLocale,
            );

            if (count === 0) {
                console.log(`ℹ️  Locale "${locale}": no tagged entries found in ${locale}/${directory}/ — skipped.`);
            } else {
                console.log(`✅ Lexicon index (${locale}): ${count} entries → ${localePath}`);
            }
        }
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
