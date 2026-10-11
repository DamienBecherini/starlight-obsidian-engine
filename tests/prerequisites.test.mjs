// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    defaultLocaleSourceId,
    normalizePrerequisitePath,
    prerequisitesLabel,
    resolvePrerequisites,
    titlesById,
    warnOnce,
} from '../config/prerequisites.mjs';

const titles = titlesById([
    { id: '01-fondations/memory-bandwidth', data: { title: 'Bande passante mémoire' } },
    { id: 'en/01-fondations/memory-bandwidth', data: { title: 'Memory bandwidth' } },
    { id: '00-lexique/vram', data: { title: 'VRAM' } },
    { id: '00-index', data: { title: 'Index' } },
]);
/** @param {string} id */
const lookupTitle = (id) => titles.get(id);

test('normalizePrerequisitePath matches collection ids', () => {
    assert.equal(normalizePrerequisitePath('01-fondations/memory-bandwidth'), '01-fondations/memory-bandwidth');
    assert.equal(normalizePrerequisitePath(' /00-lexique/VRAM.md/ '), '00-lexique/vram');
    assert.equal(normalizePrerequisitePath('00-index/index'), '00-index');
    assert.equal(normalizePrerequisitePath('01-fondations\\My Page#part'), '01-fondations/my-page');
    assert.equal(normalizePrerequisitePath(42), '');
    assert.equal(normalizePrerequisitePath('  '), '');
});

test('prerequisitesLabel is French for fr pages and English otherwise', () => {
    assert.equal(prerequisitesLabel('fr'), 'Pour bien lire cette page');
    assert.equal(prerequisitesLabel('fr-CA'), 'Pour bien lire cette page');
    assert.equal(prerequisitesLabel('en'), 'Before reading this page');
    assert.equal(prerequisitesLabel('de'), 'Before reading this page');
    assert.equal(prerequisitesLabel(undefined), 'Before reading this page');
});

test('resolvePrerequisites resolves default-locale pages', () => {
    const result = resolvePrerequisites(['01-fondations/memory-bandwidth', '00-lexique/vram'], {
        locale: undefined,
        lookupTitle,
    });
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.items, [
        {
            path: '01-fondations/memory-bandwidth',
            href: '/01-fondations/memory-bandwidth/',
            title: 'Bande passante mémoire',
            fallback: false,
        },
        { path: '00-lexique/vram', href: '/00-lexique/vram/', title: 'VRAM', fallback: false },
    ]);
});

test('resolvePrerequisites uses the localized mirror and falls back to the default locale', () => {
    const result = resolvePrerequisites(['01-fondations/memory-bandwidth', '00-lexique/vram'], {
        locale: 'en',
        lookupTitle,
    });
    assert.deepEqual(result.items, [
        {
            path: '01-fondations/memory-bandwidth',
            href: '/en/01-fondations/memory-bandwidth/',
            title: 'Memory bandwidth',
            fallback: false,
        },
        { path: '00-lexique/vram', href: '/00-lexique/vram/', title: 'VRAM', fallback: true },
    ]);
    assert.equal(resolvePrerequisites(['00-lexique/vram'], { locale: 'root', lookupTitle }).items[0].fallback, false);
});

test('resolvePrerequisites skips unknown, invalid and duplicate entries with warnings', () => {
    const result = resolvePrerequisites(['nope/page', '', '00-lexique/vram', '00-lexique/vram.md'], {
        locale: 'en',
        lookupTitle,
        pageId: 'en/02-materiel/apu',
    });
    assert.deepEqual(
        result.items.map((item) => item.path),
        ['00-lexique/vram'],
    );
    assert.deepEqual(result.warnings, [
        'prerequisites: unknown page "nope/page" (in en/02-materiel/apu), skipped',
        'prerequisites: ignored empty or invalid entry "" (in en/02-materiel/apu)',
    ]);
    assert.deepEqual(resolvePrerequisites(undefined, { locale: 'en', lookupTitle }), { items: [], warnings: [] });
    assert.deepEqual(resolvePrerequisites('00-lexique/vram', { locale: 'en', lookupTitle }), {
        items: [],
        warnings: [],
    });
});

test('warnOnce prints each message a single time', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    assert.equal(warnOnce('prerequisites test message'), true);
    assert.equal(warnOnce('prerequisites test message'), false);
    assert.equal(warn.mock.callCount(), 1);
});

test('defaultLocaleSourceId maps a localized mirror to its default-locale page', () => {
    assert.equal(defaultLocaleSourceId('en/02-materiel/apu', 'en'), '02-materiel/apu');
    assert.equal(defaultLocaleSourceId('02-materiel/apu', 'en'), null);
    assert.equal(defaultLocaleSourceId('02-materiel/apu', undefined), null);
    assert.equal(defaultLocaleSourceId('02-materiel/apu', 'root'), null);
});
