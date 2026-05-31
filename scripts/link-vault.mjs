// @ts-check
/**
 * Crée une junction (Windows) ou un symlink (Unix) : src/content/docs → VAULT_PATH.
 * Le chemin du vault est défini par VAULT_PATH (.env ou variable d'environnement).
 * Usage : npm run link:vault
 */
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, envVaultPath } from '../config/vault.mjs';

const linkPath = path.join(projectRoot, 'src/content/docs');
const targetPath = envVaultPath();

if (!targetPath) {
    console.error('❌ VAULT_PATH non défini.');
    console.error('   Renseignez-le dans .env, ex : VAULT_PATH=../mon-vault-obsidian');
    process.exit(1);
}

if (!fs.existsSync(targetPath)) {
    console.error(`❌ Vault introuvable : ${targetPath}`);
    console.error('   Vérifiez VAULT_PATH dans .env');
    process.exit(1);
}

if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
        fs.unlinkSync(linkPath);
        console.log('ℹ️ Ancien symlink supprimé.');
    } else {
        const entries = fs.readdirSync(linkPath);
        const onlyPlaceholders = entries.every((e) =>
            ['.gitkeep', 'README.txt', 'site.config.json'].includes(e),
        );
        if (!onlyPlaceholders) {
            console.error(
                `❌ ${linkPath} existe et contient du contenu. Migrez-le vers le vault avant de lier.`,
            );
            process.exit(1);
        }
        fs.rmSync(linkPath, { recursive: true, force: true });
    }
}

fs.mkdirSync(path.dirname(linkPath), { recursive: true });

if (process.platform === 'win32') {
    fs.symlinkSync(targetPath, linkPath, 'junction');
} else {
    fs.symlinkSync(targetPath, linkPath, 'dir');
}

console.log(`✅ Liaison créée : ${linkPath} → ${targetPath}`);
console.log('   Vous pouvez aussi utiliser VAULT_PATH sans symlink.');
