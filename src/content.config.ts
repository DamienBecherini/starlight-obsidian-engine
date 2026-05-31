import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, resolveVaultPath } from '../config/vault.mjs';

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');
const vaultPath = resolveVaultPath();

/** Junction or content under src/content/docs → native docsLoader (Vite MDX resolution). */
function useDocsLoader() {
	const normalized = path.normalize(vaultPath);
	const linked = path.normalize(LINKED_DOCS);
	if (normalized === linked) return true;
	try {
		if (fs.lstatSync(linked).isSymbolicLink()) {
			return fs.realpathSync(linked) === fs.realpathSync(vaultPath);
		}
	} catch {
		/* not a link */
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
