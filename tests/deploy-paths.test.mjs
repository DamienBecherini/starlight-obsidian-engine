// @ts-check
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import {
    isProtectedRel,
    compareUploadParentKeys,
    groupUploadsByParent,
} from '../scripts/lib/deploy-paths.mjs';

test('isProtectedRel checks top-level segment only', () => {
    const protect = new Set(['cgi-bin', 'backups']);
    assert.equal(isProtectedRel('cgi-bin/script.pl', protect), true);
    assert.equal(isProtectedRel('public/index.html', protect), false);
});

test('compareUploadParentKeys orders root before _astro', () => {
    assert.ok(compareUploadParentKeys('.', '_astro') < 0);
    assert.ok(compareUploadParentKeys('_astro', '.') > 0);
    assert.ok(compareUploadParentKeys('en', '_astro') < 0);
});

test('groupUploadsByParent groups by posix parent directory', () => {
    const distDir = path.join('dist');
    const uploads = [
        { rel: 'index.html', abs: '', entry: { sha256: 'a', size: 1 } },
        { rel: '_astro/foo.js', abs: '', entry: { sha256: 'b', size: 2 } },
        { rel: '_astro/bar.js', abs: '', entry: { sha256: 'c', size: 3 } },
    ];
    const groups = groupUploadsByParent(distDir, uploads);
    assert.equal(groups.size, 2);
    assert.equal(groups.get('.')?.items.length, 1);
    assert.equal(groups.get('_astro')?.items.length, 2);
    assert.equal(groups.get('_astro')?.localDir, path.join(distDir, '_astro'));
});
