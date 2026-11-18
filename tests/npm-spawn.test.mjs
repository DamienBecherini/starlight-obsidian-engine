import { test } from 'node:test';
import assert from 'node:assert/strict';
import { npmCommand } from '../scripts/lib/npm-spawn.mjs';

const message = 'Fix notes; echo pwned & "quoted"';

test('npmCommand: under npm run, runs the npm CLI with node and no shell', () => {
    const r = npmCommand(['run', 'publish', '--commit-message', message], { npm_execpath: '/x/npm-cli.js' }, 'win32');
    assert.equal(r.command, process.execPath);
    assert.deepEqual(r.args, ['/x/npm-cli.js', 'run', 'publish', '--commit-message', message]);
    assert.equal(r.shell, false);
});

test('npmCommand: outside npm on Linux/macOS, calls npm without a shell', () => {
    const r = npmCommand(['run', 'build', message], {}, 'linux');
    assert.deepEqual(r, { command: 'npm', args: ['run', 'build', message], shell: false });
});

test('npmCommand: outside npm on Windows, plain arguments go through npm.cmd', () => {
    const r = npmCommand(['run', 'deploy', '--', '--yes', '--vault=ia-on-prem'], {}, 'win32');
    assert.deepEqual(r, { command: 'npm', args: ['run', 'deploy', '--', '--yes', '--vault=ia-on-prem'], shell: true });
});

test('npmCommand: outside npm on Windows, refuses an argument cmd.exe would interpret', () => {
    assert.throws(() => npmCommand(['run', 'publish', '--commit-message', message], {}, 'win32'), /npm run/);
    assert.throws(() => npmCommand(['run', 'publish', 'two words'], {}, 'win32'), /npm run/);
});

test('npmCommand: a non-JS npm_execpath (pnpm/yarn binary) falls back to npm by name', () => {
    const r = npmCommand(['run', 'build'], { npm_execpath: '/usr/bin/pnpm' }, 'linux');
    assert.equal(r.command, 'npm');
});
