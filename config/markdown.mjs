// @ts-check
import { unified } from '@astrojs/markdown-remark';
import remarkWikiLink from 'remark-wiki-link';
import remarkMath from 'remark-math';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import { remarkObsidianCallouts } from './remark/obsidian-callouts.mjs';
import { rehypeLexiconTooltips } from './rehype/lexicon-tooltips.mjs';
import { rehypeLocalizedLinks } from './rehype/localized-links.mjs';
import { isLexiconEnabled, loadLexiconConfig } from './lexicon.mjs';
import { loadSiteConfig } from './site.mjs';
import { projectRoot, resolveVaultGitRoot } from './vault.mjs';

const vaultRoot = resolveVaultGitRoot();
const lexicon = loadLexiconConfig(vaultRoot);
const siteLocales = loadSiteConfig().locales ?? {};
const localeKeys = Object.keys(siteLocales).filter((key) => key !== 'root');

/**
 * Links of pages under a non-default locale folder point to the localized pages when they exist
 * (runs before the lexicon tooltips, which match both URL forms).
 * @type {[any, any]}
 */
const localizedLinksPlugin = [
    rehypeLocalizedLinks,
    { vaultRoot, engineRoot: projectRoot, localeKeys, defaultLang: siteLocales.root?.lang ?? '' },
];

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
                      localeKeys,
                  },
              ],
          ]
        : [];

/** Markdown processor configuration (wiki links, external links, math equations, localized links, lexicon tooltips). */
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
            localizedLinksPlugin,
            ...lexiconTooltipPlugins,
        ],
    }),
};
