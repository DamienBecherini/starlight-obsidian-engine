// @ts-check
import { unified } from '@astrojs/markdown-remark';
import remarkWikiLink from 'remark-wiki-link';
import rehypeExternalLinks from 'rehype-external-links';

/** Configuration du processeur Markdown (wiki links, liens externes). */
export const markdown = {
    processor: unified({
        remarkPlugins: [
            [
                remarkWikiLink,
                {
                    aliasDivider: '|',
                    hrefTemplate: (permalink) => `/${permalink}/`,
                    pageResolver: (name) => [name.trim().replace(/ /g, '-').toLowerCase()],
                },
            ],
        ],
        rehypePlugins: [[rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]],
    }),
};
