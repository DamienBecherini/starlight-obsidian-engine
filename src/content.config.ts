import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, resolveVaultPath, resolveVaultGitRoot } from '../config/vault.mjs';
import { vaultAwareDocsLoader } from '../config/loaders/vault-docs.mjs';
import { compositeLoader } from '../config/loaders/composite.mjs';
import { hasStagedSplashMdx } from '../config/stage-splash-mdx.mjs';

const LINKED_DOCS = path.join(projectRoot, 'src/content/docs');
const vaultPath = resolveVaultPath();
const vaultRoot = resolveVaultGitRoot();

/** Junction under src/content/docs → active vault enables Starlight MDX splash pages. */
function useDocsLoader() {
	const normalized = path.normalize(vaultPath);
	const linked = path.normalize(LINKED_DOCS);
	if (normalized === linked) return true;
	try {
		if (fs.existsSync(linked)) {
			return fs.realpathSync(linked) === fs.realpathSync(vaultPath);
		}
	} catch {
		/* fall through */
	}
	return false;
}

const vaultBase = path.relative(projectRoot, vaultPath).split(path.sep).join('/');

/** Staged splash MDX in src/content/docs + markdown glob from vault (no junction). */
const innerDocsLoader = hasStagedSplashMdx()
	? compositeLoader(
			docsLoader(),
			glob({
				base: vaultBase,
				pattern: '**/[^_]*.md',
			}),
		)
	: useDocsLoader()
		? docsLoader()
		: glob({
				base: vaultBase,
				pattern: '**/[^_]*.{md,mdx}',
			});

const editorialSchema = z.object({
	last_modified: z.string().optional(),
	last_verified: z.string().optional(),
	verified_by: z.string().optional(),
	verified_hitl: z.string().optional(),
	verified_hitl_url: z.string().url().optional(),
	prices_valid_as_of: z.string().optional(),
});

export const collections = {
	docs: defineCollection({
		loader: vaultAwareDocsLoader({
			inner: innerDocsLoader,
			vaultRoot,
			engineRoot: projectRoot,
		}),
		schema: docsSchema({ extend: editorialSchema }),
	}),
};
