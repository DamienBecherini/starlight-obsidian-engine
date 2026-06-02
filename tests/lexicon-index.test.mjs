// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseLexiconBlock } from '../config/lexicon.mjs';
import {
    collectLexiconEntries,
    escapeTableCell,
    parseLexiconFrontmatter,
    renderIndexMarkdown,
    writeLexiconIndex,
} from '../scripts/lib/lexicon-index.mjs';

/** @returns {import('../config/lexicon.mjs').LexiconConfigEnabled} */
function zthLikeConfig(overrides = {}) {
    const base = parseLexiconBlock({
        enabled: true,
        directory: '00-lexique',
        entryTag: 'lexique',
        hubPage: 'glossaire-ia.md',
        indexPage: 'index-lexique.md',
        sortLocale: 'fr',
        index: {
            title: 'Index du lexique',
            description: 'Liste alphabétique de toutes les fiches du lexique IA on-premise.',
            intro: 'Liste générée automatiquement au build. Pour une lecture guidée, voir [[00-lexique/glossaire-ia|Glossaire IA]].',
        },
    });
    assert.equal(base.enabled, true);
    return { .../** @type {import('../config/lexicon.mjs').LexiconConfigEnabled} */ (base), ...overrides };
}

test('parseLexiconFrontmatter reads title, description, and tags', () => {
    const meta = parseLexiconFrontmatter(
        ['title: RAM', 'description: Mémoire vive', 'tags:', '  - lexique', '  - materiel'].join(
            '\n',
        ),
    );
    assert.equal(meta.title, 'RAM');
    assert.equal(meta.description, 'Mémoire vive');
    assert.deepEqual(meta.tags, ['lexique', 'materiel']);
});

test('escapeTableCell escapes pipe characters', () => {
    assert.equal(escapeTableCell('a|b'), 'a\\|b');
});

test('collectLexiconEntries sorts alphabetically and excludes hub pages', () => {
    const config = zthLikeConfig();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-test-'));
    const lexDir = path.join(tmp, config.directory);
    fs.mkdirSync(lexDir, { recursive: true });

    const write = (name, yaml) => {
        fs.writeFileSync(
            path.join(lexDir, name),
            `---\n${yaml}\n---\n\n## Définition courte\n`,
            'utf-8',
        );
    };

    write('zebra.md', `title: Zebra\ndescription: Last\ntags:\n  - ${config.entryTag}`);
    write('alpha.md', `title: Alpha\ndescription: First\ntags:\n  - ${config.entryTag}`);
    fs.writeFileSync(
        path.join(lexDir, config.hubPage),
        `---\ntitle: Hub\n---\n`,
        'utf-8',
    );
    fs.writeFileSync(
        path.join(lexDir, 'ignored.md'),
        `---\ntitle: Ignored\ndescription: x\ntags:\n  - other\n---\n`,
        'utf-8',
    );

    const entries = collectLexiconEntries(tmp, config);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].title, 'Alpha');
    assert.equal(entries[1].title, 'Zebra');
    assert.equal(entries[0].slug, 'alpha');
});

test('renderIndexMarkdown uses config directory and index frontmatter', () => {
    const config = zthLikeConfig();
    const md = renderIndexMarkdown(
        [{ slug: 'ram', title: 'RAM', description: 'Mémoire', warnings: [] }],
        config,
    );
    assert.match(md, /\[RAM\]\(\/00-lexique\/ram\/\)/);
    assert.match(md, /title: Index du lexique/);
    assert.match(md, /\| Terme \| Définition \|/);
    assert.doesNotMatch(md, /\| Fiche \|/);
    assert.doesNotMatch(md, /^# /m);
});

test('renderIndexMarkdown supports custom glossary directory', () => {
    const config = zthLikeConfig({
        directory: 'glossary',
        hubPage: 'hub.md',
        indexPage: 'all-terms.md',
        index: {
            title: 'All terms',
            description: 'Full list',
            intro: 'Generated.',
        },
    });
    const md = renderIndexMarkdown(
        [{ slug: 'term', title: 'Term', description: 'Def', warnings: [] }],
        config,
    );
    assert.match(md, /\[Term\]\(\/glossary\/term\/\)/);
});

test('writeLexiconIndex respects vault gitignore', () => {
    const config = zthLikeConfig();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-gitignore-'));
    const lexDir = path.join(tmp, config.directory);
    fs.mkdirSync(lexDir, { recursive: true });
    fs.writeFileSync(
        path.join(tmp, '.gitignore'),
        `${config.directory}/secret.md\n`,
        'utf-8',
    );

    fs.writeFileSync(
        path.join(lexDir, 'public.md'),
        `---\ntitle: Public\ndescription: ok\ntags:\n  - ${config.entryTag}\n---\n`,
        'utf-8',
    );
    fs.writeFileSync(
        path.join(lexDir, 'secret.md'),
        `---\ntitle: Secret\ndescription: hidden\ntags:\n  - ${config.entryTag}\n---\n`,
        'utf-8',
    );

    const count = writeLexiconIndex(tmp, config);
    assert.equal(count, 1);
    const out = fs.readFileSync(path.join(lexDir, config.indexPage), 'utf-8');
    assert.match(out, /Public/);
    assert.doesNotMatch(out, /Secret/);
});
