// @ts-check
import react from '@astrojs/react';
import mermaid from 'astro-mermaid';
import { starlightIntegration } from './starlight/index.mjs';

/** All Astro integrations for the project. */
export const integrations = [mermaid({ autoTheme: true }), starlightIntegration, react()];
