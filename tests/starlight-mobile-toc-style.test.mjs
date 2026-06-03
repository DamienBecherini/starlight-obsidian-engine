// @ts-check
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const pageSidebarPath = path.join(repoRoot, 'src/components/PageSidebar.astro');

test('mobile table of contents dark mode has a distinct dropdown surface', () => {
    const component = fs.readFileSync(pageSidebarPath, 'utf8');

    assert.match(component, /:global\(:root\[data-theme=['"]dark['"]\]\s+#starlight__mobile-toc\[open\]\s+\.dropdown\)/);
    assert.match(component, /backdrop-filter:\s*blur\(/);
    assert.match(component, /background-color:\s*color-mix\(/);
    assert.match(component, /box-shadow:/);
    assert.match(component, /border-color:/);
});
