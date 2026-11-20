// @ts-check
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { DEFAULT_IDLE_MINUTES, createIdleWatch, devIdleExitIntegration, idleMinutes } from '../config/dev-idle-exit.mjs';

test('idleMinutes reads the delay, a way to say never, and falls back to an hour', () => {
    assert.equal(DEFAULT_IDLE_MINUTES, 60);
    assert.equal(idleMinutes(undefined), 60);
    assert.equal(idleMinutes(''), 60);
    assert.equal(idleMinutes('soon'), 60);
    assert.equal(idleMinutes('-5'), 60);
    assert.equal(idleMinutes('15'), 15);
    assert.equal(idleMinutes(' 0.5 '), 0.5);
    for (const never of ['0', 'off', 'OFF', 'false', 'never', 'no']) assert.equal(idleMinutes(never), 0);
});

test('the watch says once that the limit is passed, and a use puts it off', () => {
    let clock = 0;
    let stops = 0;
    const watch = createIdleWatch({ limitMs: 1000, onIdle: () => stops++, now: () => clock });
    clock = 999;
    assert.equal(watch.check(), false);
    watch.touch();
    clock = 1998;
    assert.equal(watch.check(), false, 'used 999 ms ago');
    assert.equal(watch.idleMs(), 999);
    clock = 1999;
    assert.equal(watch.check(), true);
    clock = 5000;
    assert.equal(watch.check(), false, 'said once');
    assert.equal(stops, 1);
});

/** A development server as the hook sees it, and what the hook asked of it. */
function fakeServer() {
    /** @type {((request: unknown, response: unknown, next: () => void) => void)[]} */
    const middlewares = [];
    const watcher = new EventEmitter();
    const httpServer = new EventEmitter();
    let closed = 0;
    return {
        server: {
            middlewares: { use: (/** @type {(typeof middlewares)[number]} */ handler) => middlewares.push(handler) },
            watcher,
            httpServer,
            close: async () => {
                closed++;
            },
        },
        request: () => middlewares.forEach((handler) => handler({}, {}, () => {})),
        change: () => watcher.emit('all', 'change', 'page.md'),
        closed: () => closed,
        httpServer,
    };
}

/**
 * Runs the hook of the integration on a fake server.
 * @param {string | undefined} minutes
 */
function setup(minutes) {
    const fake = fakeServer();
    /** @type {number[]} */
    const exits = [];
    /** @type {string[]} */
    const said = [];
    const integration = devIdleExitIntegration({ env: { DEV_IDLE_EXIT_MINUTES: minutes }, exit: (code) => exits.push(code) });
    const hook = /** @type {(options: unknown) => void} */ (integration.hooks['astro:server:setup']);
    hook({ server: fake.server, logger: { info: (/** @type {string} */ message) => said.push(message) } });
    return { ...fake, exits, said };
}

const wait = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('the development server stops after the delay without a request or a change', async () => {
    const dev = setup('0.002'); // 120 ms
    await wait(60);
    dev.request();
    await wait(90);
    assert.equal(dev.closed(), 0, 'a request 90 ms ago: still running');
    dev.change();
    await wait(90);
    assert.equal(dev.closed(), 0, 'a change of a watched file counts too');
    await wait(220);
    assert.equal(dev.closed(), 1);
    assert.deepEqual(dev.exits, [0]);
    assert.match(dev.said[0], /No request and no change for 0\.002 min/);
    dev.httpServer.emit('close');
});

test('DEV_IDLE_EXIT_MINUTES=0 leaves the development server alone', async () => {
    const dev = setup('0');
    await wait(50);
    assert.equal(dev.closed(), 0);
    assert.deepEqual(dev.exits, []);
});
