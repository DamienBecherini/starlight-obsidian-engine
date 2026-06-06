// @ts-check
import { unified } from '@astrojs/markdown-remark';
import remarkWikiLink from 'remark-wiki-link';
import remarkMath from 'remark-math';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import { remarkObsidianCallouts } from './remark/obsidian-callouts.mjs';

/** Markdown processor configuration (wiki links, external links, math equations). */
export const markdown = {
    processor: unified({
        remarkPlugins: [
            remarkMath,
            remarkObsidianCallouts,
            [
                remarkWikiLink,
                {
                    aliasDivider: '|',
                    hrefTemplate: (permalink) => {
                        const clean = permalink.replace(/\/index$/i, '');
                        return `/${clean}/`;
                    },
                    pageResolver: (name) => [name.trim().replace(/ /g, '-').toLowerCase()],
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
        ],
    }),
};
