// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadFraction, formatProgressSuffix } from '../scripts/lib/upload-progress.mjs';

test('formatProgressSuffix keeps byte counts intact', () => {
    const stats = '4.7 MB / 7.7 MB';
    const line = formatProgressSuffix(stats, 'KaTeX_AMS-Regular.BQhdFMY1.woff2', 50);
    assert.ok(line.startsWith(stats), line);
    assert.ok(line.includes('KaTeX') || line.includes('…'), line);
});

test('formatProgressSuffix truncates only the filename when space is tight', () => {
    const stats = '1.1 MB / 7.7 MB';
    const line = formatProgressSuffix(stats, 'very-long-directory-name/file-name.ext', 28);
    assert.equal(line.slice(0, stats.length), stats);
    assert.ok(!line.includes('very-long-directory'), line);
});

test('uploadFraction clamps to 0..1', () => {
    assert.equal(uploadFraction(0, 1000), 0);
    assert.equal(uploadFraction(500, 1000), 0.5);
    assert.equal(uploadFraction(1000, 1000), 1);
    assert.equal(uploadFraction(2000, 1000), 1);
    assert.equal(uploadFraction(100, 0), 0);
});
