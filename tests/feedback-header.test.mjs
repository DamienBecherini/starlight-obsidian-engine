// @ts-check
// « Give my opinion » in the header: Starlight's SocialIcons is overridden (header and mobile menu), the button
// opens the window of SiteFeedback.astro, and the window is centred.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

test('the header override is registered with Starlight', () => {
    assert.match(read('config/starlight/index.mjs'), /SocialIcons:\s*'\.\/src\/components\/SocialIcons\.astro'/);
});

test('the header button opens the feedback window, only when the site asks for feedback', () => {
    const component = read('src/components/SocialIcons.astro');
    assert.match(component, /\{feedback && \(/);
    assert.match(component, /data-feedback-open/);
    assert.match(component, /aria-label=\{L\.open\}/);
    // Starlight's own social links stay
    assert.match(component, /import Default from '@astrojs\/starlight\/components\/SocialIcons\.astro'/);
    assert.match(component, /<Default \/>/);
    // the script of the window handles every opener of the page, not only the card's
    assert.match(read('src/components/SiteFeedback.astro'), /querySelectorAll<HTMLElement>\('\[data-feedback-open\]'\)/);
});

test('the feedback window is centred despite the reset of Starlight', () => {
    const style = read('src/components/SiteFeedback.astro');
    const rule = style.slice(style.indexOf('.site-feedback-dialog {'));
    assert.match(rule.slice(0, rule.indexOf('}')), /margin:\s*auto/);
});
