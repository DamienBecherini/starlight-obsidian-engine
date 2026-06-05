// @ts-check
/**
 * Checks that the vault is reachable before dev/build.
 * With docsDir set in starlight config, no junction is required — this script
 * only validates that the vault path exists and contains markdown files.
 * To create an optional junction for IDE navigation: npm run link:vault
 */
import fs from 'node:fs';
import { resolveVaultPath } from '../config/vault.mjs';

const vaultPath = resolveVaultPath();

if (!fs.existsSync(vaultPath)) {
    console.warn(`⚠️ Vault not found: ${vaultPath}`);
    console.warn('   Set VAULT_PATH in engine .env, or use --vault=<name> / npm run dev:<name>');
    process.exit(0);
}

const hasMd = fs
    .readdirSync(vaultPath, { withFileTypes: true })
    .some(
        (e) =>
            e.isFile() &&
            /\.(md|mdx)$/i.test(e.name) &&
            !e.name.startsWith('_') &&
            e.name.toLowerCase() !== 'readme.md',
    );

if (!hasMd) {
    console.warn(`⚠️ No .md/.mdx file at the root of ${vaultPath}`);
}
