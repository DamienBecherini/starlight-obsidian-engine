// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildJsonLd,
    buildRobotsTxt,
    canonicalFromHead,
    hasHeadMeta,
    serializeJsonLd,
    stripEmojiFromHeadTitles,
    stripLeadingEmoji,
} from '../config/seo.mjs';

test('buildRobotsTxt allows all and adds the sitemap only when the URL is known', () => {
    assert.equal(buildRobotsTxt(undefined), 'User-agent: *\nAllow: /\n');
    assert.equal(buildRobotsTxt(''), 'User-agent: *\nAllow: /\n');
    assert.equal(
        buildRobotsTxt('https://docs.example.com/'),
        'User-agent: *\nAllow: /\n\nSitemap: https://docs.example.com/sitemap-index.xml\n',
    );
});

test('stripLeadingEmoji removes a leading emoji and the space after it', () => {
    assert.equal(
        stripLeadingEmoji('🧠 APU & Mémoire Unifiée | ZTH: IA On-Premise'),
        'APU & Mémoire Unifiée | ZTH: IA On-Premise',
    );
    // Text-default pictographs forced to emoji with VS16 (U+FE0F).
    assert.equal(stripLeadingEmoji('⚔️ Mémoire Unifiée vs RAM'), 'Mémoire Unifiée vs RAM');
    assert.equal(stripLeadingEmoji('🏎️ Memory Bandwidth'), 'Memory Bandwidth');
    assert.equal(stripLeadingEmoji('🗜️La Quantification'), 'La Quantification');
    // ZWJ sequences, skin tone, flag, keycap, several emoji in a row.
    assert.equal(stripLeadingEmoji('👩🏽‍💻 Dev setup'), 'Dev setup');
    assert.equal(stripLeadingEmoji('🧑‍🤝‍🧑 Team'), 'Team');
    assert.equal(stripLeadingEmoji('🇫🇷 Souveraineté'), 'Souveraineté');
    assert.equal(stripLeadingEmoji('1️⃣ First step'), 'First step');
    assert.equal(stripLeadingEmoji('🚀 ✨ Launch'), 'Launch');
});

test('stripLeadingEmoji leaves other titles unchanged', () => {
    assert.equal(stripLeadingEmoji('Guide Zero to Hero'), 'Guide Zero to Hero');
    assert.equal(stripLeadingEmoji('2026 roadmap'), '2026 roadmap');
    assert.equal(stripLeadingEmoji('© Licence'), '© Licence');
    assert.equal(stripLeadingEmoji('Index 🚀'), 'Index 🚀');
    assert.equal(stripLeadingEmoji('🚀'), '🚀');
});

test('stripEmojiFromHeadTitles edits <title>, og:title and twitter:title only', () => {
    const head = [
        { tag: 'title', content: '🧠 APU | Site' },
        { tag: 'meta', attrs: { property: 'og:title', content: '🧠 APU' } },
        { tag: 'meta', attrs: { name: 'twitter:title', content: '🧠 APU' } },
        { tag: 'meta', attrs: { name: 'description', content: '🧠 kept' } },
    ];
    stripEmojiFromHeadTitles(head);
    assert.equal(head[0].content, 'APU | Site');
    assert.equal(head[1].attrs?.content, 'APU');
    assert.equal(head[2].attrs?.content, 'APU');
    assert.equal(head[3].attrs?.content, '🧠 kept');
});

test('hasHeadMeta and canonicalFromHead read Starlight head entries', () => {
    const head = [
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'link', attrs: { rel: 'canonical', href: 'https://example.com/a/' } },
    ];
    assert.equal(hasHeadMeta(head, 'twitter:card'), true);
    assert.equal(hasHeadMeta(head, 'twitter:image'), false);
    assert.equal(hasHeadMeta(undefined, 'twitter:card'), false);
    assert.equal(canonicalFromHead(head), 'https://example.com/a/');
    assert.equal(canonicalFromHead([]), undefined);
});

test('buildJsonLd builds an Article for content pages', () => {
    const data = buildJsonLd({
        kind: 'article',
        title: '🧠 APU & Mémoire Unifiée',
        siteTitle: 'ZTH: IA On-Premise',
        siteUrl: 'https://example.com/',
        description: 'Comparatif.',
        lang: 'fr',
        url: 'https://example.com/02-materiel/apu/',
        dateModified: '2026-10-10',
        author: { name: 'Damien BECHERINI', url: 'https://damien.becherini.fr' },
    });
    assert.deepEqual(data, {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'APU & Mémoire Unifiée',
        description: 'Comparatif.',
        inLanguage: 'fr',
        url: 'https://example.com/02-materiel/apu/',
        dateModified: '2026-10-10',
        author: { '@type': 'Person', name: 'Damien BECHERINI', url: 'https://damien.becherini.fr' },
        isPartOf: { '@type': 'WebSite', name: 'ZTH: IA On-Premise', url: 'https://example.com/' },
    });
});

test('buildJsonLd omits absent or invalid optional fields', () => {
    const data = buildJsonLd({
        kind: 'article',
        title: 'Page',
        siteTitle: 'Site',
        dateModified: 'soon',
        author: {},
    });
    assert.deepEqual(data, {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Page',
        isPartOf: { '@type': 'WebSite', name: 'Site' },
    });
});

test('buildJsonLd builds a WebSite for the home page', () => {
    assert.deepEqual(
        buildJsonLd({
            kind: 'website',
            title: 'Guide',
            siteTitle: 'Site',
            siteUrl: 'https://example.com',
            description: 'Home.',
            lang: 'en',
            url: 'https://example.com/en/',
        }),
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Site',
            url: 'https://example.com/en/',
            description: 'Home.',
            inLanguage: 'en',
        },
    );
    const noCanonical = buildJsonLd({
        kind: 'website',
        title: 'G',
        siteTitle: 'S',
        siteUrl: 'https://example.com',
    });
    assert.equal(noCanonical.url, 'https://example.com/');
});

test('serializeJsonLd escapes < so the JSON cannot close the script element', () => {
    const value = { headline: '</script><script>alert(1)</script> <!--' };
    const json = serializeJsonLd(value);
    assert.ok(!json.includes('<'));
    assert.match(json, /\\u003c\/script>/);
    assert.deepEqual(JSON.parse(json), value);
});
