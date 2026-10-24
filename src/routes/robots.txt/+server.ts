import { base } from "$app/paths";
import { CRAWL_DISALLOWED_PATHS } from "$lib/app/seo";
import { siteOrigin } from "$lib/server/app/site-origin";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url }) => {
	const sitemap = new URL(`${base}/sitemap.xml`, siteOrigin(url)).href;
	const rules = CRAWL_DISALLOWED_PATHS.map((path) => `Disallow: ${base}${path}`).join("\n");
	return new Response(`User-agent: *\n${rules}\n\nSitemap: ${sitemap}\n`, {
		headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
	});
};
