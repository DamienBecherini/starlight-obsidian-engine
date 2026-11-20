// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import { remarkObsidianMath, withObsidianDollars } from '../config/remark/obsidian-math.mjs';

const renderer = await createMarkdownProcessor({ remarkPlugins: [remarkMath, remarkObsidianMath] });

/**
 * The formulas of a text, as the site would read them.
 * @param {string} text
 * @returns {Promise<string[]>}
 */
async function formulas(text) {
    const html = (await renderer.render(text)).code;
    return [...html.matchAll(/<code class="language-math math-(?:inline|display)">([\s\S]*?)<\/code>/g)].map(
        (m) => m[1],
    );
}

test('prices in dollars are text, in French and in English', async () => {
    for (const text of [
        'Un prix public de 1 999 $ et, chez les tiers, 27 800 $ les quatre.',
        'From $5,499; the 512 GB option costs about $6,950 per unit, so ≈ $27,800 for four.',
        'Entre 2,99 $/h et 4,69 $/h par GPU[^1], soit 3 $ de moins.\n\n[^1]: <https://example.org/prices>',
        'A range of $300–420k per node, up from $250k.',
        'Costs $5/$10 per million tokens.',
        'One price only: 20 $.',
    ]) {
        assert.deepEqual(await formulas(text), [], text);
    }
});

test('a link between two prices stays a link', async () => {
    const html = (await renderer.render('À 4,69 $/h chez [Lambda](https://example.org/gpu), contre 2,99 $/h.')).code;
    assert.match(html, /<a href="https:\/\/example\.org\/gpu">Lambda<\/a>/);
});

test('formulas between single dollars are still formulas', async () => {
    assert.deepEqual(await formulas('La mémoire croît en $O(n^2)$ puis en $n$.'), ['O(n^2)', 'n']);
    assert.deepEqual(await formulas('Soit $d_{model} = 4096$, donc $2 \\times L$ tenseurs.'), [
        'd_{model} = 4096',
        '2 \\times L',
    ]);
    assert.deepEqual(await formulas('Une formule sur deux lignes : $a +\nb$.'), ['a +\nb']);
});

test('a formula and a price in the same paragraph', async () => {
    assert.deepEqual(await formulas('Avec $n = 8$ cartes à 1 999 $ pièce, soit 15 992 $.'), ['n = 8']);
});

test('what Obsidian does not read as a formula is not one', async () => {
    // A space after the opening dollar, a space before the closing one, a digit after the closing one.
    assert.deepEqual(await formulas('Pas une formule : $ x$.'), []);
    assert.deepEqual(await formulas('Pas une formule : $x $.'), []);
    assert.deepEqual(await formulas('Pas une formule : $x$2.'), []);
});

test('double dollars are not concerned', async () => {
    assert.deepEqual(await formulas('En ligne : $$ a + b $$ ici.'), ['a + b']);
    assert.deepEqual(await formulas('$$\n\\frac{a}{b}\n$$'), ['\\frac{a}{b}']);
});

test('more dollars than at the opening are content, as remark-math reads them', async () => {
    assert.deepEqual(await formulas('Reste : $a$$b$.'), ['a$$b']);
});

test('an escaped dollar stays a dollar', async () => {
    assert.deepEqual(await formulas('Un prix \\$5 et un autre \\$6.'), []);
});

test('an extension without inline math is left as it is', () => {
    const extension = { flow: { 36: { name: 'mathFlow' } } };
    assert.equal(withObsidianDollars(extension), extension);
    const other = { text: { 36: { name: 'somethingElse' } } };
    assert.equal(withObsidianDollars(other).text[36], other.text[36]);
});
