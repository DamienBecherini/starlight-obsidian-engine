// @ts-check
/**
 * Upgrades ## Voir aussi wiki links in 00-lexique entry pages:
 * [[target|Title (target)]]
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveVaultGitRoot } from '../config/vault.mjs';
import { LEXICON_DIR, GLOSSARY_BASENAME, INDEX_BASENAME } from './lib/lexicon-index.mjs';
import { buildVaultTitleIndex, upgradeVoirAussiSection } from './lib/wiki-link-label.mjs';

const vaultRoot = resolveVaultGitRoot();
const lexiconPath = path.join(vaultRoot, LEXICON_DIR);
const skip = new Set([GLOSSARY_BASENAME, INDEX_BASENAME]);
const titles = buildVaultTitleIndex(vaultRoot);

let updated = 0;
for (const name of fs.readdirSync(lexiconPath)) {
    if (!name.endsWith('.md') || skip.has(name)) continue;
    const filePath = path.join(lexiconPath, name);
    const content = fs.readFileSync(filePath, 'utf-8');
    const next = upgradeVoirAussiSection(content, titles);
    if (next !== content) {
        fs.writeFileSync(filePath, next, 'utf-8');
        updated += 1;
        console.log(`updated: ${name}`);
    }
}

console.log(`✅ Voir aussi links: ${updated} file(s) updated in ${lexiconPath}`);
