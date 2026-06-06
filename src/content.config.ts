import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';
import path from 'node:path';
import { projectRoot, resolveVaultPath, resolveVaultGitRoot, isDocsLinkedToVault } from '../config/vault.mjs';
import { vaultAwareDocsLoader } from '../config/loaders/vault-docs.mjs';
import { compositeLoader } from '../config/loaders/composite.mjs';
import { hasStagedSplashMdx } from '../config/stage-splash-mdx.mjs';

const vaultPath = resolveVaultPath();
const vaultRoot = resolveVaultGitRoot();

const vaultBase = path.relative(projectRoot, vaultPath).split(path.sep).join('/');

/**
 * Junction → full docsLoader (MDX + MD via Starlight).
 * Staged splash → compositeLoader (docsLoader for MDX + glob for vault MD).
 * No junction, no staged → glob only (no MDX splash).
 */
const innerDocsLoader = isDocsLinkedToVault(vaultPath)
	? docsLoader()
	: hasStagedSplashMdx()
		? compositeLoader(
				docsLoader(),
				glob({
					base: vaultBase,
					pattern: '**/[^_]*.md',
				}),
			)
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
