// @ts-check
import react from '@astrojs/react';
import mermaid from 'astro-mermaid';
import { starlightIntegration } from './starlight/index.mjs';

/**
 * React renderer. The engine ships no React component (vault pages are Markdown/MDX rendered by
 * Starlight), so the React Compiler (Oxc, @astrojs/react 7) would bring no benefit and would need
 * the optional `oxc-transform-react` peer. Keep it explicitly off so a future default change
 * cannot alter the build silently.
 */
const reactIntegration = react({ compiler: false });

/** All Astro integrations for the project. */
export const integrations = [mermaid({ autoTheme: true }), starlightIntegration, reactIntegration];
