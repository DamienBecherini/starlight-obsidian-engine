// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    normalizeAllowlistEntry,
    parseLexiconBacklogAllowlist,
    parseLinkAuditAllowlistFile,
    partitionUnresolvedLinks,
    isAllowedUnresolvedLink,
    candidateSlugsForPath,
} from '../scripts/lib/audit-links-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(__dirname, '..');
const vaultRoot = path.resolve(engineRoot, '../ia-on-prem-vault');

describe('audit-links-lib', () => {
    it('normalizeAllowlistEntry strips extension and backslashes', () => {
        assert.equal(normalizeAllowlistEntry('00-lexique/nvswitch.md'), '00-lexique/nvswitch');
        assert.equal(normalizeAllowlistEntry('01-fondations/foo\\'), '01-fondations/foo');
    });

    it('parseLexiconBacklogAllowlist reads backlog headings', () => {
        const backlogPath = path.join(vaultRoot, '.agents/vault-maintenance/lexicon-backlog.md');
        const slugs = parseLexiconBacklogAllowlist(backlogPath);
        assert.ok(slugs.has('00-lexique/inference'));
    });

    it('parseLinkAuditAllowlistFile reads prefixes and slugs', () => {
        const allowlistPath = path.join(vaultRoot, '.agents/vault-maintenance/link-audit-allowlist.md');
        const { slugs, prefixes } = parseLinkAuditAllowlistFile(allowlistPath);
        assert.deepEqual(prefixes, ['03-stack-logicielle/', '04-blueprints/']);
        assert.ok(slugs.has('03-stack-logicielle/rag-and-agents'));
    });

    it('candidateSlugsForPath applies pageResolver', () => {
        const candidates = candidateSlugsForPath('03-stack-logicielle/Clustering Exo et Ray');
        assert.ok(candidates.includes('03-stack-logicielle/clustering-exo-et-ray'));
    });

    it('isAllowedUnresolvedLink matches prefix allowlist', () => {
        const allowlist = {
            slugs: new Set(['03-stack-logicielle/rag-and-agents']),
            prefixes: ['03-stack-logicielle/', '04-blueprints/'],
        };
        assert.equal(
            isAllowedUnresolvedLink(
                { from: '00-index', raw: '04-blueprints/Scenario A Labo Dev', path: '04-blueprints/Scenario A Labo Dev' },
                allowlist,
            ),
            true,
        );
        assert.equal(
            isAllowedUnresolvedLink(
                { from: '00-index', raw: '99-future/missing', path: '99-future/missing' },
                allowlist,
            ),
            false,
        );
    });

    it('partitionUnresolvedLinks splits allowed vs unexpected', () => {
        const allowlist = { slugs: new Set(), prefixes: ['03-stack-logicielle/'] };
        const unresolved = [
            { from: 'a', raw: '03-stack-logicielle/foo', path: '03-stack-logicielle/foo' },
            { from: 'b', raw: 'broken', path: 'broken' },
        ];
        const { allowed, unexpected } = partitionUnresolvedLinks(unresolved, allowlist);
        assert.equal(allowed.length, 1);
        assert.equal(unexpected.length, 1);
    });
});
