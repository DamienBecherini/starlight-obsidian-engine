// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    getLexiconExcludeSlugs,
    isLexiconEnabled,
    loadLexiconConfig,
    parseLexiconBlock,
    resolveLexiconPaths,
    validateEnabledLexiconConfig,
} from '../config/lexicon.mjs';

test('parseLexiconBlock returns disabled when absent or enabled false', () => {
    assert.deepEqual(parseLexiconBlock(undefined), { enabled: false });
    assert.deepEqual(parseLexiconBlock({ enabled: false }), { enabled: false });
});

test('parseLexiconBlock parses enabled block with defaults', () => {
    const config = parseLexiconBlock({
        enabled: true,
        directory: 'glossary',
        hubPage: 'index.md',
        indexPage: '_generated.md',
        index: {
            title: 'Glossary index',
            description: 'All terms',
            intro: 'Generated list.',
        },
    });
    assert.equal(config.enabled, true);
    if (!config.enabled) return;
    assert.equal(config.directory, 'glossary');
    assert.equal(config.entryTag, 'lexique');
    assert.equal(config.sortLocale, 'fr');
    assert.equal(config.index.title, 'Glossary index');
});

test('validateEnabledLexiconConfig reports missing fields', () => {
    const config = parseLexiconBlock({ enabled: true, directory: 'glossary' });
    assert.equal(config.enabled, true);
    if (!config.enabled) return;
    const errors = validateEnabledLexiconConfig(config);
    assert.ok(errors.length >= 4);
});

test('loadLexiconConfig reads site.config.json from vault root', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-cfg-'));
    fs.writeFileSync(
        path.join(tmp, 'site.config.json'),
        JSON.stringify({
            title: 'Test',
            lexicon: {
                enabled: true,
                directory: '00-lexique',
                hubPage: 'glossaire-ia.md',
                indexPage: 'index-lexique.md',
                index: {
                    title: 'Index',
                    description: 'Desc',
                    intro: 'Intro',
                },
            },
        }),
        'utf-8',
    );

    const config = loadLexiconConfig(tmp);
    assert.equal(config.enabled, true);
    if (!config.enabled) return;
    assert.equal(config.directory, '00-lexique');
});

test('resolveLexiconPaths and exclude slugs', () => {
    const config = parseLexiconBlock({
        enabled: true,
        directory: '00-lexique',
        hubPage: 'glossaire-ia.md',
        indexPage: 'index-lexique.md',
        index: { title: 'T', description: 'D', intro: 'I' },
    });
    assert.equal(config.enabled, true);
    if (!config.enabled) return;

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-paths-'));
    const paths = resolveLexiconPaths(config, tmp);
    assert.match(paths.lexiconDir, /00-lexique$/);
    assert.equal(paths.hubBasename, 'glossaire-ia.md');
    assert.deepEqual(getLexiconExcludeSlugs(config), [
        '00-lexique/glossaire-ia',
        '00-lexique/index-lexique',
    ]);
});
