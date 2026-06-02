// @ts-check
import { loadVaultPublishFilter, entryPathToVaultRelative } from '../gitignore.mjs';

/**
 * @typedef {import('astro/loaders').Loader} Loader
 * @typedef {import('astro/loaders').LoaderContext} LoaderContext
 */

/**
 * Wraps a Starlight/glob docs loader and skips unpublished vault paths (`publish.exclude`,
 * `.gitignore`, `_private/`, vault-root README) **before** schema validation, then removes any
 * matching entries from the store.
 *
 * @param {{ inner: Loader, vaultRoot: string, engineRoot: string }} options
 * @returns {Loader}
 */
export function vaultAwareDocsLoader({ inner, vaultRoot, engineRoot }) {
    const isIgnored = loadVaultPublishFilter(vaultRoot);

    /**
     * @param {string | undefined} filePath Absolute or engine-relative path.
     * @returns {boolean}
     */
    const shouldSkip = (filePath) => {
        const vaultRel = entryPathToVaultRelative(filePath, engineRoot, vaultRoot);
        return Boolean(vaultRel && isIgnored(vaultRel));
    };

    return {
        name: 'vault-aware-docs-loader',
        load: async (/** @type {LoaderContext} */ context) => {
            const originalParseData = context.parseData.bind(context);
            /** @type {LoaderContext['parseData']} */
            context.parseData = async (props) => {
                if (shouldSkip(props.filePath)) {
                    // Satisfy docsSchema so the inner loader does not abort; entry is dropped below.
                    return originalParseData({
                        ...props,
                        data: { ...props.data, title: 'Excluded vault file', description: '' },
                    });
                }
                return originalParseData(props);
            };

            await inner.load(context);

            let excluded = 0;
            for (const id of [...context.store.keys()]) {
                const entry = context.store.get(id);
                if (shouldSkip(entry?.filePath)) {
                    context.store.delete(id);
                    excluded += 1;
                }
            }

            if (excluded) {
                context.logger.info(`Excluded ${excluded} unpublished vault file(s) from build.`);
            }
        },
    };
}
