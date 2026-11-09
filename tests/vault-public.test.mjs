// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { copyVaultPublicFiles, listVaultPublicFiles } from '../config/vault-public.mjs';
import { runLinkAudit } from '../scripts/lib/audit-links-lib.mjs';

/**
 * @param {(vaultRoot: string, tmpRoot: string) => void} callback
 */
function withVault(callback) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-public-'));
    const vaultRoot = path.join(tmpRoot, 'vault');
    fs.mkdirSync(path.join(vaultRoot, 'public', 'images'), { recursive: true });
    try {
        callback(vaultRoot, tmpRoot);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

/**
 * @param {string} vaultRoot
 * @param {string} relativePath
 * @param {string} [content]
 */
function write(vaultRoot, relativePath, content = 'x') {
    const file = path.join(vaultRoot, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

test('listVaultPublicFiles returns nothing without a public folder', () => {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-public-empty-'));
    try {
        assert.deepEqual(listVaultPublicFiles(vaultRoot), []);
    } finally {
        fs.rmSync(vaultRoot, { recursive: true, force: true });
    }
});

test('listVaultPublicFiles skips dotfiles and paths excluded from publication', () => {
    withVault((vaultRoot) => {
        write(vaultRoot, 'public/shot.png');
        write(vaultRoot, 'public/images/a.png');
        write(vaultRoot, 'public/.env', 'SECRET=1');
        write(vaultRoot, 'public/.hidden/b.png');
        write(vaultRoot, 'public/draft/c.png');
        write(vaultRoot, 'public/private.png');
        write(vaultRoot, '.gitignore', 'public/draft/\n');
        write(vaultRoot, 'site.config.json', JSON.stringify({ publish: { exclude: ['public/private.png'] } }));

        assert.deepEqual(listVaultPublicFiles(vaultRoot), ['images/a.png', 'shot.png']);
    });
});

test('copyVaultPublicFiles copies into the output and replaces an engine file of the same name', () => {
    withVault((vaultRoot, tmpRoot) => {
        write(vaultRoot, 'public/images/a.png', 'vault');
        write(vaultRoot, 'public/favicon.svg', 'vault icon');
        const outDir = path.join(tmpRoot, 'dist');
        write(outDir, 'favicon.svg', 'engine icon');

        assert.deepEqual(copyVaultPublicFiles(vaultRoot, outDir), ['favicon.svg', 'images/a.png']);
        assert.equal(fs.readFileSync(path.join(outDir, 'images/a.png'), 'utf-8'), 'vault');
        assert.equal(fs.readFileSync(path.join(outDir, 'favicon.svg'), 'utf-8'), 'vault icon');
    });
});

test('runLinkAudit accepts a link to a published public file and still reports a missing one', () => {
    withVault((vaultRoot) => {
        write(vaultRoot, 'public/shot.png');
        write(
            vaultRoot,
            'page.md',
            '---\ntitle: Page\ndescription: Page\n---\n\n![Shot](/shot.png)\n\n![Missing](/missing.png)\n',
        );

        const { unresolved } = runLinkAudit(vaultRoot);
        assert.deepEqual(unresolved.map((item) => item.path), ['missing.png']);
    });
});
