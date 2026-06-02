// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatWikiLinkDisplay,
    stripPathSuffixFromAlias,
    upgradeWikiLinksInText,
} from '../scripts/lib/wiki-link-label.mjs';

test('formatWikiLinkDisplay uses title index without path suffix', () => {
    const titles = new Map([['00-lexique/ram', 'RAM']]);
    assert.equal(
        formatWikiLinkDisplay('00-lexique/ram', undefined, titles),
        '[[00-lexique/ram|RAM]]',
    );
});

test('stripPathSuffixFromAlias removes trailing vault path', () => {
    assert.equal(
        stripPathSuffixFromAlias('VRAM (00-lexique/vram)', '00-lexique/vram'),
        'VRAM',
    );
});

test('upgradeWikiLinksInText strips legacy parenthetical aliases', () => {
    const titles = new Map([['00-lexique/ram', 'RAM']]);
    const input = '[[00-lexique/ram|RAM (00-lexique/ram)]]';
    assert.equal(upgradeWikiLinksInText(input, titles), '[[00-lexique/ram|RAM]]');
});

test('upgradeWikiLinksInText upgrades plain wiki links', () => {
    const titles = new Map([
        ['01-fondations/la-bande-passante-memoire', '🏎️ La Bande Passante Mémoire & Le "Memory Wall"'],
    ]);
    const out = upgradeWikiLinksInText(
        '- [[01-fondations/la-bande-passante-memoire]]',
        titles,
    );
    assert.equal(
        out,
        '- [[01-fondations/la-bande-passante-memoire|🏎️ La Bande Passante Mémoire & Le "Memory Wall"]]',
    );
});
