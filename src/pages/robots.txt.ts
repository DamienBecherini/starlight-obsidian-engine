// robots.txt, prerendered at build time. Points to the sitemap when site.config.json sets `url`.
import type { APIRoute } from 'astro';
import { buildRobotsTxt } from '../../config/seo.mjs';
import { loadSiteConfig } from '../../config/site.mjs';

export const prerender = true;

export const GET: APIRoute = () =>
	new Response(buildRobotsTxt(loadSiteConfig().url), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
