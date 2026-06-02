// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVaultGitRoot } from '../../config/vault.mjs';
import { loadLexiconConfig, isLexiconEnabled } from '../../config/lexicon.mjs';
import { buildLinkGraph } from './link-graph.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(__dirname, '../..');
const defaultOutputPath = path.join(engineRoot, 'src/generated/link-graph.json');

/**
 * @param {{ vaultRoot?: string, outputPath?: string, quiet?: boolean }} [options]
 * @returns {{ outputPath: string, targetCount: number, edgeCount: number }}
 */
export function writeLinkGraph(options = {}) {
    const vaultRoot = options.vaultRoot ?? resolveVaultGitRoot();
    const outputPath = options.outputPath ?? defaultOutputPath;
    const lexicon = loadLexiconConfig(vaultRoot);
    const sortLocale = isLexiconEnabled(lexicon) ? lexicon.sortLocale : 'fr';

    const graph = buildLinkGraph(vaultRoot, { sortLocale });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf-8');

    const targetCount = Object.keys(graph.backlinks).length;
    const edgeCount = Object.values(graph.backlinks).reduce((n, arr) => n + arr.length, 0);

    if (!options.quiet) {
        console.log(`✅ Link graph: ${targetCount} targets, ${edgeCount} backlinks → ${outputPath}`);
    }

    return { outputPath, targetCount, edgeCount };
}
