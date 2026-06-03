// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_SEE_ALSO_HEADINGS,
    extractSeeAlsoSectionBody,
    extractSeeAlsoTargets,
    seeAlsoSlugSet,
} from '../scripts/lib/see-also-links.mjs';

const ramMarkdown = `---
title: RAM
---

## Définition

Text.

## 🔗 Voir aussi
- [[00-lexique/vram|VRAM]]
- [[00-lexique/offloading|Offloading]]
- [[01-fondations/memoire-unifiee-vs-ram-vs-vram|Chapitre]]

## Autre section
- [[00-lexique/pcie|PCIe]]
`;

test('extractSeeAlsoSectionBody stops at next heading', () => {
    const body = extractSeeAlsoSectionBody(ramMarkdown);
    assert.match(body, /VRAM/);
    assert.match(body, /Offloading/);
    assert.doesNotMatch(body, /PCIe/);
});

test('extractSeeAlsoTargets resolves wiki links relative to source slug', () => {
    const targets = extractSeeAlsoTargets(ramMarkdown, '00-lexique/ram');
    assert.deepEqual(targets.sort(), [
        '00-lexique/offloading',
        '00-lexique/vram',
        '01-fondations/memoire-unifiee-vs-ram-vs-vram',
    ]);
});

test('extractSeeAlsoTargets supports plain Voir aussi heading', () => {
    const md = `## Voir aussi
- [[00-lexique/apu|APU]]
`;
    assert.deepEqual(extractSeeAlsoTargets(md, '00-lexique/ram'), ['00-lexique/apu']);
});

test('extractSeeAlsoTargets supports English default headings', () => {
    const md = `## See also
- [[00-lexique/apu|APU]]

## Next
- [[00-lexique/vram|VRAM]]
`;
    assert.deepEqual(extractSeeAlsoTargets(md, '00-lexique/ram'), ['00-lexique/apu']);
});

test('extractSeeAlsoTargets supports custom headings', () => {
    const md = `## Recommended reading
- [[01-fondations/la-bande-passante-memoire|Bandwidth]]
`;
    assert.deepEqual(extractSeeAlsoTargets(md, '00-lexique/ram', ['Recommended reading']), [
        '01-fondations/la-bande-passante-memoire',
    ]);
});

test('default headings cover French and English related sections', () => {
    assert.deepEqual(DEFAULT_SEE_ALSO_HEADINGS, [
        'Voir aussi',
        'See also',
        'Related',
        'Related pages',
    ]);
});

test('seeAlsoSlugSet returns empty set when section absent', () => {
    assert.equal(seeAlsoSlugSet('# Title\n\nNo links.', '00-lexique/ram').size, 0);
});
