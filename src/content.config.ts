import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, resolveVaultPath, resolveVaultGitRoot } from '../config/vault.mjs';
import { vaultAwareDocsLoader } from '../config/loaders/vault-docs.mjs';

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');
const vaultPath = resolveVaultPath();
const vaultRoot = resolveVaultGitRoot();

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

const innerDocsLoader = useDocsLoader()
	? docsLoader()
	: glob({
			base: vaultBase,
			pattern: '**/[^_]*.{md,mdx}',
		});

export const collections = {
	docs: defineCollection({
		loader: vaultAwareDocsLoader({
			inner: innerDocsLoader,
			vaultRoot,
			engineRoot: projectRoot,
		}),
		schema: docsSchema(),
	}),
};
