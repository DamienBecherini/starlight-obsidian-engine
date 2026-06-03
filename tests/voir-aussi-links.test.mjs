// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    extractVoirAussiSectionBody,
    extractVoirAussiTargets,
    voirAussiSlugSet,
} from '../scripts/lib/voir-aussi-links.mjs';

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

test('extractVoirAussiSectionBody stops at next heading', () => {
    const body = extractVoirAussiSectionBody(ramMarkdown);
    assert.match(body, /VRAM/);
    assert.match(body, /Offloading/);
    assert.doesNotMatch(body, /PCIe/);
});

test('extractVoirAussiTargets resolves wiki links relative to source slug', () => {
    const targets = extractVoirAussiTargets(ramMarkdown, '00-lexique/ram');
    assert.deepEqual(targets.sort(), [
        '00-lexique/offloading',
        '00-lexique/vram',
        '01-fondations/memoire-unifiee-vs-ram-vs-vram',
    ]);
});

test('extractVoirAussiTargets supports plain Voir aussi heading', () => {
    const md = `## Voir aussi
- [[00-lexique/apu|APU]]
`;
    assert.deepEqual(extractVoirAussiTargets(md, '00-lexique/ram'), ['00-lexique/apu']);
});

test('voirAussiSlugSet returns empty set when section absent', () => {
    assert.equal(voirAussiSlugSet('# Title\n\nNo links.', '00-lexique/ram').size, 0);
});
