// @ts-check
/**
 * Uploads the Apache site rules (site.config.json → `apache`: HTTPS redirect, 404 page) as the
 * site-root `.htaccess`, for a public site. Deploy never uploads dotfiles, so this is how the
 * rules reach the server. A Basic Auth site uses `auth:install` instead (it prepends the same
 * rules), so this script refuses to run when AUTH_* is set: it would drop the password protection.
 *
 * Run from the vault:  npm run htaccess:install [-- --yes]
 */
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { projectRoot } from '../config/vault.mjs';
import { loadSiteConfig } from '../config/site.mjs';
import { resolveVaultGitRoot, prepareDeployConfig } from './lib/deploy.mjs';
import { uploadRootFiles } from './lib/auth.mjs';
import { authEnvKeysSet, buildSiteHtaccess, describeApacheConfig } from './lib/htaccess.mjs';

const argv = process.argv.slice(2);
const assumeYes = argv.includes('--yes') || argv.includes('-y');

console.log('🧭 Apache site rules — install (.htaccess)');
console.log(`   Engine: ${projectRoot}`);
console.log(`   Vault:  ${resolveVaultGitRoot()}`);

const config = prepareDeployConfig();

const authKeys = authEnvKeysSet(process.env);
if (authKeys.length) {
    console.error(`❌ Basic Auth is configured (${authKeys.join(', ')} in the vault .env).`);
    console.error('   Run `npm run auth:install` instead: it uploads the site rules and the Basic Auth rules together.');
    process.exit(1);
}

const { apache } = loadSiteConfig();
const siteRules = buildSiteHtaccess(apache);
if (!siteRules) {
    console.error('❌ Nothing to install: add an "apache" block to the vault site.config.json, e.g.');
    console.error('   "apache": { "forceHttps": true, "notFoundPage": "/404.html" }');
    process.exit(1);
}

console.log(`   Protocol: ${config.protocol.toUpperCase()} (${config.host}:${config.port})`);
console.log(`   Site rules: ${describeApacheConfig(apache)}`);
console.log('   Will replace: .htaccess at the site root\n');
console.log(siteRules);

if (process.stdin.isTTY && !assumeYes) {
    const rl = readline.createInterface({ input, output });
    try {
        const answer = (await rl.question('This overwrites the remote .htaccess. Proceed? (y/N) '))
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

await uploadRootFiles(config, [{ name: '.htaccess', content: siteRules }]);

console.log('\n✅ Site rules installed.');
