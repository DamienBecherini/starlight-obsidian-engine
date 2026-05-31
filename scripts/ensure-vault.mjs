// @ts-check
/**
 * Checks that the vault is reachable before dev/build.
 * Creates the junction if the sibling vault exists but is not linked yet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { projectRoot, resolveVaultPath, envVaultPath } from '../config/vault.mjs';
const linkPath = path.join(projectRoot, 'src/content/docs');
const targetVault = envVaultPath();

const vaultPath = resolveVaultPath();

if (!fs.existsSync(vaultPath)) {
    console.warn(`⚠️ Vault not found: ${vaultPath}`);
    console.warn('   Set VAULT_PATH in .env or run: npm run link:vault');
    process.exit(0);
}

const needsLink =
    !!targetVault &&
    fs.existsSync(targetVault) &&
    !fs.existsSync(linkPath) &&
    path.normalize(vaultPath) !== path.normalize(linkPath);

if (needsLink) {
    try {
        execSync('node scripts/link-vault.mjs', { cwd: projectRoot, stdio: 'inherit' });
    } catch {
        console.warn('⚠️ Automatic vault linking failed. Run: npm run link:vault');
    }
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
