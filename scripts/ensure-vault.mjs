// @ts-check
/**
 * Vérifie que le vault est accessible avant dev/build.
 * Crée la junction si le vault sibling existe mais n'est pas encore lié.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { projectRoot, resolveVaultPath, envVaultPath } from '../config/vault.mjs';
const linkPath = path.join(projectRoot, 'src/content/docs');
const targetVault = envVaultPath();

const vaultPath = resolveVaultPath();

if (!fs.existsSync(vaultPath)) {
    console.warn(`⚠️ Vault introuvable : ${vaultPath}`);
    console.warn('   Définissez VAULT_PATH dans .env ou exécutez : npm run link:vault');
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
        console.warn('⚠️ Liaison vault automatique échouée. Exécutez : npm run link:vault');
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
    console.warn(`⚠️ Aucun fichier .md/.mdx à la racine de ${vaultPath}`);
}
