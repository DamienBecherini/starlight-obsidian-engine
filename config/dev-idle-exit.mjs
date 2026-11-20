// @ts-check
// The development server stops by itself when nobody uses it: a preview left running after a work session (or
// started by a tool that never came back to stop it) keeps a port, memory and a watcher on the vault for days.
// What counts as use: a request of a browser, and a change of a file the server watches (someone writing in the
// vault with the preview beside). A page left open that asks for nothing does not.

/** Minutes without a request or a change before `astro dev` stops, unless DEV_IDLE_EXIT_MINUTES says otherwise. */
export const DEFAULT_IDLE_MINUTES = 60;

/**
 * The delay asked by DEV_IDLE_EXIT_MINUTES: a positive number of minutes; `0`, `off`, `false` or `never` keep the
 * server running; anything else (unset, not a number, negative) gives the default.
 * @param {string | undefined} value
 * @returns {number} Minutes, 0 for « never ».
 */
export function idleMinutes(value) {
    const text = (value ?? '').trim().toLowerCase();
    if (['0', 'off', 'false', 'never', 'no'].includes(text)) return 0;
    const minutes = Number(text);
    return text !== '' && Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_IDLE_MINUTES;
}

/**
 * Follows the last time the server was used and says, once, when the limit is passed.
 * @param {{ limitMs: number, onIdle: () => void, now?: () => number }} options
 */
export function createIdleWatch({ limitMs, onIdle, now = Date.now }) {
    let last = now();
    let stopped = false;
    return {
        /** The server was just used. */
        touch() {
            last = now();
        },
        /** Calls `onIdle` when the limit is passed (once); true when it did. */
        check() {
            if (stopped || now() - last < limitMs) return false;
            stopped = true;
            onIdle();
            return true;
        },
        idleMs: () => now() - last,
    };
}

/**
 * Astro integration, development server only: stops `astro dev` after DEV_IDLE_EXIT_MINUTES (60 by default)
 * without a request or a watched change. A build is not concerned.
 * @param {{ env?: Record<string, string | undefined>, exit?: (code: number) => void }} [options]
 * @returns {import('astro').AstroIntegration}
 */
export function devIdleExitIntegration({ env = process.env, exit = (code) => process.exit(code) } = {}) {
    return {
        name: 'dev-idle-exit',
        hooks: {
            'astro:server:setup': ({ server, logger }) => {
                const minutes = idleMinutes(env.DEV_IDLE_EXIT_MINUTES);
                if (!minutes) return;
                const limitMs = minutes * 60_000;
                const watch = createIdleWatch({
                    limitMs,
                    onIdle: () => {
                        logger.info(
                            `No request and no change for ${minutes} min: the development server stops ` +
                                '(DEV_IDLE_EXIT_MINUTES sets the delay, 0 keeps it running).',
                        );
                        // Astro's own stop first (it releases the port and its record of the running server)
                        Promise.resolve(server.close()).finally(() => exit(0));
                    },
                });
                server.middlewares.use((_request, _response, next) => {
                    watch.touch();
                    next();
                });
                server.watcher.on('all', () => watch.touch());
                const timer = setInterval(() => watch.check(), Math.min(30_000, limitMs / 2));
                timer.unref(); // never the reason the process stays alive
                server.httpServer?.once('close', () => clearInterval(timer));
            },
        },
    };
}
