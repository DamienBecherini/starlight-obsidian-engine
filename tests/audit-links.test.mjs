// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    normalizeAllowlistEntry,
    parseLexiconBacklogAllowlist,
    parseLinkAuditAllowlistFile,
    partitionUnresolvedLinks,
    isAllowedUnresolvedLink,
    candidateSlugsForPath,
} from '../scripts/lib/audit-links-lib.mjs';

function withTempVault(callback) {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-links-vault-'));
    const maintenanceDir = path.join(vaultRoot, '.agents', 'vault-maintenance');
    fs.mkdirSync(maintenanceDir, { recursive: true });

    try {
        return callback({ vaultRoot, maintenanceDir });
    } finally {
        fs.rmSync(vaultRoot, { recursive: true, force: true });
    }
}

describe('audit-links-lib', () => {
    it('normalizeAllowlistEntry strips extension and backslashes', () => {
        assert.equal(normalizeAllowlistEntry('glossary/example.md'), 'glossary/example');
        assert.equal(normalizeAllowlistEntry('01-fondations/foo\\'), '01-fondations/foo');
    });

    it('parseLexiconBacklogAllowlist reads backlog headings', () => {
        withTempVault(({ maintenanceDir }) => {
            const backlogPath = path.join(maintenanceDir, 'lexicon-backlog.md');
            fs.writeFileSync(
                backlogPath,
                [
                    '# Lexicon Backlog',
                    '',
                    '### `glossary/local-model.md`',
                    '',
                    '- tracked by a fixture vault',
                ].join('\n'),
            );

            const slugs = parseLexiconBacklogAllowlist(backlogPath);
            assert.ok(slugs.has('glossary/local-model'));
        });
    });

    it('parseLinkAuditAllowlistFile reads prefixes and slugs', () => {
        withTempVault(({ maintenanceDir }) => {
            const allowlistPath = path.join(maintenanceDir, 'link-audit-allowlist.md');
            fs.writeFileSync(
                allowlistPath,
                [
                    '# Link audit allowlist',
                    '',
                    '## Prefixes',
                    '',
                    '- drafts/',
                    '- planned/',
                    '',
                    '## Slugs',
                    '',
                    '- roadmap/future-page',
                ].join('\n'),
            );

            const { slugs, prefixes } = parseLinkAuditAllowlistFile(allowlistPath);
            assert.deepEqual(prefixes, ['drafts/', 'planned/']);
            assert.ok(slugs.has('roadmap/future-page'));
        });
    });

    it('candidateSlugsForPath applies pageResolver', () => {
        const candidates = candidateSlugsForPath('docs/My Future Page');
        assert.ok(candidates.includes('docs/my-future-page'));
    });

    it('isAllowedUnresolvedLink matches prefix allowlist', () => {
        const allowlist = {
            slugs: new Set(['roadmap/future-page']),
            prefixes: ['drafts/', 'planned/'],
        };
        assert.equal(
            isAllowedUnresolvedLink(
                { from: 'home', raw: 'planned/Future Article', path: 'planned/Future Article' },
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
        const allowlist = { slugs: new Set(), prefixes: ['planned/'] };
        const unresolved = [
            { from: 'a', raw: 'planned/foo', path: 'planned/foo' },
            { from: 'b', raw: 'broken', path: 'broken' },
        ];
        const { allowed, unexpected } = partitionUnresolvedLinks(unresolved, allowlist);
        assert.equal(allowed.length, 1);
        assert.equal(unexpected.length, 1);
    });
});
