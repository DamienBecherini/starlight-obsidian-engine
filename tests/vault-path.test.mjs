// @ts-check
import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
    envVaultPath,
    forceVaultPathFromEnv,
    resolveVaultPath,
    resolveVaultGitRoot,
} from '../config/vault.mjs';

const fixtureVault = path.resolve('tests/fixtures/minimal-vault');

/** @type {NodeJS.ProcessEnv} */
let savedEnv;

beforeEach(() => {
    savedEnv = { ...process.env };
});

afterEach(() => {
    process.env = savedEnv;
});

test('forceVaultPathFromEnv recognizes 1, true, yes', () => {
    for (const value of ['1', 'true', 'yes', 'TRUE']) {
        process.env.FORCE_VAULT_PATH = value;
        assert.equal(forceVaultPathFromEnv(), true, value);
    }
    delete process.env.FORCE_VAULT_PATH;
    assert.equal(forceVaultPathFromEnv(), false);
});

test('resolveVaultPath uses VAULT_PATH when FORCE_VAULT_PATH=1', () => {
    process.env.VAULT_PATH = fixtureVault;
    process.env.FORCE_VAULT_PATH = '1';
    assert.equal(resolveVaultPath(), fixtureVault);
});

test('resolveVaultGitRoot resolves forced VAULT_PATH', () => {
    process.env.VAULT_PATH = fixtureVault;
    process.env.FORCE_VAULT_PATH = '1';
    assert.equal(resolveVaultGitRoot(), path.resolve(fixtureVault));
});

test('envVaultPath resolves relative paths from project root', () => {
    process.env.VAULT_PATH = 'tests/fixtures/minimal-vault';
    assert.equal(envVaultPath(), fixtureVault);
});
