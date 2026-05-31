// @ts-check
/**
 * Build + remote upload (FTPS/SFTP) — no git.
 * Deploy credentials are read from the vault .env.
 *
 * Options:
 *   --no-mirror (alias --additive)   keep remote-only files
 *   --yes, -y                        skip the confirmation prompt
 */
import { projectRoot } from '../config/vault.mjs';
import {
    resolveVaultGitRoot,
    prepareDeployConfig,
    runBuild,
    uploadDist,
    mirrorFromArgv,
    confirmFromArgv,
} from './lib/deploy.mjs';

const argv = process.argv.slice(2);

console.log('🚀 Deploy — build + remote upload (no git)');
console.log(`   Engine: ${projectRoot}`);
console.log(`   Vault:  ${resolveVaultGitRoot()}`);

// Validate deploy config before building (fail-fast).
const config = prepareDeployConfig();
console.log(`   Protocol: ${config.protocol.toUpperCase()} (${config.host}:${config.port})`);
runBuild();
await uploadDist(config, { mirror: mirrorFromArgv(argv), confirm: confirmFromArgv(argv) });
