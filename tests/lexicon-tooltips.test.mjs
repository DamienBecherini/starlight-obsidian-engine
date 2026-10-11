// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseLexiconBlock } from '../config/lexicon.mjs';
import {
    lexiconDescriptionId,
    lexiconIndexSlug,
    loadLexiconDescriptions,
    lookupLexiconDescription,
    matchLexiconHref,
    splitLocalePath,
} from '../config/lexicon-tooltips.mjs';
import { annotateLexiconLinks, rehypeLexiconTooltips } from '../config/rehype/lexicon-tooltips.mjs';

/**
 * @param {Record<string, unknown>} [extra]
 * @returns {import('../config/lexicon.mjs').LexiconConfigEnabled}
 */
function lexiconConfig(extra = {}) {
    const config = parseLexiconBlock({
        enabled: true,
        directory: '00-lexique',
        hubPage: 'ai-glossary.md',
        indexPage: 'lexicon-index.md',
        index: { title: 'Index', description: 'Index', intro: 'Intro' },
        ...extra,
    });
    assert.equal(config.enabled, true);
    return /** @type {import('../config/lexicon.mjs').LexiconConfigEnabled} */ (config);
}

/** @type {import('../config/lexicon-tooltips.mjs').LexiconDescriptions} */
const descriptions = new Map([
    ['root', new Map([['vram', 'Mémoire du GPU.'], ['prefill', 'Phase de pré-remplissage.']])],
    ['en', new Map([['vram', 'GPU memory.']])],
]);

/**
 * @param {string} href
 * @param {string} [text]
 * @returns {any}
 */
function link(href, text = 'term') {
    return { type: 'element', tagName: 'a', properties: { href }, children: [{ type: 'text', value: text }] };
}

/**
 * @param {any[]} children
 * @returns {any}
 */
function root(children) {
    return { type: 'root', children: [{ type: 'element', tagName: 'p', properties: {}, children }] };
}

test('parseLexiconBlock enables tooltips by default and honours tooltips: false', () => {
    assert.equal(lexiconConfig().tooltips, true);
    assert.equal(lexiconConfig({ tooltips: false }).tooltips, false);
});

test('matchLexiconHref recognises entry links in every form', () => {
    const keys = ['en'];
    assert.equal(matchLexiconHref('/00-lexique/vram/', '00-lexique', keys), 'vram');
    assert.equal(matchLexiconHref('/00-lexique/vram', '00-lexique', keys), 'vram');
    assert.equal(matchLexiconHref('/en/00-lexique/vram/', '00-lexique', keys), 'vram');
    assert.equal(matchLexiconHref('/00-lexique/VRAM.md#definition', '00-lexique', keys), 'vram');
    assert.equal(matchLexiconHref('/00-lexique/kv-cache/?x=1', '00-lexique', keys), 'kv-cache');
    assert.equal(matchLexiconHref('/glossary/terms/gpu/', 'glossary/terms/', keys), 'gpu');
});

test('matchLexiconHref ignores non-entry links', () => {
    const keys = ['en'];
    for (const href of [
        undefined,
        '',
        '#fn-1',
        'https://example.com/00-lexique/vram/',
        '//example.com/00-lexique/vram/',
        '00-lexique/vram/',
        '/00-lexique/',
        '/00-lexique/index/',
        '/01-fondations/vram/',
        '/00-lexique/sub/vram/',
        '/de/00-lexique/vram/',
    ]) {
        assert.equal(matchLexiconHref(href, '00-lexique', keys), null, String(href));
    }
});

test('splitLocalePath separates the locale prefix from the slug', () => {
    assert.deepEqual(splitLocalePath('en/01-fondations/kv-cache.md', ['en']), {
        locale: 'en',
        slug: '01-fondations/kv-cache',
    });
    assert.deepEqual(splitLocalePath('01-fondations/kv-cache.md', ['en']), {
        locale: 'root',
        slug: '01-fondations/kv-cache',
    });
    assert.deepEqual(splitLocalePath('en.md', ['en']), { locale: 'root', slug: 'en' });
});

test('lookupLexiconDescription prefers the page locale and falls back to the default one', () => {
    assert.equal(lookupLexiconDescription(descriptions, 'vram', 'en'), 'GPU memory.');
    assert.equal(lookupLexiconDescription(descriptions, 'prefill', 'en'), 'Phase de pré-remplissage.');
    assert.equal(lookupLexiconDescription(descriptions, 'vram', 'root'), 'Mémoire du GPU.');
    assert.equal(lookupLexiconDescription(descriptions, 'missing', 'en'), undefined);
});

test('lexiconIndexSlug and lexiconDescriptionId', () => {
    assert.equal(lexiconIndexSlug(lexiconConfig()), '00-lexique/lexicon-index');
    assert.equal(lexiconDescriptionId('kv-cache'), 'lexicon-def-kv-cache');
    assert.equal(lexiconDescriptionId('a b.c'), 'lexicon-def-a-b-c');
});

test('loadLexiconDescriptions reads both locales and skips entries without description', () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-tooltips-'));
    try {
        /**
         * @param {string} rel
         * @param {string} frontmatter
         */
        const write = (rel, frontmatter) => {
            fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true });
            fs.writeFileSync(path.join(vault, rel), `---\n${frontmatter}\n---\n\nBody\n`);
        };
        write('00-lexique/vram.md', 'title: VRAM\ndescription: "Mémoire du GPU."\ntags:\n  - lexique');
        write('00-lexique/nodesc.md', 'title: No desc\ntags:\n  - lexique');
        write('00-lexique/other.md', 'title: Other\ndescription: Not an entry\ntags:\n  - autre');
        write('00-lexique/ai-glossary.md', 'title: Hub\ndescription: Hub\ntags:\n  - lexique');
        write('en/00-lexique/vram.md', 'title: VRAM\ndescription: GPU memory.\ntags:\n  - lexique');

        const loaded = loadLexiconDescriptions(vault, lexiconConfig(), ['en', 'de']);
        assert.deepEqual([...loaded.keys()], ['root', 'en']);
        assert.deepEqual([...(loaded.get('root') ?? new Map())], [['vram', 'Mémoire du GPU.']]);
        assert.deepEqual([...(loaded.get('en') ?? new Map())], [['vram', 'GPU memory.']]);
    } finally {
        fs.rmSync(vault, { recursive: true, force: true });
    }
});

test('annotateLexiconLinks adds the definition, the class and one hidden description per entry', () => {
    const tree = root([
        link('/00-lexique/vram/', 'VRAM'),
        link('/00-lexique/vram/', 'VRAM again'),
        link('/00-lexique/unknown/'),
        link('https://example.com/'),
    ]);
    const count = annotateLexiconLinks(
        tree,
        { locale: 'en', slug: '01-fondations/kv-cache' },
        { descriptions, config: lexiconConfig(), localeKeys: ['en'] },
    );
    assert.equal(count, 2);
    const [first, second, unknown, external] = tree.children[0].children;
    assert.equal(first.properties.dataLexiconDef, 'GPU memory.');
    assert.equal(first.properties.ariaDescribedBy, 'lexicon-def-vram');
    assert.deepEqual(first.properties.className, ['lexicon-term']);
    assert.equal(second.properties.ariaDescribedBy, 'lexicon-def-vram');
    assert.equal(unknown.properties.dataLexiconDef, undefined);
    assert.equal(external.properties.dataLexiconDef, undefined);

    const defs = tree.children[1];
    assert.equal(defs.tagName, 'div');
    assert.equal(defs.properties.hidden, true);
    assert.equal(defs.properties.dataPagefindIgnore, true);
    assert.equal(defs.children.length, 1);
    assert.equal(defs.children[0].properties.id, 'lexicon-def-vram');
    assert.equal(defs.children[0].children[0].value, 'GPU memory.');
});

test('annotateLexiconLinks keeps existing classes and aria-describedby', () => {
    const anchor = link('/00-lexique/vram/');
    anchor.properties = { ...anchor.properties, className: ['internal', 'new'], ariaDescribedBy: 'x' };
    annotateLexiconLinks(root([anchor]), { locale: 'root', slug: 'page' }, {
        descriptions,
        config: lexiconConfig(),
        localeKeys: ['en'],
    });
    assert.deepEqual(anchor.properties.className, ['internal', 'new', 'lexicon-term']);
    assert.equal(anchor.properties.ariaDescribedBy, 'x lexicon-def-vram');
});

test('annotateLexiconLinks skips the lexicon index page and self links', () => {
    const options = { descriptions, config: lexiconConfig(), localeKeys: ['en'] };
    const indexTree = root([link('/00-lexique/vram/')]);
    assert.equal(annotateLexiconLinks(indexTree, { locale: 'root', slug: '00-lexique/lexicon-index' }, options), 0);
    assert.equal(indexTree.children.length, 1);

    const selfTree = root([link('/00-lexique/vram/'), link('/00-lexique/prefill/')]);
    assert.equal(annotateLexiconLinks(selfTree, { locale: 'en', slug: '00-lexique/vram' }, options), 1);
    assert.equal(selfTree.children[0].children[0].properties.dataLexiconDef, undefined);
    assert.equal(selfTree.children[0].children[1].properties.dataLexiconDef, 'Phase de pré-remplissage.');
});

test('rehypeLexiconTooltips derives the page locale from the vault-relative file path', () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-rehype-'));
    try {
        const transform = rehypeLexiconTooltips({
            config: lexiconConfig(),
            vaultRoot: vault,
            engineRoot: vault,
            localeKeys: ['en'],
            descriptions,
        });
        const enTree = root([link('/00-lexique/vram/')]);
        transform(enTree, { path: path.join(vault, 'en', '01-fondations', 'page.md') });
        assert.equal(enTree.children[0].children[0].properties.dataLexiconDef, 'GPU memory.');

        const frTree = root([link('/00-lexique/vram/')]);
        transform(frTree, { path: path.join(vault, '01-fondations', 'page.md') });
        assert.equal(frTree.children[0].children[0].properties.dataLexiconDef, 'Mémoire du GPU.');

        const outside = root([link('/00-lexique/vram/')]);
        transform(outside, { path: path.join(os.tmpdir(), 'elsewhere.md') });
        transform(outside, {});
        assert.equal(outside.children[0].children[0].properties.dataLexiconDef, undefined);
    } finally {
        fs.rmSync(vault, { recursive: true, force: true });
    }
});
