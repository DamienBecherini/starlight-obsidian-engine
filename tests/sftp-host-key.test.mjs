import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    createHostVerifier,
    hostKeyFingerprint,
    normalizeFingerprint,
    sftpConnectOptions,
} from '../scripts/lib/sftp-host-key.mjs';

const key = Buffer.from('fake ssh-ed25519 host key');
const fingerprint = `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;

test('hostKeyFingerprint: OpenSSH SHA256 format, no padding', () => {
    assert.equal(hostKeyFingerprint(key), fingerprint);
    assert.doesNotMatch(hostKeyFingerprint(key), /=$/);
});

test('normalizeFingerprint: accepts the value with or without prefix and padding', () => {
    const bare = fingerprint.slice('SHA256:'.length);
    assert.equal(normalizeFingerprint(bare), fingerprint);
    assert.equal(normalizeFingerprint(`  ${fingerprint}=  `), fingerprint);
});

test('createHostVerifier: accepts the expected key', () => {
    const logs = [];
    assert.equal(createHostVerifier(fingerprint, (m) => logs.push(m))(key), true);
    assert.equal(logs.length, 0);
});

test('createHostVerifier: refuses another key', () => {
    const logs = [];
    assert.equal(createHostVerifier(fingerprint, (m) => logs.push(m))(Buffer.from('other key')), false);
    assert.match(logs[0], /mismatch/);
});

test('createHostVerifier: without a fingerprint, accepts and prints the line to add', () => {
    const logs = [];
    assert.equal(createHostVerifier(undefined, (m) => logs.push(m))(key), true);
    assert.match(logs[0], new RegExp(`DEPLOY_HOST_FINGERPRINT=${fingerprint.replace(/[+/]/g, '\\$&')}`));
});

test('sftpConnectOptions: carries credentials and a host verifier', () => {
    const options = sftpConnectOptions({
        protocol: 'sftp',
        host: 'example.com',
        port: 22,
        username: 'u',
        remotePath: '/srv/site',
        password: 'p',
        hostFingerprint: fingerprint,
    });
    assert.equal(options.host, 'example.com');
    assert.equal(options.password, 'p');
    assert.equal(typeof options.hostVerifier, 'function');
    assert.equal(options.hostVerifier(key), true);
});
