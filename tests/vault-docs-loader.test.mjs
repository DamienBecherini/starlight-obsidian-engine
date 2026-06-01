// @ts-check
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { vaultAwareDocsLoader } from '../config/loaders/vault-docs.mjs';

const fixtureVault = path.resolve('tests/fixtures/minimal-vault');
const engineRoot = path.resolve('.');

test('vaultAwareDocsLoader drops ignored vault entries from store', async () => {
    const publicPath = path.join(fixtureVault, '00-index/index.md');
    const privatePath = path.join(fixtureVault, '_private/secret.md');

    /** @type {Map<string, { filePath?: string }>} */
    const store = new Map([
        ['public', { filePath: publicPath }],
        ['private', { filePath: privatePath }],
    ]);

    /** @type {import('astro/loaders').LoaderContext} */
    const context = {
        store,
        parseData: async (props) => props.data,
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
        config: {},
        generateDigest: () => '',
        watcher: undefined,
        refreshContextData: async () => {},
    };

    const loader = vaultAwareDocsLoader({
        inner: {
            name: 'mock-inner',
            load: async (ctx) => {
                ctx.store.set('public', { filePath: publicPath });
                ctx.store.set('private', { filePath: privatePath });
            },
        },
        vaultRoot: fixtureVault,
        engineRoot,
    });

    await loader.load(context);

    assert.ok(store.has('public'), 'publishable entry should remain');
    assert.equal(store.has('private'), false, '_private entry should be removed');
});
