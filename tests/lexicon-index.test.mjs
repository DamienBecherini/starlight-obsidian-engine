// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseLexiconBlock } from '../config/lexicon.mjs';
import {
    buildLocalizedLexiconIndex,
    collectLexiconEntries,
    escapeTableCell,
    hubLinkMarkdown,
    lexiconIndexLabels,
    loadVaultLocales,
    parseLexiconFrontmatter,
    renderIndexMarkdown,
    writeLexiconIndex,
    writeLocalizedLexiconIndexes,
    yamlScalar,
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

    const write = (/** @type {string} */ name, /** @type {string} */ yaml) => {
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

test('yamlScalar quotes values that would break YAML', () => {
    assert.equal(yamlScalar('Index du lexique'), 'Index du lexique');
    assert.equal(yamlScalar("Index de l'IA on-premise, de LLM à VRAM."), "Index de l'IA on-premise, de LLM à VRAM.");
    assert.equal(yamlScalar('Index : LLM, VRAM'), '"Index : LLM, VRAM"');
    assert.equal(yamlScalar('entries: LLM'), '"entries: LLM"');
    assert.equal(yamlScalar('"quoted" start'), '"\\"quoted\\" start"');
    assert.equal(yamlScalar('- dash'), '"- dash"');
    assert.equal(yamlScalar('a # comment'), '"a # comment"');
});

test('renderIndexMarkdown writes a parseable description containing a colon', () => {
    const config = zthLikeConfig({
        index: { title: 'Index', description: 'Index : LLM, VRAM', intro: 'Generated.' },
    });
    const md = renderIndexMarkdown([], config);
    assert.match(md, /^description: "Index : LLM, VRAM"$/m);
});

/**
 * Temporary vault with FR entries (alpha, beta, gamma, secret) and EN mirrors (alpha, beta,
 * en-only, secret); `secret` is gitignored in both locales.
 * @returns {string}
 */
function localizedVault() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-locale-'));
    const write = (/** @type {string} */ rel, /** @type {string} */ title, /** @type {string} */ description) => {
        fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
        fs.writeFileSync(
            path.join(tmp, rel),
            `---\ntitle: ${title}\ndescription: ${description}\ntags:\n  - lexique\n---\n`,
            'utf-8',
        );
    };
    write('00-lexique/alpha.md', 'Zêta alpha', 'Définition alpha');
    write('00-lexique/beta.md', 'Bêta', 'Définition bêta');
    write('00-lexique/gamma.md', 'Gamma', 'Définition gamma | pipe');
    write('00-lexique/secret.md', 'Secret', 'caché');
    write('en/00-lexique/alpha.md', 'Alpha', 'Alpha definition');
    write('en/00-lexique/beta.md', 'Beta', 'Beta definition');
    write('en/00-lexique/en-only.md', 'English only', 'Only in English');
    write('en/00-lexique/secret.md', 'Secret', 'hidden');
    fs.writeFileSync(path.join(tmp, '.gitignore'), '00-lexique/secret.md\nen/00-lexique/secret.md\n', 'utf-8');
    fs.writeFileSync(
        path.join(tmp, 'site.config.json'),
        JSON.stringify({ locales: { root: { label: 'Français', lang: 'fr' }, en: { label: 'English', lang: 'en' } } }),
        'utf-8',
    );
    return tmp;
}

/** @returns {import('../config/lexicon.mjs').LexiconConfigEnabled} */
function localizedConfig() {
    const config = parseLexiconBlock({
        enabled: true,
        directory: '00-lexique',
        hubPage: 'ai-glossary.md',
        indexPage: 'lexicon-index.md',
        index: {
            title: 'Index du lexique',
            description: 'Index : tout',
            intro: 'Généré. Voir [[00-lexique/ai-glossary|Glossaire IA]].',
            hubLink: { path: 'ai-glossary', label: 'Glossaire IA' },
            translations: {
                en: {
                    title: 'Lexicon index',
                    description: 'Index: everything',
                    intro: 'Generated.',
                    hubLink: { path: 'ai-glossary', label: 'AI Glossary' },
                },
            },
        },
    });
    assert.equal(config.enabled, true);
    return /** @type {import('../config/lexicon.mjs').LexiconConfigEnabled} */ (config);
}

test('lexiconIndexLabels localizes the table header (English for other languages)', () => {
    assert.deepEqual(lexiconIndexLabels('fr'), { term: 'Terme', definition: 'Définition' });
    assert.deepEqual(lexiconIndexLabels('en-US'), { term: 'Term', definition: 'Definition' });
    assert.deepEqual(lexiconIndexLabels('de'), { term: 'Term', definition: 'Definition' });
});

test('hubLinkMarkdown links the hub only when the intro does not already', () => {
    const hubLink = { path: 'ai-glossary', label: 'AI Glossary' };
    assert.equal(hubLinkMarkdown({ intro: 'See [[00-lexique/ai-glossary|AI Glossary]].', hubLink }, '00-lexique'), '');
    assert.equal(
        hubLinkMarkdown({ intro: 'Generated.', hubLink }, '00-lexique'),
        '→ [[00-lexique/ai-glossary|AI Glossary]]',
    );
    assert.equal(hubLinkMarkdown({ intro: 'Generated.' }, '00-lexique'), '');
});

test('buildLocalizedLexiconIndex lists localized entries and falls back to default-locale ones', () => {
    const tmp = localizedVault();
    try {
        const config = localizedConfig();
        const translation = config.index.translations?.en;
        assert.ok(translation);
        const index = buildLocalizedLexiconIndex(tmp, config, 'en', translation, { lang: 'en', defaultLang: 'fr' });
        assert.ok(index);
        assert.deepEqual(
            index.entries.map((e) => [e.slug, e.title, e.fallback]),
            [
                ['alpha', 'Alpha', false],
                ['beta', 'Beta', false],
                ['en-only', 'English only', false],
                ['gamma', 'Gamma', true],
            ],
        );
        assert.equal(index.fallbacks, 1);
        assert.equal(index.outputPath, path.join(tmp, 'en', '00-lexique', 'lexicon-index.md'));
        assert.equal(
            index.markdown,
            [
                '---',
                'title: Lexicon index',
                'description: "Index: everything"',
                '---',
                '',
                'Generated.',
                '',
                '→ [[00-lexique/ai-glossary|AI Glossary]]',
                '',
                '| Term | Definition |',
                '| :-- | :-- |',
                '| [Alpha](/en/00-lexique/alpha/) | Alpha definition |',
                '| [Beta](/en/00-lexique/beta/) | Beta definition |',
                '| [English only](/en/00-lexique/en-only/) | Only in English |',
                '| [Gamma](/00-lexique/gamma/) (FR) | Définition gamma \\| pipe |',
                '',
            ].join('\n'),
        );
        assert.equal(buildLocalizedLexiconIndex(tmp, config, 'de', translation), null, 'no de/ mirror');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('writeLocalizedLexiconIndexes writes mirrored locales only, not the default index', () => {
    const tmp = localizedVault();
    try {
        const config = localizedConfig();
        const locales = { ...loadVaultLocales(tmp), de: { lang: 'de' } };
        const results = writeLocalizedLexiconIndexes(tmp, config, locales);
        assert.deepEqual(
            results.map((r) => [r.locale, r.index?.entries.length ?? 0, r.skipped]),
            [
                ['en', 4, undefined],
                ['de', 0, 'no lexicon.index.translations entry'],
            ],
        );
        const out = fs.readFileSync(path.join(tmp, 'en', '00-lexique', 'lexicon-index.md'), 'utf-8');
        assert.match(out, /\| \[Alpha\]\(\/en\/00-lexique\/alpha\/\) \|/);
        assert.doesNotMatch(out, /Secret|hidden/);
        assert.equal(fs.existsSync(path.join(tmp, '00-lexique', 'lexicon-index.md')), false);
        assert.deepEqual(loadVaultLocales(path.join(tmp, 'missing')), {});
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('renderIndexMarkdown keeps the default-locale output (French header, no extra hub line)', () => {
    const md = renderIndexMarkdown(
        [{ slug: 'ram', title: 'RAM', description: 'Mémoire', warnings: [] }],
        localizedConfig(),
    );
    assert.equal(
        md,
        [
            '---',
            'title: Index du lexique',
            'description: "Index : tout"',
            '---',
            '',
            'Généré. Voir [[00-lexique/ai-glossary|Glossaire IA]].',
            '',
            '| Terme | Définition |',
            '| :-- | :-- |',
            '| [RAM](/00-lexique/ram/) | Mémoire |',
            '',
        ].join('\n'),
    );
});
