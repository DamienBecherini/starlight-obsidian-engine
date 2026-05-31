// @ts-check
/**
 * Remote upload only (FTPS/SFTP) — no git, no build.
 * Uploads the existing engine dist/ using deploy credentials from the vault .env.
 *
 * Options:
 *   --no-mirror (alias --additive)   keep remote-only files
 *   --yes, -y                        skip the confirmation prompt
 */
import { projectRoot } from '../config/vault.mjs';
import {
    resolveVaultGitRoot,
    prepareDeployConfig,
    uploadDist,
    mirrorFromArgv,
    confirmFromArgv,
} from './lib/deploy.mjs';

const argv = process.argv.slice(2);

console.log('📤 Upload — remote deploy (no git, no build)');
console.log(`   Engine: ${projectRoot}`);
console.log(`   Vault:  ${resolveVaultGitRoot()}`);

const config = prepareDeployConfig();
console.log(`   Protocol: ${config.protocol.toUpperCase()} (${config.host}:${config.port})`);
await uploadDist(config, { mirror: mirrorFromArgv(argv), confirm: confirmFromArgv(argv) });
