// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadVaultGitignore, entryPathToVaultRelative } from '../config/gitignore.mjs';

const fixtureVault = path.resolve('tests/fixtures/minimal-vault');

test('loadVaultGitignore excludes _private paths', () => {
    const isIgnored = loadVaultGitignore(fixtureVault);
    assert.equal(isIgnored('_private/secret.md'), true);
    assert.equal(isIgnored('_private'), true);
});

test('loadVaultGitignore excludes vault-root README', () => {
    const isIgnored = loadVaultGitignore(fixtureVault);
    assert.equal(isIgnored('README.md'), true);
    assert.equal(isIgnored('readme.txt'), true);
});

test('loadVaultGitignore allows publishable content', () => {
    const isIgnored = loadVaultGitignore(fixtureVault);
    assert.equal(isIgnored('00-index/index.md'), false);
    assert.equal(isIgnored('00-lexique/ram.md'), false);
});

test('loadVaultGitignore respects vault .gitignore', () => {
    const isIgnored = loadVaultGitignore(fixtureVault);
    assert.equal(isIgnored('drafts/ignored.md'), true);
});

test('_private wins over gitignore negation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-negation-'));
    fs.writeFileSync(path.join(dir, '.gitignore'), '_private/\n!important.md\n');
    fs.mkdirSync(path.join(dir, '_private'), { recursive: true });
    const isIgnored = loadVaultGitignore(dir);
    assert.equal(isIgnored('_private/important.md'), true);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('entryPathToVaultRelative maps engine-relative vault paths', () => {
    const engineRoot = path.resolve('.');
    const vaultRel = entryPathToVaultRelative(
        path.join('tests/fixtures/minimal-vault/00-index/index.md'),
        engineRoot,
        fixtureVault,
    );
    assert.equal(vaultRel, '00-index/index.md');
});

test('entryPathToVaultRelative returns null outside vault', () => {
    const engineRoot = path.resolve('.');
    const vaultRel = entryPathToVaultRelative('package.json', engineRoot, fixtureVault);
    assert.equal(vaultRel, null);
});
