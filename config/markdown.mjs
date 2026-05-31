// @ts-check
import { unified } from '@astrojs/markdown-remark';
import remarkWikiLink from 'remark-wiki-link';
import rehypeExternalLinks from 'rehype-external-links';

/** Markdown processor configuration (wiki links, external links). */
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
