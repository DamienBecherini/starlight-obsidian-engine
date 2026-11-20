// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(__dirname, '..');
const fixtureVault = path.join(__dirname, 'fixtures', 'minimal-vault');
const cacheRoot = path.join(engineRoot, 'node_modules', '.cache');
fs.mkdirSync(cacheRoot, { recursive: true });
/** Same volume as the project — avoids EXDEV when Astro renames assets on Windows. */
const distDir = fs.mkdtempSync(path.join(cacheRoot, 'smoke-dist-'));

/** @param {string} dir @param {string} [prefix] @returns {string[]} */
function listRelativePaths(dir, prefix = '') {
    /** @type {string[]} */
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listRelativePaths(abs, rel));
        else if (entry.isFile()) out.push(rel.replace(/\\/g, '/'));
    }
    return out;
}

try {
    console.log('Smoke build: astro build with fixture vault (no repo writes)…');
    console.log(`   VAULT_PATH=${fixtureVault}`);
    console.log(`   ASTRO_OUT_DIR=${distDir}`);

    // The Astro CLI run by the current Node binary: no shell, no npx lookup.
    const astroCli = path.join(engineRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
    const build = spawnSync(process.execPath, [astroCli, 'build'], {
        cwd: engineRoot,
        env: {
            ...process.env,
            VAULT_PATH: fixtureVault,
            FORCE_VAULT_PATH: '1',
            ASTRO_OUT_DIR: distDir,
        },
        stdio: 'inherit',
    });

    if (build.status !== 0) {
        console.error('❌ Smoke build failed.');
        process.exit(build.status ?? 1);
    }

    const indexHtml = path.join(distDir, '00-index', 'index.html');
    assert.ok(fs.existsSync(indexHtml), `Expected ${indexHtml} to exist`);
    const html = fs.readFileSync(indexHtml, 'utf8');
    assert.match(html, /class="starlight-aside starlight-aside--note"/);
    assert.match(html, /Objectif/);
    assert.match(html, /Smoke callout content\./);
    // SEO: one JSON-LD block, a single twitter:card, leading emoji stripped from <title> only.
    assert.equal(html.match(/<script type="application\/ld\+json">/g)?.length, 1, 'one JSON-LD block');
    assert.match(html, /"@type":"Article","headline":"Test Index"/);
    assert.equal(html.match(/name="twitter:card"/g)?.length ?? 0, 1, 'a single twitter:card');
    assert.match(html, /<title>Test Index \| Test Vault<\/title>/);
    assert.match(html, /<meta property="og:title" content="Test Index"/);
    assert.match(html, /<h1[^>]*>🧪 Test Index<\/h1>/);
    // Lexicon tooltip: definition on the link, hidden description it points to.
    assert.match(html, /<a[^>]*href="\/glossary\/term\/"[^>]*data-lexicon-def="Smoke term definition\."/);
    assert.match(html, /aria-describedby="lexicon-def-term"/);
    assert.match(html, /<span id="lexicon-def-term">Smoke term definition\.<\/span>/);
    // Prerequisites box: resolved title, unknown path skipped.
    assert.match(html, /class="reading-prerequisites[^"]*"[^>]*aria-label="Pour bien lire cette page"/);
    assert.match(html, /<a href="\/glossary\/term\/"[^>]*>Smoke Term<\/a>/);
    assert.doesNotMatch(html, /missing\/page/);
    // « Give my opinion » (site.config.json → feedback): the card, and the window with where an opinion can go
    assert.match(html, /<aside class="site-feedback[^"]*"[^>]*aria-label="Votre avis compte"/);
    assert.match(html, /<dialog class="site-feedback-dialog[^"]*"[^>]*data-email="feedback@example\.com"[^>]*data-repository="example\/test-vault"/);
    assert.match(html, /data-feedback-send="mail"/);
    const termHtml = fs.readFileSync(path.join(distDir, 'glossary', 'term', 'index.html'), 'utf8');
    assert.doesNotMatch(termHtml, /data-lexicon-def="/, 'no tooltip on the entry page itself');
    // Default-locale pages keep default-locale links.
    const frOnlyHtml = fs.readFileSync(path.join(distDir, '00-index', 'fr-only', 'index.html'), 'utf8');
    assert.match(frOnlyHtml, /<a[^>]*href="\/glossary\/term\/"[^>]*data-lexicon-def="Smoke term definition\."/);
    assert.doesNotMatch(frOnlyHtml, /href="\/en\//);
    // Localized links: EN mirror → /en/ page (EN tooltip, anchor kept), no mirror → FR page + hreflang.
    const enHtml = fs.readFileSync(path.join(distDir, 'en', '00-index', 'index.html'), 'utf8');
    assert.match(enHtml, /<a[^>]*href="\/en\/glossary\/term\/"[^>]*data-lexicon-def="Smoke term definition \(EN\)\."/);
    assert.match(enHtml, /<a[^>]*href="\/en\/glossary\/term#usage\/"/);
    assert.match(enHtml, /<a[^>]*href="\/00-index\/fr-only\/"[^>]*hreflang="fr"/);
    assert.doesNotMatch(enHtml, /href="\/glossary\/term/);

    // Indexing: seo.noindex covers glossary/** in every locale, frontmatter noindex: false wins on the EN entry.
    const robotsNoindex = /<meta name="robots" content="noindex, follow"/;
    assert.match(termHtml, robotsNoindex, 'FR glossary entry is noindex (site.config.json pattern)');
    const enTermHtml = fs.readFileSync(path.join(distDir, 'en', 'glossary', 'term', 'index.html'), 'utf8');
    assert.doesNotMatch(enTermHtml, robotsNoindex, 'frontmatter noindex: false overrides the pattern');
    assert.doesNotMatch(html, robotsNoindex, 'ordinary pages stay indexable');
    // Sitemap: noindex page removed (alternates too), lastmod from frontmatter last_modified.
    const sitemapXml = fs
        .readdirSync(distDir)
        .filter((name) => /^sitemap-\d+\.xml$/.test(name))
        .map((name) => fs.readFileSync(path.join(distDir, name), 'utf8'))
        .join('');
    assert.ok(sitemapXml, 'a sitemap is written');
    assert.doesNotMatch(sitemapXml, /https:\/\/docs\.example\.com\/glossary\/term\//, 'noindex page out of the sitemap');
    assert.match(sitemapXml, /<loc>https:\/\/docs\.example\.com\/en\/glossary\/term\/<\/loc>/);
    assert.match(sitemapXml, /<loc>https:\/\/docs\.example\.com\/00-index\/<\/loc><lastmod>2026-11-01<\/lastmod>/);

    const robots = path.join(distDir, 'robots.txt');
    assert.ok(fs.existsSync(robots), `Expected ${robots} to exist`);
    assert.equal(
        fs.readFileSync(robots, 'utf8'),
        'User-agent: *\nAllow: /\n\nSitemap: https://docs.example.com/sitemap-index.xml\n',
    );

    const distPaths = listRelativePaths(distDir);
    const forbidden = distPaths.filter(
        (p) =>
            p.startsWith('_private/') ||
            p.includes('/_private/') ||
            p.startsWith('drafts/') ||
            p.includes('/drafts/'),
    );

    assert.equal(
        forbidden.length,
        0,
        `Excluded vault paths must not appear in dist/: ${forbidden.join(', ')}`,
    );

    console.log('✅ Smoke build passed.');
} finally {
    fs.rmSync(distDir, { recursive: true, force: true });
}
