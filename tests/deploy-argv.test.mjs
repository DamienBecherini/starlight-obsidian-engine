// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    mirrorFromArgv,
    assumeYesFromArgv,
    deployModeFromArgv,
    isFullDeployArgv,
} from '../scripts/lib/deploy.mjs';

test('mirrorFromArgv defaults to true', () => {
    assert.equal(mirrorFromArgv([]), true);
    assert.equal(mirrorFromArgv(['--yes']), true);
});

test('mirrorFromArgv disables mirror with --no-mirror or --additive', () => {
    assert.equal(mirrorFromArgv(['--no-mirror']), false);
    assert.equal(mirrorFromArgv(['--additive', '--yes']), false);
});

test('assumeYesFromArgv recognizes --yes and -y', () => {
    assert.equal(assumeYesFromArgv(['--yes']), true);
    assert.equal(assumeYesFromArgv(['-y']), true);
    assert.equal(assumeYesFromArgv([]), false);
});

test('isFullDeployArgv recognizes full deploy tokens', () => {
    assert.equal(isFullDeployArgv(['--full']), true);
    assert.equal(isFullDeployArgv(['full']), true);
    assert.equal(isFullDeployArgv(['-full']), true);
    assert.equal(isFullDeployArgv(['upload', '--yes']), false);
});

test('deployModeFromArgv incremental by default', () => {
    assert.equal(deployModeFromArgv([]).incremental, true);
    assert.equal(deployModeFromArgv(['--no-mirror']).incremental, true);
});

test('deployModeFromArgv full when --full present', () => {
    assert.equal(deployModeFromArgv(['--full', '--yes']).incremental, false);
    assert.equal(deployModeFromArgv(['upload', 'full']).incremental, false);
});
