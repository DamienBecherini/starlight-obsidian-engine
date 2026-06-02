// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
    buildLinkGraph,
    extractWikiTargets,
    extractMarkdownInternalTargets,
    filterBacklinksForDisplay,
    normalizeLinkTarget,
    resolveLinkTarget,
    resolveLinkTargetFromSource,
    resolveLinkTargetPath,
    buildPublishedIndex,
    collectUnresolvedLinks,
} from '../scripts/lib/link-graph.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVault = path.join(__dirname, 'fixtures', 'link-graph-vault');

test('normalizeLinkTarget strips anchors and extension', () => {
    assert.equal(normalizeLinkTarget('/page-b.md#x'), 'page-b');
    assert.equal(normalizeLinkTarget('page-b/'), 'page-b');
});

test('extractWikiTargets and markdown internal links', () => {
    const body = '[[page-b|B]] and [x](/page-c/) and [rel](../page-d.md).';
    assert.deepEqual(extractWikiTargets(body), ['page-b']);
    assert.deepEqual(extractMarkdownInternalTargets(body), ['/page-c/', '../page-d.md']);
});

test('resolveLinkTargetPath resolves relative markdown paths', () => {
    assert.equal(resolveLinkTargetPath('/page-c/', 'page-a'), 'page-c');
    assert.equal(resolveLinkTargetPath('../page-d.md', '01-fondations/page-a'), 'page-d');
    assert.equal(resolveLinkTargetPath('sibling', '01-fondations/page-a'), 'sibling');
});

test('resolveLinkTargetFromSource resolves relative targets', () => {
    const { publishedSlugs, aliasToSlug } = buildPublishedIndex(fixtureVault);
    assert.equal(
        resolveLinkTargetFromSource('../page-b', '01-fondations/page-a', publishedSlugs, aliasToSlug),
        'page-b',
    );
    assert.equal(
        resolveLinkTargetFromSource('/page-b/', 'page-a', publishedSlugs, aliasToSlug),
        'page-b',
    );
});

test('buildLinkGraph resolves alias and ignores gitignored drafts', () => {
    const graph = buildLinkGraph(fixtureVault, { sortLocale: 'en' });
    const toB = graph.backlinks['page-b'];
    assert.ok(toB);
    assert.equal(toB.length, 1);
    assert.equal(toB[0].from, 'page-a');
    assert.equal(toB[0].title, 'Page A');
    assert.equal(graph.backlinks['drafts/secret'], undefined);
});

test('filterBacklinksForDisplay removes self-links', () => {
    const graph = buildLinkGraph(fixtureVault, { sortLocale: 'en' });
    const entries = graph.backlinks['page-self'] ?? [];
    const filtered = filterBacklinksForDisplay(entries, 'page-self');
    assert.equal(filtered.length, 0);
});

test('resolveLinkTarget uses alias index', () => {
    const { publishedSlugs, aliasToSlug } = buildPublishedIndex(fixtureVault);
    assert.equal(resolveLinkTarget('PageBee', publishedSlugs, aliasToSlug), 'page-b');
});
