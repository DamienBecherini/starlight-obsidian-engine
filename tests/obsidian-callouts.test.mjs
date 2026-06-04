// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    mapObsidianCalloutType,
    transformObsidianCallouts,
} from '../config/remark/obsidian-callouts.mjs';

test('maps Obsidian callout aliases to Starlight aside variants', () => {
    assert.equal(mapObsidianCalloutType('abstract'), 'note');
    assert.equal(mapObsidianCalloutType('tip'), 'tip');
    assert.equal(mapObsidianCalloutType('warning'), 'caution');
    assert.equal(mapObsidianCalloutType('error'), 'danger');
    assert.equal(mapObsidianCalloutType('unknown'), 'note');
});

test('transforms Obsidian blockquote callout to Starlight aside hast metadata', () => {
    const tree = {
        type: 'root',
        children: [
            {
                type: 'blockquote',
                children: [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', value: '[!abstract] Objectif' }],
                    },
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', value: 'Contenu avec [[wiki-link]].' }],
                    },
                ],
            },
        ],
    };

    const transformed = transformObsidianCallouts(tree);
    const aside = transformed.children[0];

    assert.equal(aside.type, 'obsidianCallout');
    assert.deepEqual(aside.data.hProperties.className, [
        'starlight-aside',
        'starlight-aside--note',
    ]);
    assert.equal(aside.data.hProperties.ariaLabel, 'Objectif');
    assert.equal(aside.children[0].data.hName, 'p');
    assert.equal(aside.children[0].children[0].value, 'Objectif');
    assert.equal(aside.children[1].data.hName, 'div');
    assert.equal(aside.children[1].children[0].children[0].value, 'Contenu avec [[wiki-link]].');
});

test('keeps inline body text after marker line', () => {
    const tree = {
        type: 'root',
        children: [
            {
                type: 'blockquote',
                children: [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', value: '[!warning] Attention\nReste du texte.' }],
                    },
                ],
            },
        ],
    };

    const aside = transformObsidianCallouts(tree).children[0];

    assert.equal(aside.data.hProperties.className[1], 'starlight-aside--caution');
    assert.equal(aside.children[1].children[0].children[0].value, 'Reste du texte.');
});
