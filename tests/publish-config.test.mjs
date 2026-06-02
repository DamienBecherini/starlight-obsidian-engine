// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    loadPublishExcludePatterns,
    normalizePublishPattern,
    parsePublishBlock,
} from '../config/publish.mjs';

test('parsePublishBlock returns empty exclude when absent', () => {
    assert.deepEqual(parsePublishBlock(undefined), { exclude: [] });
    assert.deepEqual(parsePublishBlock({}), { exclude: [] });
    assert.deepEqual(parsePublishBlock({ exclude: 'docs/plans/**' }), { exclude: [] });
});

test('parsePublishBlock normalizes string patterns', () => {
    const config = parsePublishBlock({
        exclude: [' docs/plans/** ', '.agents\\**', '', 42],
    });
    assert.deepEqual(config.exclude, ['docs/plans/**', '.agents/**']);
});

test('normalizePublishPattern converts backslashes', () => {
    assert.equal(normalizePublishPattern('docs\\plans\\**'), 'docs/plans/**');
});

test('loadPublishExcludePatterns reads site.config.json', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-cfg-'));
    fs.writeFileSync(
        path.join(tmp, 'site.config.json'),
        JSON.stringify({
            title: 'Test',
            publish: {
                exclude: ['docs/plans/**', '.agents/**'],
            },
        }),
        'utf-8',
    );

    assert.deepEqual(loadPublishExcludePatterns(tmp), ['docs/plans/**', '.agents/**']);
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('loadPublishExcludePatterns returns empty when config is missing or invalid', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-cfg-missing-'));
    assert.deepEqual(loadPublishExcludePatterns(tmp), []);

    fs.writeFileSync(path.join(tmp, 'site.config.json'), '{ invalid json', 'utf-8');
    assert.deepEqual(loadPublishExcludePatterns(tmp), []);
    fs.rmSync(tmp, { recursive: true, force: true });
});
