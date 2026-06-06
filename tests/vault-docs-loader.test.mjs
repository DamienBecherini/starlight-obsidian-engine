// @ts-check
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { vaultAwareDocsLoader, normalizeDocsCollectionFilePath } from '../config/loaders/vault-docs.mjs';

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

test('normalizeDocsCollectionFilePath maps vault paths into src/content/docs', () => {
    const vaultRel = 'tests/fixtures/minimal-vault/00-index/index.md';
    assert.equal(
        normalizeDocsCollectionFilePath(vaultRel, engineRoot, fixtureVault),
        'src/content/docs/00-index/index.md',
    );
    assert.equal(
        normalizeDocsCollectionFilePath('src/content/docs/index.mdx', engineRoot, fixtureVault),
        'src/content/docs/index.mdx',
    );
});

test('vaultAwareDocsLoader normalizes vault entry filePath for Starlight sidebar', async () => {
    const vaultRelPath = 'tests/fixtures/minimal-vault/00-index/index.md';

    /** @type {Map<string, { filePath?: string }>} */
    const store = new Map();

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
                ctx.store.set('00-index', { filePath: vaultRelPath });
            },
        },
        vaultRoot: fixtureVault,
        engineRoot,
    });

    await loader.load(context);

    assert.equal(store.get('00-index')?.filePath, 'src/content/docs/00-index/index.md');
});
