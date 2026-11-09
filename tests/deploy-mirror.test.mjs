// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mirrorRemoteFtps } from '../scripts/lib/deploy.mjs';

const dir = (/** @type {string} */ name) => ({ name, isDirectory: true, isFile: false });
const file = (/** @type {string} */ name) => ({ name, isDirectory: false, isFile: true });

/**
 * A server with one obsolete file in one folder. The listing that decides whether
 * the emptied folder can be removed fails with `failure`.
 * @param {Error} failure
 */
function serverFailingDuringPrune(failure) {
    let removed = false;
    let emptiedListings = 0;
    const client = {
        removed: /** @type {string[]} */ ([]),
        /** @param {string} path */
        async list(path) {
            if (path === '/') return [dir('a')];
            if (!removed) return [file('old.txt')];
            emptiedListings += 1;
            if (emptiedListings === 2) throw failure;
            return [];
        },
        /** @param {string} path */
        async remove(path) {
            removed = true;
            client.removed.push(path);
        },
        async removeDir() {
            throw new Error('the folder must not be removed in this scenario');
        },
    };
    return client;
}

/** @param {ReturnType<typeof serverFailingDuringPrune>} client */
const mirror = (client) =>
    mirrorRemoteFtps(/** @type {any} */ (client), '/', new Set(), new Set());

test('mirrorRemoteFtps survives a connection lost while pruning empty folders', async () => {
    const failure = Object.assign(new Error('Client is closed. Closing reason: read ECONNRESET'), { code: 'ECONNRESET' });
    const client = serverFailingDuringPrune(failure);
    await mirror(client);
    assert.deepEqual(client.removed, ['/a/old.txt']);
});

test('mirrorRemoteFtps still reports other errors while pruning', async () => {
    const client = serverFailingDuringPrune(new Error('550 Permission denied'));
    await assert.rejects(mirror(client), /Permission denied/);
});
