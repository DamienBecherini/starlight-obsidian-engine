// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadVaultGitignore, loadVaultPublishFilter, entryPathToVaultRelative } from '../config/gitignore.mjs';

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
    const isIgnored = loadVaultPublishFilter(dir);
    assert.equal(isIgnored('_private/important.md'), true);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('loadVaultPublishFilter respects publish.exclude from site.config.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-exclude-'));
    fs.writeFileSync(
        path.join(dir, 'site.config.json'),
        JSON.stringify({
            title: 'Test',
            publish: { exclude: ['docs/plans/**', '.agents/**'] },
        }),
        'utf-8',
    );

    const isIgnored = loadVaultPublishFilter(dir);
    assert.equal(isIgnored('docs/plans/agent.plan.md'), true);
    assert.equal(isIgnored('.agents/skills/foo/SKILL.md'), true);
    assert.equal(isIgnored('00-index/index.md'), false);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('publish.exclude applies even when path is not gitignored', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-not-gitignored-'));
    fs.writeFileSync(
        path.join(dir, 'site.config.json'),
        JSON.stringify({
            title: 'Test',
            publish: { exclude: ['docs/plans/**'] },
        }),
        'utf-8',
    );
    fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\n');

    const isIgnored = loadVaultPublishFilter(dir);
    assert.equal(isIgnored('docs/plans/work.plan.md'), true);
    assert.equal(isIgnored('01-foundations/chapter.md'), false);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('loadVaultGitignore remains compatible with loadVaultPublishFilter', () => {
    const isIgnored = loadVaultGitignore(fixtureVault);
    assert.equal(isIgnored('00-index/index.md'), false);
    assert.equal(isIgnored('_private/secret.md'), true);
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
