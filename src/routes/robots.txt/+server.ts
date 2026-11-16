import { SIGNED_IN_PATHS } from "#lib/seo.ts";
import { ORIGIN } from "$app/env/private";

export function GET() {
	const rules = SIGNED_IN_PATHS.map((p) => `Disallow: ${p}`).join("\n");
	return new Response(`User-agent: *\n${rules}\n\nSitemap: ${new URL("/sitemap.xml", ORIGIN).href}\n`, {
		headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
	});
}
