// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFooterBlock, resolveFooterNote } from '../config/footer.mjs';

test('parseFooterBlock returns an empty config when absent or invalid', () => {
    assert.deepEqual(parseFooterBlock(undefined), { note: null, translations: {} });
    assert.deepEqual(parseFooterBlock('text'), { note: null, translations: {} });
    assert.deepEqual(parseFooterBlock({ text: '  ' }), { note: null, translations: {} });
});

test('parseFooterBlock trims text and keeps only valid links', () => {
    const config = parseFooterBlock({
        text: ' Written with AI assistance. ',
        links: [
            { label: 'Licence', href: 'https://example.com/LICENSE' },
            { label: '', href: 'https://example.com' },
            { label: 'No href' },
            42,
        ],
    });
    assert.deepEqual(config.note, {
        text: 'Written with AI assistance.',
        links: [{ label: 'Licence', href: 'https://example.com/LICENSE' }],
    });
});

test('resolveFooterNote picks the locale note and falls back to the default', () => {
    const config = parseFooterBlock({
        text: 'Rédigé avec une IA.',
        translations: { en: { text: 'Written with AI.' }, de: { text: '' } },
    });
    assert.equal(resolveFooterNote(config, 'en')?.text, 'Written with AI.');
    assert.equal(resolveFooterNote(config, 'de')?.text, 'Rédigé avec une IA.');
    assert.equal(resolveFooterNote(config, 'root')?.text, 'Rédigé avec une IA.');
    assert.equal(resolveFooterNote(undefined, 'en'), null);
});
