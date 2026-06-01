// @ts-check
/**
 * Creates a junction (Windows) or a symlink (Unix): src/content/docs → VAULT_PATH.
 * The vault path is defined by VAULT_PATH (.env or environment variable).
 * Usage: npm run link:vault
 */
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, envVaultPath } from '../config/vault.mjs';

const linkPath = path.join(projectRoot, 'src/content/docs');
const targetPath = envVaultPath();

if (!targetPath) {
    console.error('❌ VAULT_PATH is not defined.');
    console.error('   Set it in .env, e.g.: VAULT_PATH=../my-obsidian-vault');
    process.exit(1);
}

if (!fs.existsSync(targetPath)) {
    console.error(`❌ Vault not found: ${targetPath}`);
    console.error('   Check VAULT_PATH in .env');
    process.exit(1);
}

if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
        fs.unlinkSync(linkPath);
        console.log('ℹ️ Old symlink removed.');
    } else {
        const entries = fs.readdirSync(linkPath);
        const onlyPlaceholders = entries.every((e) =>
            ['.gitkeep', 'README.md', 'site.config.json'].includes(e),
        );
        if (!onlyPlaceholders) {
            console.error(
                `❌ ${linkPath} exists and contains content. Move it into the vault before linking.`,
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

console.log(`✅ Link created: ${linkPath} → ${targetPath}`);
console.log('   You can also use VAULT_PATH without a symlink.');
