// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { wikiLinkPermalink } from '../config/wiki-link-permalink.mjs';

test('wikiLinkPermalink drops the backslash of an alias escaped for a table', () => {
    assert.equal(wikiLinkPermalink('04-blueprints/scenario-a-dev-lab\\'), '04-blueprints/scenario-a-dev-lab');
});

test('wikiLinkPermalink lowercases and replaces spaces', () => {
    assert.equal(wikiLinkPermalink(' Mon Dossier/Ma Page '), 'mon-dossier/ma-page');
});
