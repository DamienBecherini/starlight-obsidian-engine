// @ts-check
/**
 * Lists wiki-links and internal Markdown links that do not resolve to a published vault page.
 * Default: exit 1 only on unexpected unresolved links (allowlist from lexicon backlog + roadmap placeholders).
 * --strict: exit 1 on any unresolved link.
 * --warn-only: always exit 0.
 */
import { resolveVaultGitRoot } from '../config/vault.mjs';
import {
    linkAuditExitCode,
    printLinkAuditReport,
    runLinkAudit,
} from './lib/audit-links-lib.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const warnOnly = args.includes('--warn-only');

const vaultRoot = resolveVaultGitRoot();
const result = runLinkAudit(vaultRoot);

printLinkAuditReport(result, { strict });
process.exit(linkAuditExitCode(result, { strict, warnOnly }));
