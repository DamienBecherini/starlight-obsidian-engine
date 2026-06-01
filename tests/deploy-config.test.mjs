// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { deployConfigFromEnv } from '../scripts/lib/deploy.mjs';

/** @type {NodeJS.ProcessEnv} */
let savedEnv;

beforeEach(() => {
    savedEnv = { ...process.env };
});

afterEach(() => {
    process.env = savedEnv;
});

test('deployConfigFromEnv FTPS with explicit protocol', () => {
    process.env.DEPLOY_PROTOCOL = 'ftps';
    process.env.DEPLOY_HOST = 'ftp.example.com';
    process.env.DEPLOY_USER = 'user';
    process.env.DEPLOY_REMOTE_PATH = '/public_html';
    process.env.DEPLOY_PORT = '21';
    process.env.DEPLOY_PASSWORD = 'secret';
    delete process.env.DEPLOY_PRIVATE_KEY_PATH;

    const config = deployConfigFromEnv(process.cwd());
    assert.equal(config.protocol, 'ftps');
    assert.equal(config.host, 'ftp.example.com');
    assert.equal(config.port, 21);
    assert.equal(config.username, 'user');
    assert.equal(config.remotePath, '/public_html');
    assert.equal(config.password, 'secret');
});

test('deployConfigFromEnv infers ftps from port 21', () => {
    delete process.env.DEPLOY_PROTOCOL;
    process.env.DEPLOY_HOST = 'ftp.example.com';
    process.env.DEPLOY_USER = 'user';
    process.env.DEPLOY_REMOTE_PATH = '/';
    process.env.DEPLOY_PORT = '21';
    process.env.DEPLOY_PASSWORD = 'secret';

    const config = deployConfigFromEnv(process.cwd());
    assert.equal(config.protocol, 'ftps');
});

test('deployConfigFromEnv infers sftp from port 22', () => {
    delete process.env.DEPLOY_PROTOCOL;
    process.env.DEPLOY_HOST = 'sftp.example.com';
    process.env.DEPLOY_USER = 'user';
    process.env.DEPLOY_REMOTE_PATH = '/var/www';
    process.env.DEPLOY_PORT = '22';
    process.env.DEPLOY_PASSWORD = 'secret';

    const config = deployConfigFromEnv(process.cwd());
    assert.equal(config.protocol, 'sftp');
});

test('deployConfigFromEnv SFTP with private key path', () => {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-config-vault-'));
    const keyPath = path.join(vaultRoot, 'id_ed25519');
    fs.writeFileSync(keyPath, 'fake-key-content');

    process.env.DEPLOY_PROTOCOL = 'sftp';
    process.env.DEPLOY_HOST = 'sftp.example.com';
    process.env.DEPLOY_USER = 'user';
    process.env.DEPLOY_REMOTE_PATH = '/var/www';
    process.env.DEPLOY_PRIVATE_KEY_PATH = 'id_ed25519';
    delete process.env.DEPLOY_PASSWORD;

    const config = deployConfigFromEnv(vaultRoot);
    assert.equal(config.protocol, 'sftp');
    assert.ok(config.privateKey);
    assert.equal(config.privateKey.toString(), 'fake-key-content');

    fs.rmSync(vaultRoot, { recursive: true, force: true });
});

test('deployConfigFromEnv parses DEPLOY_PROTECT list', () => {
    process.env.DEPLOY_PROTOCOL = 'ftps';
    process.env.DEPLOY_HOST = 'ftp.example.com';
    process.env.DEPLOY_USER = 'user';
    process.env.DEPLOY_REMOTE_PATH = '/';
    process.env.DEPLOY_PASSWORD = 'secret';
    process.env.DEPLOY_PROTECT = 'cgi-bin, backups ';

    const config = deployConfigFromEnv(process.cwd());
    assert.deepEqual(config.protect, ['cgi-bin', 'backups']);
});
