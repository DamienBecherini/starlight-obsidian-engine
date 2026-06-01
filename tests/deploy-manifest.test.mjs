// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    buildDeployKey,
    diffDistAgainstManifest,
    emptyManifest,
    ensureManifest,
    hashDistFile,
} from '../scripts/lib/deploy-manifest.mjs';

const config = {
    protocol: 'ftps',
    host: 'ftp.example.com',
    port: 21,
    remotePath: '/',
};

test('buildDeployKey is stable', () => {
    assert.equal(buildDeployKey(config), 'ftps|ftp.example.com|21|/');
});

test('diff with empty manifest marks all local files for upload', () => {
    const manifest = emptyManifest(config);
    /** @type {Map<string, { sha256: string, size: number }>} */
    const local = new Map([
        ['a.html', { sha256: 'aa', size: 1 }],
        ['b/c.html', { sha256: 'bb', size: 2 }],
    ]);
    const diff = diffDistAgainstManifest(local, manifest);
    assert.equal(diff.toUpload.length, 2);
    assert.equal(diff.toDelete.length, 0);
    assert.equal(diff.unchanged, 0);
});

test('diff skips unchanged hashes', () => {
    const manifest = emptyManifest(config);
    manifest.files = {
        'a.html': { sha256: 'same', size: 10 },
        'gone.html': { sha256: 'old', size: 5 },
    };
    /** @type {Map<string, { sha256: string, size: number }>} */
    const local = new Map([['a.html', { sha256: 'same', size: 10 }]]);
    const diff = diffDistAgainstManifest(local, manifest);
    assert.equal(diff.toUpload.length, 0);
    assert.equal(diff.unchanged, 1);
    assert.deepEqual(diff.toDelete, ['gone.html']);
});

test('size change triggers upload', () => {
    const manifest = emptyManifest(config);
    manifest.files = { 'a.html': { sha256: 'same', size: 10 } };
    const local = new Map([['a.html', { sha256: 'same', size: 11 }]]);
    const diff = diffDistAgainstManifest(local, manifest);
    assert.equal(diff.toUpload.length, 1);
});

test('ensureManifest resets on deploy key mismatch', () => {
    const manifest = emptyManifest(config);
    manifest.deployKey = 'ftps|other.host|21|/';
    const next = ensureManifest(manifest, config);
    assert.equal(next.deployKey, buildDeployKey(config));
    assert.deepEqual(next.files, {});
});

test('hashDistFile matches file bytes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-manifest-'));
    const filePath = path.join(dir, 'hello.txt');
    fs.writeFileSync(filePath, 'hello');
    const entry = await hashDistFile(filePath);
    assert.equal(entry.size, 5);
    assert.equal(entry.sha256.length, 64);
    fs.rmSync(dir, { recursive: true, force: true });
});
