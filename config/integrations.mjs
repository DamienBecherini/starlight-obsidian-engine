// @ts-check
import react from '@astrojs/react';
import mermaid from 'astro-mermaid';
import { starlightIntegration } from './starlight/index.mjs';

/** Toutes les intégrations Astro du projet. */
export const integrations = [mermaid({ autoTheme: true }), starlightIntegration, react()];
