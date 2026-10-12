// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { localizeInternalHref, pageIdSet } from '../config/localized-links.mjs';
import { localizeLinks, rehypeLocalizedLinks } from '../config/rehype/localized-links.mjs';

const pageIds = pageIdSet([
    'index',
    'en/index',
    '00-lexique/mla',
    'en/00-lexique/mla',
    '00-lexique/soc',
    '01-fondations/kv-cache-and-context',
    'en/01-fondations/kv-cache-and-context',
    '02-materiel/index',
    'en/02-materiel/index',
]);
const hasPage = (/** @type {string} */ id) => pageIds.has(id);
const en = { locale: 'en', localeKeys: ['en'], hasPage };

/**
 * @param {string} href
 * @returns {any}
 */
function link(href) {
    return { type: 'element', tagName: 'a', properties: { href }, children: [{ type: 'text', value: 'x' }] };
}

/**
 * @param {any[]} links
 * @returns {any}
 */
function root(links) {
    return { type: 'root', children: [{ type: 'element', tagName: 'p', properties: {}, children: links }] };
}

test('localizeInternalHref points to the localized page when it exists', () => {
    assert.deepEqual(localizeInternalHref('/00-lexique/mla/', en), { href: '/en/00-lexique/mla/', status: 'localized' });
    assert.deepEqual(localizeInternalHref('/01-fondations/kv-cache-and-context/', en), {
        href: '/en/01-fondations/kv-cache-and-context/',
        status: 'localized',
    });
    // Section index, home page, Markdown link with extension and no trailing slash.
    assert.equal(localizeInternalHref('/02-materiel/', en).href, '/en/02-materiel/');
    assert.equal(localizeInternalHref('/', en).href, '/en/');
    assert.equal(localizeInternalHref('/00-lexique/mla.md', en).href, '/en/00-lexique/mla.md');
});

test('localizeInternalHref keeps anchors and query strings', () => {
    assert.deepEqual(localizeInternalHref('/00-lexique/mla/#definition', en), {
        href: '/en/00-lexique/mla/#definition',
        status: 'localized',
    });
    assert.equal(localizeInternalHref('/00-lexique/mla/?q=1#a', en).href, '/en/00-lexique/mla/?q=1#a');
    assert.deepEqual(localizeInternalHref('/00-lexique/soc/#x', en), { href: '/00-lexique/soc/#x', status: 'fallback' });
});

test('localizeInternalHref falls back to the default-locale page when no mirror exists', () => {
    assert.deepEqual(localizeInternalHref('/00-lexique/soc/', en), { href: '/00-lexique/soc/', status: 'fallback' });
});

test('localizeInternalHref leaves non-page and already localized links alone', () => {
    for (const href of [
        '/en/00-lexique/mla/',
        '/unknown/page/',
        '/og-image.png',
        '//cdn.example.com/x',
        'https://example.com/00-lexique/mla/',
        '#section',
        '../relative/',
    ]) {
        assert.deepEqual(localizeInternalHref(href, en), { href, status: 'unchanged' }, href);
    }
    assert.deepEqual(localizeInternalHref(undefined, en), { href: undefined, status: 'unchanged' });
});

test('localizeInternalHref changes nothing on default-locale pages', () => {
    for (const locale of [undefined, 'root']) {
        assert.deepEqual(localizeInternalHref('/00-lexique/mla/', { ...en, locale }), {
            href: '/00-lexique/mla/',
            status: 'unchanged',
        });
    }
});

test('localizeLinks rewrites localized links and marks fallbacks with hreflang', () => {
    const tree = root([link('/00-lexique/mla/'), link('/00-lexique/soc/'), link('https://example.com/')]);
    const counts = localizeLinks(tree, 'en', { localeKeys: ['en'], pageIds, defaultLang: 'fr' });
    assert.deepEqual(counts, { localized: 1, fallback: 1 });
    const [mla, soc, external] = tree.children[0].children;
    assert.equal(mla.properties.href, '/en/00-lexique/mla/');
    assert.equal(mla.properties.hrefLang, undefined);
    assert.equal(soc.properties.href, '/00-lexique/soc/');
    assert.equal(soc.properties.hrefLang, 'fr');
    assert.deepEqual(external.properties, { href: 'https://example.com/' });
});

test('localizeLinks leaves default-locale pages untouched', () => {
    const tree = root([link('/00-lexique/mla/'), link('/00-lexique/soc/')]);
    assert.deepEqual(localizeLinks(tree, 'root', { localeKeys: ['en'], pageIds, defaultLang: 'fr' }), {
        localized: 0,
        fallback: 0,
    });
    assert.deepEqual(
        tree.children[0].children.map((/** @type {any} */ a) => a.properties),
        [{ href: '/00-lexique/mla/' }, { href: '/00-lexique/soc/' }],
    );
});

test('rehypeLocalizedLinks reads published pages from the vault and the locale from the file path', () => {
    const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'localized-links-'));
    const write = (/** @type {string} */ rel) => {
        fs.mkdirSync(path.dirname(path.join(vaultRoot, rel)), { recursive: true });
        fs.writeFileSync(path.join(vaultRoot, rel), '---\ntitle: x\n---\n', 'utf-8');
    };
    write('01/page.md');
    write('en/01/page.md');
    write('01/fr-only.md');
    write('drafts/hidden.md');
    write('en/drafts/hidden.md');
    fs.writeFileSync(path.join(vaultRoot, '.gitignore'), 'drafts/\n', 'utf-8');

    try {
        const transform = rehypeLocalizedLinks({ vaultRoot, engineRoot: vaultRoot, localeKeys: ['en'], defaultLang: 'fr' });
        const hrefs = ['/01/page/', '/01/fr-only/', '/drafts/hidden/'];

        const enTree = root(hrefs.map(link));
        transform(enTree, { path: path.join(vaultRoot, 'en', '01', 'page.md') });
        assert.deepEqual(
            enTree.children[0].children.map((/** @type {any} */ a) => [a.properties.href, a.properties.hrefLang]),
            [
                ['/en/01/page/', undefined],
                ['/01/fr-only/', 'fr'],
                ['/drafts/hidden/', undefined],
            ],
        );

        const frTree = root(hrefs.map(link));
        transform(frTree, { path: path.join(vaultRoot, '01', 'page.md') });
        assert.deepEqual(
            frTree.children[0].children.map((/** @type {any} */ a) => a.properties.href),
            hrefs,
        );
    } finally {
        fs.rmSync(vaultRoot, { recursive: true, force: true });
    }
});
