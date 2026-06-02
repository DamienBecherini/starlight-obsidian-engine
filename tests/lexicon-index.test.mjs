// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    collectLexiconEntries,
    escapeTableCell,
    parseLexiconFrontmatter,
    renderIndexMarkdown,
    writeLexiconIndex,
    GLOSSARY_BASENAME,
    INDEX_BASENAME,
    LEXICON_TAG,
} from '../scripts/lib/lexicon-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-test-'));
    const lexDir = path.join(tmp, '00-lexique');
    fs.mkdirSync(lexDir, { recursive: true });

    const write = (name, yaml) => {
        fs.writeFileSync(
            path.join(lexDir, name),
            `---\n${yaml}\n---\n\n## Définition courte\n`,
            'utf-8',
        );
    };

    write('zebra.md', `title: Zebra\ndescription: Last\ntags:\n  - ${LEXICON_TAG}`);
    write('alpha.md', `title: Alpha\ndescription: First\ntags:\n  - ${LEXICON_TAG}`);
    fs.writeFileSync(path.join(lexDir, GLOSSARY_BASENAME), `---\ntitle: Hub\n---\n`, 'utf-8');
    fs.writeFileSync(
        path.join(lexDir, 'ignored.md'),
        `---\ntitle: Ignored\ndescription: x\ntags:\n  - other\n---\n`,
        'utf-8',
    );

    const entries = collectLexiconEntries(tmp);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].title, 'Alpha');
    assert.equal(entries[1].title, 'Zebra');
    assert.equal(entries[0].slug, 'alpha');
});

test('renderIndexMarkdown includes wiki links and no duplicate H1', () => {
    const md = renderIndexMarkdown([
        { slug: 'ram', title: 'RAM', description: 'Mémoire', warnings: [] },
    ]);
    assert.match(md, /\[RAM\]\(\/00-lexique\/ram\/\)/);
    assert.match(md, /title: Index du lexique/);
    assert.match(md, /\| Terme \| Définition \|/);
    assert.doesNotMatch(md, /\| Fiche \|/);
    assert.doesNotMatch(md, /^# /m);
});

test('writeLexiconIndex respects vault gitignore', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-gitignore-'));
    const lexDir = path.join(tmp, '00-lexique');
    fs.mkdirSync(lexDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, '.gitignore'), '00-lexique/secret.md\n', 'utf-8');

    fs.writeFileSync(
        path.join(lexDir, 'public.md'),
        `---\ntitle: Public\ndescription: ok\ntags:\n  - ${LEXICON_TAG}\n---\n`,
        'utf-8',
    );
    fs.writeFileSync(
        path.join(lexDir, 'secret.md'),
        `---\ntitle: Secret\ndescription: hidden\ntags:\n  - ${LEXICON_TAG}\n---\n`,
        'utf-8',
    );

    const count = writeLexiconIndex(tmp);
    assert.equal(count, 1);
    const out = fs.readFileSync(path.join(lexDir, INDEX_BASENAME), 'utf-8');
    assert.match(out, /Public/);
    assert.doesNotMatch(out, /Secret/);
});
