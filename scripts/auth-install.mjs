// @ts-check
/**
 * Protects the deployed site with Apache Basic Auth.
 * Generates .htpasswd + .htaccess (from vault AUTH_* env) and uploads them
 * to the site root over the configured protocol (FTPS/SFTP). When site.config.json
 * has an `apache` block, its site rules (HTTPS redirect, 404 page) are prepended.
 *
 * Run from the vault:  npm run auth:install
 */
import { projectRoot } from '../config/vault.mjs';
import { loadSiteConfig } from '../config/site.mjs';
import { resolveVaultGitRoot, prepareDeployConfig } from './lib/deploy.mjs';
import { authConfigFromEnv, installAuth } from './lib/auth.mjs';
import { describeApacheConfig } from './lib/htaccess.mjs';

console.log('🔒 Basic Auth — install (.htaccess + .htpasswd)');
console.log(`   Engine: ${projectRoot}`);
console.log(`   Vault:  ${resolveVaultGitRoot()}`);

const config = prepareDeployConfig();
const auth = authConfigFromEnv();
const { apache } = loadSiteConfig();

console.log(`   Protocol: ${config.protocol.toUpperCase()} (${config.host}:${config.port})`);
console.log(`   AuthUserFile: ${auth.serverRoot}/${auth.htpasswdName}`);
console.log(`   Realm: "${auth.realm}"  User: ${auth.user}`);
console.log(`   Site rules: ${describeApacheConfig(apache)}`);

await installAuth(config, auth, { apache });

console.log('\n✅ Site protected. It now answers 401 without credentials.');
