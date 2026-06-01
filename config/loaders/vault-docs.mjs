// @ts-check
import { loadVaultGitignore, entryPathToVaultRelative } from '../gitignore.mjs';

/**
 * @typedef {import('astro/loaders').Loader} Loader
 * @typedef {import('astro/loaders').LoaderContext} LoaderContext
 */

/**
 * Wraps a Starlight/glob docs loader and removes entries matched by the vault `.gitignore`.
 * The `_private/` tree is always excluded from the build (never published to the web).
 *
 * @param {{ inner: Loader, vaultRoot: string, engineRoot: string }} options
 * @returns {Loader}
 */
export function vaultAwareDocsLoader({ inner, vaultRoot, engineRoot }) {
    const isIgnored = loadVaultGitignore(vaultRoot);

    return {
        name: 'vault-aware-docs-loader',
        load: async (/** @type {LoaderContext} */ context) => {
            await inner.load(context);

            let excluded = 0;
            for (const id of [...context.store.keys()]) {
                const entry = context.store.get(id);
                const vaultRel = entryPathToVaultRelative(entry?.filePath, engineRoot, vaultRoot);
                if (vaultRel && isIgnored(vaultRel)) {
                    context.store.delete(id);
                    excluded += 1;
                }
            }

            if (excluded) {
                context.logger.info(`Excluded ${excluded} gitignored doc(s) from build.`);
            }
        },
    };
}
