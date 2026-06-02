// @ts-check
/**
 * Upgrades ## Voir aussi wiki links in lexicon entry pages.
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
import { buildVaultTitleIndex, upgradeVoirAussiSection } from './lib/wiki-link-label.mjs';

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

const skip = new Set([paths.hubBasename, paths.indexBasename]);
const titles = buildVaultTitleIndex(vaultRoot);

let updated = 0;
for (const name of fs.readdirSync(paths.lexiconDir)) {
    if (!name.endsWith('.md') || skip.has(name)) continue;
    const filePath = path.join(paths.lexiconDir, name);
    const content = fs.readFileSync(filePath, 'utf-8');
    const next = upgradeVoirAussiSection(content, titles);
    if (next !== content) {
        fs.writeFileSync(filePath, next, 'utf-8');
        updated += 1;
        console.log(`updated: ${name}`);
    }
}

console.log(`✅ Voir aussi links: ${updated} file(s) updated in ${paths.lexiconDir}`);
