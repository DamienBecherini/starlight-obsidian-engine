// @ts-check
/**
 * Builds src/generated/link-graph.json from published vault markdown links.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVaultGitRoot } from '../config/vault.mjs';
import { loadLexiconConfig, isLexiconEnabled } from '../config/lexicon.mjs';
import { buildLinkGraph } from './lib/link-graph.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(__dirname, '..');
const outputPath = path.join(engineRoot, 'src/generated/link-graph.json');

const vaultRoot = resolveVaultGitRoot();
const lexicon = loadLexiconConfig(vaultRoot);
const sortLocale = isLexiconEnabled(lexicon) ? lexicon.sortLocale : 'fr';

const graph = buildLinkGraph(vaultRoot, { sortLocale });

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf-8');

const count = Object.keys(graph.backlinks).length;
const edgeCount = Object.values(graph.backlinks).reduce((n, arr) => n + arr.length, 0);
console.log(`✅ Link graph: ${count} targets, ${edgeCount} backlinks → ${outputPath}`);
