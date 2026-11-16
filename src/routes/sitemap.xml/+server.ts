import { PUBLIC_PAGES } from "#lib/seo.ts";
import { ORIGIN } from "$app/env/private";

export function GET() {
	const urls = PUBLIC_PAGES.map((p) => `<url><loc>${new URL(p.path, ORIGIN).href.replaceAll("&", "&amp;")}</loc></url>`).join("");
	return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`, {
		headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
	});
}
