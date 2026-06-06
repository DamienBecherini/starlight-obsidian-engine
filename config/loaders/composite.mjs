// @ts-check
/**
 * Runs multiple Astro content loaders sequentially against the same store.
 *
 * Astro glob loaders (including Starlight's docsLoader) sync entries by marking
 * every existing store key as "untouched", then deleting untouched keys after
 * their scan. When composing loaders, a later glob would wipe entries added by
 * an earlier one. We snapshot pre-existing entries before each subsequent loader
 * and restore any that were pruned.
 *
 * @param {import('astro/loaders').Loader[]} loaders
 * @returns {import('astro/loaders').Loader}
 */
export function compositeLoader(...loaders) {
    return {
        name: 'composite-loader',
        load: async (context) => {
            for (let i = 0; i < loaders.length; i++) {
                /** @type {Map<string, unknown>} */
                const preserved = new Map();
                if (i > 0) {
                    for (const id of context.store.keys()) {
                        preserved.set(id, context.store.get(id));
                    }
                }

                await loaders[i].load(context);

                if (i > 0) {
                    for (const [id, entry] of preserved) {
                        if (entry && !context.store.get(id)) {
                            context.store.set(entry);
                        }
                    }
                }
            }
        },
    };
}
