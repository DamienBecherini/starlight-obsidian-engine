import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    applySeoToSitemaps,
    isNoindex,
    pageSeoFromHtml,
    parseSeoBlock,
    rewriteSitemap,
    sitemapOptions,
    stripLocale,
} from '../config/seo-indexing.mjs';

const localeKeys = ['en'];

test('parseSeoBlock: keeps string patterns, drops leading slashes, ignores the rest', () => {
    assert.deepEqual(parseSeoBlock(undefined), { noindex: [] });
    assert.deepEqual(parseSeoBlock({ noindex: ['/00-lexique/**', '!/00-lexique/hub', ' a\\b ', '', 3] }), {
        noindex: ['00-lexique/**', '!00-lexique/hub', 'a/b'],
    });
    assert.deepEqual(parseSeoBlock({ noindex: '00-lexique/**' }), { noindex: [] });
});

test('stripLocale: removes a locale folder only', () => {
    assert.equal(stripLocale('en/00-lexique/llm', localeKeys), '00-lexique/llm');
    assert.equal(stripLocale('00-lexique/llm.md', localeKeys), '00-lexique/llm');
    assert.equal(stripLocale('english/page', localeKeys), 'english/page');
});

test('isNoindex: patterns cover every locale, negations re-include, frontmatter wins', () => {
    const patterns = ['00-lexique/**', '!00-lexique/ai-glossary'];
    assert.equal(isNoindex({ id: '00-lexique/llm', patterns, localeKeys }), true);
    assert.equal(isNoindex({ id: 'en/00-lexique/llm', patterns, localeKeys }), true);
    assert.equal(isNoindex({ id: '00-lexique/ai-glossary', patterns, localeKeys }), false);
    assert.equal(isNoindex({ id: 'en/00-lexique/ai-glossary', patterns, localeKeys }), false);
    assert.equal(isNoindex({ id: '01-fondations/page', patterns, localeKeys }), false);
    assert.equal(isNoindex({ id: '00-lexique/llm', frontmatter: false, patterns, localeKeys }), false);
    assert.equal(isNoindex({ id: '01-fondations/page', frontmatter: true, patterns: [], localeKeys }), true);
    assert.equal(isNoindex({ id: '', patterns: ['**'], localeKeys }), false, 'home page needs frontmatter');
});

test('pageSeoFromHtml: reads canonical, robots noindex and a valid modified date', () => {
    const html =
        '<html><head><link rel="canonical" href="https://x.test/a/"/>' +
        '<meta content="noindex, follow" name="robots">' +
        '<meta property="article:modified_time" content="2026-11-01"></head><body>noindex</body></html>';
    assert.deepEqual(pageSeoFromHtml(html), { url: 'https://x.test/a/', noindex: true, lastmod: '2026-11-01' });
    const plain = '<head><link rel="canonical" href="https://x.test/b/"><meta property="article:modified_time" content="1er novembre"></head>';
    assert.deepEqual(pageSeoFromHtml(plain), { url: 'https://x.test/b/', noindex: false, lastmod: null });
    assert.equal(pageSeoFromHtml('<head></head><body><meta name="robots" content="noindex"></body>').noindex, false);
});

test('rewriteSitemap: removes noindex entries and their alternates, adds lastmod', () => {
    const xml =
        '<urlset><url><loc>https://x.test/a/</loc><xhtml:link rel="alternate" hreflang="en" href="https://x.test/en/a/"/></url>' +
        '<url><loc>https://x.test/en/a/</loc></url>' +
        '<url><loc>https://x.test/b/</loc><xhtml:link rel="alternate" hreflang="fr" href="https://x.test/b/"/></url></urlset>';
    const result = rewriteSitemap(xml, new Set(['https://x.test/en/a/']), new Map([['https://x.test/b/', '2026-11-01']]));
    assert.equal(result.removed, 1);
    assert.equal(result.dated, 1);
    assert.equal(
        result.xml,
        '<urlset><url><loc>https://x.test/a/</loc></url>' +
            '<url><loc>https://x.test/b/</loc><lastmod>2026-11-01</lastmod><xhtml:link rel="alternate" hreflang="fr" href="https://x.test/b/"/></url></urlset>',
    );
});

test('applySeoToSitemaps: rewrites sitemap-N.xml from the built pages', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-sitemap-'));
    try {
        fs.mkdirSync(path.join(dir, 'a'));
        fs.writeFileSync(
            path.join(dir, 'a', 'index.html'),
            '<head><link rel="canonical" href="https://x.test/a/"><meta name="robots" content="noindex, follow"></head>',
        );
        fs.writeFileSync(
            path.join(dir, 'index.html'),
            '<head><link rel="canonical" href="https://x.test/"><meta property="article:modified_time" content="2026-10-30"></head>',
        );
        fs.writeFileSync(
            path.join(dir, 'sitemap-0.xml'),
            '<urlset><url><loc>https://x.test/</loc></url><url><loc>https://x.test/a/</loc></url></urlset>',
        );
        assert.deepEqual(applySeoToSitemaps(dir), { removed: 1, dated: 1, files: 1 });
        assert.equal(
            fs.readFileSync(path.join(dir, 'sitemap-0.xml'), 'utf8'),
            '<urlset><url><loc>https://x.test/</loc><lastmod>2026-10-30</lastmod></url></urlset>',
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('sitemapOptions: i18n only for a multilingual site, as Starlight does', () => {
    assert.deepEqual(sitemapOptions({ root: { lang: 'fr' } }, 'root'), {});
    assert.deepEqual(sitemapOptions({ root: { lang: 'fr' }, en: { lang: 'en' } }, undefined), {
        i18n: { defaultLocale: 'root', locales: { root: 'fr', en: 'en' } },
    });
});
