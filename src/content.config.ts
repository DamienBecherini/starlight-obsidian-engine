import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, resolveVaultPath } from '../config/vault.mjs';

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');
const vaultPath = resolveVaultPath();

/** Junction ou contenu sous src/content/docs → docsLoader natif (résolution Vite MDX). */
function useDocsLoader() {
	const normalized = path.normalize(vaultPath);
	const linked = path.normalize(LINKED_DOCS);
	if (normalized === linked) return true;
	try {
		if (fs.lstatSync(linked).isSymbolicLink()) {
			return fs.realpathSync(linked) === fs.realpathSync(vaultPath);
		}
	} catch {
		/* pas de lien */
	}
	return false;
}

const vaultBase = path.relative(projectRoot, vaultPath).split(path.sep).join('/');

export const collections = {
	docs: defineCollection({
		loader: useDocsLoader()
			? docsLoader()
			: glob({
					base: vaultBase,
					pattern: '**/[^_]*.{md,mdx}',
				}),
		schema: docsSchema(),
	}),
};
