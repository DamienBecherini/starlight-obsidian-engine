// @ts-check
/**
 * Resolves a named vault from the engine .env registry and spawns an npm script
 * with VAULT_PATH + FORCE_VAULT_PATH=1 set in the child environment.
 *
 * Usage:
 *   node scripts/run-with-vault.mjs <vault-name> <npm-script> [...extra-args]
 *
 * Examples:
 *   node scripts/run-with-vault.mjs craft dev
 *   node scripts/run-with-vault.mjs ia-on-prem build
 *   node scripts/run-with-vault.mjs craft publish -- --skip-git -y
 *
 * The vault name is resolved via VAULT_<name> in the engine .env (loaded by config/vault.mjs).
 * No file is mutated; the resolved path lives only in the child process environment.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot } from '../config/vault.mjs';

function printUsage() {
    const registered = Object.keys(process.env)
        .filter((k) => k.startsWith('VAULT_') && k !== 'VAULT_PATH')
        .map((k) => k.replace(/^VAULT_/, ''));

    console.log(`
Usage: node scripts/run-with-vault.mjs <vault-name> <npm-script> [...args]

Examples:
  node scripts/run-with-vault.mjs craft dev
  node scripts/run-with-vault.mjs ia-on-prem build
  node scripts/run-with-vault.mjs craft publish -- --skip-git -y
`);
    if (registered.length) {
        console.log(`Registered vaults (from engine .env):\n  ${registered.join('\n  ')}`);
    } else {
        console.log('No vaults registered yet. Add VAULT_<name>=<path> to engine .env');
    }
}

const [vaultName, npmScript, ...rest] = process.argv.slice(2);

if (!vaultName || !npmScript) {
    printUsage();
    process.exit(vaultName ? 1 : 0);
}

const key = `VAULT_${vaultName}`;
const raw = process.env[key];

if (!raw) {
    const registered = Object.keys(process.env)
        .filter((k) => k.startsWith('VAULT_') && k !== 'VAULT_PATH')
        .map((k) => k.replace(/^VAULT_/, ''));
    console.error(`❌ Unknown vault "${vaultName}". Add ${key}=<path> to engine .env`);
    if (registered.length) console.error(`   Registered vaults: ${registered.join(', ')}`);
    process.exit(1);
}

const abs = path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);

const outDir = `dist/${vaultName}`;

console.log(`🗂️  Vault: ${vaultName} → ${abs}`);
console.log(`📦 Output: ${outDir}`);
console.log(`▶  npm run ${npmScript}${rest.length ? ' ' + rest.join(' ') : ''}\n`);

const result = spawnSync('npm', ['run', npmScript, ...rest], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    env: {
        ...process.env,
        VAULT_PATH: abs,
        FORCE_VAULT_PATH: '1',
        VAULT_SLUG: vaultName,
        ASTRO_OUT_DIR: outDir,
    },
});

process.exit(result.status ?? 0);
