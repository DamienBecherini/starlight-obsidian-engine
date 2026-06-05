// @ts-check
/**
 * Runs multiple Astro content loaders sequentially against the same store.
 * @param {import('astro/loaders').Loader[]} loaders
 * @returns {import('astro/loaders').Loader}
 */
export function compositeLoader(...loaders) {
    return {
        name: 'composite-loader',
        load: async (context) => {
            for (const loader of loaders) {
                await loader.load(context);
            }
        },
    };
}
