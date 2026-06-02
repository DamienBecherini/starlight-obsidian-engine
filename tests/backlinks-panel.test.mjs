// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { getLexiconExcludeSlugs } from '../config/lexicon.mjs';
import { siteHrefFromVaultSlug } from '../src/lib/backlinks-routing.mjs';
import {
    BACKLINK_HEADING_DOC,
    BACKLINK_HEADING_LEXICON,
    backlinkPanelHeading,
    buildBacklinkPanel,
    groupBacklinkEntries,
    isLexiconBacklinkPage,
    resolveBacklinkPanelEntries,
} from '../src/lib/backlinks-panel.mjs';

/** @type {import('../config/lexicon.mjs').LexiconConfigEnabled} */
const lexiconEnabled = {
    enabled: true,
    directory: '00-lexique',
    entryTag: 'lexique',
    hubPage: 'glossaire-ia.md',
    indexPage: 'index-lexique.md',
    sortLocale: 'fr',
    index: {
        title: 'Index',
        description: 'Index',
        intro: 'Intro',
    },
};

const hubSlugs = getLexiconExcludeSlugs(lexiconEnabled);
const exclusions = {
    excludeSourceSlugs: new Set(hubSlugs),
    excludeTargetSlugs: new Set(hubSlugs),
};

/** @type {import('../scripts/lib/link-graph.mjs').BacklinkEntry[]} */
const ramBacklinks = [
    {
        from: '00-lexique/glossaire-ia',
        title: 'Glossaire IA',
        section: '00-lexique',
    },
    {
        from: '00-lexique/index-lexique',
        title: 'Index du lexique',
        section: '00-lexique',
    },
    {
        from: '00-lexique/offloading',
        title: 'Offloading',
        section: '00-lexique',
    },
    {
        from: '00-lexique/vram',
        title: 'VRAM',
        section: '00-lexique',
    },
    {
        from: '01-fondations/memoire-unifiee-vs-ram-vs-vram',
        title: 'Mémoire Unifiée vs RAM vs VRAM',
        section: '01-fondations',
    },
];

test('isLexiconBacklinkPage uses vault path, not frontmatter tags', () => {
    assert.equal(
        isLexiconBacklinkPage('00-lexique/ram', lexiconEnabled, exclusions.excludeTargetSlugs),
        true,
    );
    assert.equal(
        isLexiconBacklinkPage('01-fondations/kv-cache-et-contexte', lexiconEnabled, exclusions.excludeTargetSlugs),
        false,
    );
});

test('isLexiconBacklinkPage excludes lexicon hub and generated index targets', () => {
    assert.equal(
        isLexiconBacklinkPage('00-lexique/glossaire-ia', lexiconEnabled, exclusions.excludeTargetSlugs),
        false,
    );
    assert.equal(
        isLexiconBacklinkPage('00-lexique/index-lexique', lexiconEnabled, exclusions.excludeTargetSlugs),
        false,
    );
});

test('backlinkPanelHeading selects lexicon vs doc label', () => {
    assert.equal(backlinkPanelHeading(true), BACKLINK_HEADING_LEXICON);
    assert.equal(backlinkPanelHeading(false), BACKLINK_HEADING_DOC);
});

test('resolveBacklinkPanelEntries drops hub/index sources but keeps cross-section links', () => {
    const entries = resolveBacklinkPanelEntries(ramBacklinks, '00-lexique/ram', exclusions);
    assert.deepEqual(
        entries.map((e) => e.from),
        ['00-lexique/offloading', '00-lexique/vram', '01-fondations/memoire-unifiee-vs-ram-vs-vram'],
    );
});

test('resolveBacklinkPanelEntries returns empty list on hub target pages', () => {
    const entries = resolveBacklinkPanelEntries(ramBacklinks, '00-lexique/glossaire-ia', exclusions);
    assert.equal(entries.length, 0);
});

test('groupBacklinkEntries groups lexicon pages by section', () => {
    const entries = resolveBacklinkPanelEntries(ramBacklinks, '00-lexique/ram', exclusions);
    const grouped = groupBacklinkEntries(entries, true, 'fr');
    assert.deepEqual(
        grouped.map(([section, group]) => [section, group.map((e) => e.from)]),
        [
            ['00-lexique', ['00-lexique/offloading', '00-lexique/vram']],
            ['01-fondations', ['01-fondations/memoire-unifiee-vs-ram-vs-vram']],
        ],
    );
});

test('groupBacklinkEntries keeps flat list for non-lexicon pages', () => {
    /** @type {import('../scripts/lib/link-graph.mjs').BacklinkEntry[]} */
    const chapterBacklinks = [
        { from: '00-lexique/ram', title: 'RAM', section: '00-lexique' },
        { from: '00-lexique/vram', title: 'VRAM', section: '00-lexique' },
    ];
    const grouped = groupBacklinkEntries(chapterBacklinks, false, 'fr');
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0][0], '');
    assert.deepEqual(grouped[0][1].map((e) => e.from), ['00-lexique/ram', '00-lexique/vram']);
});

test('buildBacklinkPanel regression: lexicon entry RAM panel', () => {
    const panel = buildBacklinkPanel({
        currentSlug: '00-lexique/ram',
        rawEntries: ramBacklinks,
        lexicon: lexiconEnabled,
        exclusions,
        sortLocale: 'fr',
    });

    assert.equal(panel.shouldRender, true);
    assert.equal(panel.isLexiconPage, true);
    assert.equal(panel.heading, BACKLINK_HEADING_LEXICON);
    assert.equal(panel.entries.length, 3);
    assert.equal(panel.grouped.length, 2);
});

test('buildBacklinkPanel regression: chapter page uses doc heading', () => {
    /** @type {import('../scripts/lib/link-graph.mjs').BacklinkEntry[]} */
    const raw = [{ from: '00-lexique/ram', title: 'RAM', section: '00-lexique' }];
    const panel = buildBacklinkPanel({
        currentSlug: '01-fondations/kv-cache-et-contexte',
        rawEntries: raw,
        lexicon: lexiconEnabled,
        exclusions,
    });

    assert.equal(panel.isLexiconPage, false);
    assert.equal(panel.heading, BACKLINK_HEADING_DOC);
    assert.equal(panel.entries.length, 1);
    assert.equal(panel.grouped.length, 1);
    assert.equal(panel.grouped[0][0], '');
});

test('siteHrefFromVaultSlug builds locale-aware backlink URLs', () => {
    assert.equal(siteHrefFromVaultSlug('00-lexique/ram', undefined), '/00-lexique/ram/');
    assert.equal(siteHrefFromVaultSlug('00-lexique/ram', 'en'), '/en/00-lexique/ram/');
});
