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

    const build = spawnSync('npx', ['astro', 'build'], {
        cwd: engineRoot,
        env: {
            ...process.env,
            VAULT_PATH: fixtureVault,
            FORCE_VAULT_PATH: '1',
            ASTRO_OUT_DIR: distDir,
        },
        stdio: 'inherit',
        shell: true,
    });

    if (build.status !== 0) {
        console.error('❌ Smoke build failed.');
        process.exit(build.status ?? 1);
    }

    const indexHtml = path.join(distDir, '00-index', 'index.html');
    assert.ok(fs.existsSync(indexHtml), `Expected ${indexHtml} to exist`);

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
