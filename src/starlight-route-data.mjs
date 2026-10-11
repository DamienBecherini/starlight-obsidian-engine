// @ts-check
/**
 * Starlight route middleware (`routeMiddleware` in config/starlight/index.mjs).
 * Strips the leading emoji from `<title>` / `og:title` / `twitter:title` so search results keep
 * their width for words. The page H1 and the sidebar label are untouched.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { stripEmojiFromHeadTitles } from '../config/seo.mjs';

export const onRequest = defineRouteMiddleware((context) => {
    stripEmojiFromHeadTitles(context.locals.starlightRoute.head);
});
