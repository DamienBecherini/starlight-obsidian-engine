// @ts-check
import path from 'node:path';
import { resolveVaultGitRoot, resolveVaultPath, projectRoot } from '../vault.mjs';
import { writeLinkGraph } from '../../scripts/lib/write-link-graph.mjs';

const DEBOUNCE_MS = 400;

/**
 * Dev-only Vite plugin: rebuild link-graph.json when vault markdown changes.
 * Triggers a soft full reload so backlink sidebars pick up the new graph.
 * @returns {import('vite').Plugin}
 */
export function linkGraphWatchPlugin() {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let debounceTimer;
    /** @type {import('vite').ViteDevServer | undefined} */
    let devServer;

    /**
     * @param {string} file
     */
    function isVaultMarkdown(file) {
        if (!/\.mdx?$/i.test(file)) return false;
        const normalized = path.normalize(file);
        const roots = [
            path.normalize(resolveVaultGitRoot()),
            path.normalize(resolveVaultPath()),
            path.normalize(path.join(projectRoot, 'src/content/docs')),
        ];
        return roots.some((root) => normalized.startsWith(root));
    }

    function scheduleRebuild() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            try {
                writeLinkGraph({ quiet: true });
                devServer?.ws.send({ type: 'full-reload' });
            } catch (error) {
                console.error('❌ Link graph rebuild failed:', error);
            }
        }, DEBOUNCE_MS);
    }

    return {
        name: 'vite-plugin-link-graph-watch',
        apply: 'serve',
        configureServer(server) {
            devServer = server;
        },
        handleHotUpdate(ctx) {
            if (!isVaultMarkdown(ctx.file)) return;
            scheduleRebuild();
            return [];
        },
    };
}
