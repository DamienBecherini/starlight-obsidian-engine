// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { uploadFromDirFiltered } from '../scripts/lib/ftps-upload.mjs';

/** Builds a fixture tree and returns its root. */
function makeTree() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftps-upload-'));
    fs.writeFileSync(path.join(root, 'index.html'), 'a');
    fs.writeFileSync(path.join(root, 'b.css'), 'b');
    fs.writeFileSync(path.join(root, '.hidden'), 'x');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'c.js'), 'c');
    fs.writeFileSync(path.join(root, 'sub', '.secret'), 'x');
    fs.mkdirSync(path.join(root, '.cache'));
    fs.writeFileSync(path.join(root, '.cache', 'd.txt'), 'x');
    return root;
}

/** Fake basic-ftp client recording calls. */
function fakeClient() {
    /** @type {string[]} */
    const calls = [];
    return {
        calls,
        async ensureDir(/** @type {string} */ dir) {
            calls.push(`ensureDir ${dir}`);
        },
        async uploadFrom(/** @type {string} */ src, /** @type {string} */ to) {
            calls.push(`uploadFrom ${path.basename(src)} -> ${to}`);
        },
        async cdup() {
            calls.push('cdup');
        },
    };
}

test('uploadFromDirFiltered skips hidden files and directories at every level', async () => {
    const root = makeTree();
    try {
        const client = fakeClient();
        await uploadFromDirFiltered(client, root, 'remote', (name) => !name.startsWith('.'));
        assert.deepEqual(client.calls, [
            'ensureDir remote',
            'uploadFrom b.css -> b.css',
            'uploadFrom index.html -> index.html',
            'ensureDir sub',
            'uploadFrom c.js -> c.js',
            'cdup',
        ]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('uploadFromDirFiltered restricts a batch to the given names', async () => {
    const root = makeTree();
    try {
        const client = fakeClient();
        const batch = new Set(['index.html']);
        await uploadFromDirFiltered(client, root, 'remote', (name) => batch.has(name));
        assert.deepEqual(client.calls, ['ensureDir remote', 'uploadFrom index.html -> index.html']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('uploadFromDirFiltered without filter uploads everything like basic-ftp', async () => {
    const root = makeTree();
    try {
        const client = fakeClient();
        await uploadFromDirFiltered(client, root, 'remote', undefined);
        assert.equal(client.calls.filter((c) => c.startsWith('uploadFrom')).length, 6);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
