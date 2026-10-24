import { base } from "$app/paths";
import { PUBLIC_SEARCH_PAGES } from "$lib/app/seo";
import { siteOrigin } from "$lib/server/app/site-origin";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url }) => {
	const origin = siteOrigin(url);
	const entries = PUBLIC_SEARCH_PAGES.map(({ path }) => {
		const location = new URL(`${base}${path}`, origin).href.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
		return `<url><loc>${location}</loc></url>`;
	}).join("");
	return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, {
		headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
	});
};
