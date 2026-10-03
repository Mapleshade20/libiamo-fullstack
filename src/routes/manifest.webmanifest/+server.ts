import { json } from "@sveltejs/kit";
import { base } from "$app/paths";

export const prerender = true;

export function GET() {
	return json(
		{
			id: `${base}/`,
			name: "Libiamo",
			short_name: "Libiamo",
			description: "Practice real-world language skills through conversation and translation.",
			start_url: `${base}/`,
			scope: `${base}/`,
			display: "standalone",
			background_color: "#f7f0e6",
			theme_color: "#f7f0e6",
			icons: [
				{ src: `${base}/brand/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
				{ src: `${base}/brand/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
				{ src: `${base}/brand/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
			],
		},
		{ headers: { "Content-Type": "application/manifest+json" } },
	);
}
