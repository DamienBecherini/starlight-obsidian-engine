// @ts-check
/**
 * Builds src/generated/link-graph.json from published vault markdown links.
 */
import { writeLinkGraph } from './lib/write-link-graph.mjs';

writeLinkGraph();
