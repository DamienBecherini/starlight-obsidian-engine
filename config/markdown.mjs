// @ts-check
import { unified } from '@astrojs/markdown-remark';
import remarkWikiLink from 'remark-wiki-link';
import remarkMath from 'remark-math';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import { remarkObsidianCallouts } from './remark/obsidian-callouts.mjs';
import { rehypeLexiconTooltips } from './rehype/lexicon-tooltips.mjs';
import { isLexiconEnabled, loadLexiconConfig } from './lexicon.mjs';
import { loadSiteConfig } from './site.mjs';
import { projectRoot, resolveVaultGitRoot } from './vault.mjs';

const vaultRoot = resolveVaultGitRoot();
const lexicon = loadLexiconConfig(vaultRoot);

/**
 * Lexicon tooltips (`lexicon.tooltips`, on by default when the lexicon is enabled).
 * @type {Array<[any, any]>}
 */
const lexiconTooltipPlugins =
    isLexiconEnabled(lexicon) && lexicon.tooltips
        ? [
              [
                  rehypeLexiconTooltips,
                  {
                      config: lexicon,
                      vaultRoot,
                      engineRoot: projectRoot,
                      localeKeys: Object.keys(loadSiteConfig().locales ?? {}).filter((key) => key !== 'root'),
                  },
              ],
          ]
        : [];

/** Markdown processor configuration (wiki links, external links, math equations, lexicon tooltips). */
export const markdown = {
    processor: unified({
        remarkPlugins: [
            remarkMath,
            remarkObsidianCallouts,
            [
                remarkWikiLink,
                {
                    aliasDivider: '|',
                    hrefTemplate: (/** @type {string} */ permalink) => {
                        const clean = permalink.replace(/\/index$/i, '');
                        return `/${clean}/`;
                    },
                    pageResolver: (/** @type {string} */ name) => [name.trim().replace(/ /g, '-').toLowerCase()],
                },
            ],
        ],
        rehypePlugins: [
            [rehypeKatex, { throwOnError: false, strict: false }],
            [
                rehypeExternalLinks,
                {
                    target: '_blank',
                    rel: ['noopener', 'noreferrer'],
                    content: {
                        type: 'element',
                        tagName: 'span',
                        properties: {
                            className: ['external-link-icon'],
                            ariaHidden: 'true',
                        },
                        children: [],
                    },
                },
            ],
            ...lexiconTooltipPlugins,
        ],
    }),
};
