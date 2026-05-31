// @ts-check
/**
 * Removes Apache Basic Auth from the deployed site.
 * Deletes .htaccess (and .htpasswd unless --keep-htpasswd) from the site root.
 *
 * Run from the vault:  npm run auth:remove [-- --keep-htpasswd] [-- --yes]
 */
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot } from '../config/vault.mjs';
import { resolveVaultGitRoot, prepareDeployConfig } from './lib/deploy.mjs';
import { authConfigFromEnv, removeAuth } from './lib/auth.mjs';

const argv = process.argv.slice(2);
const keepHtpasswd = argv.includes('--keep-htpasswd');
const assumeYes = argv.includes('--yes') || argv.includes('-y');

console.log('🔓 Basic Auth — remove');
console.log(`   Engine: ${projectRoot}`);
console.log(`   Vault:  ${resolveVaultGitRoot()}`);

const config = prepareDeployConfig();
const auth = authConfigFromEnv();

console.log(`   Protocol: ${config.protocol.toUpperCase()} (${config.host}:${config.port})`);
console.log(
    `   Will remove: .htaccess${keepHtpasswd ? '' : `, ${auth.htpasswdName}`} from the site root`,
);

if (process.stdin.isTTY && !assumeYes) {
    const rl = readline.createInterface({ input, output });
    try {
        const answer = (await rl.question('\nThis makes the site public again. Proceed? (y/N) '))
            .trim()
            .toLowerCase();
        if (answer !== 'y' && answer !== 'yes') {
            console.log('Cancelled.');
            process.exit(0);
        }
    } finally {
        rl.close();
    }
}

await removeAuth(config, auth, { keepHtpasswd });

console.log('\n✅ Basic Auth removed. The site is public again.');
