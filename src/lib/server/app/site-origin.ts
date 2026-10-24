import { env } from "$env/dynamic/private";

export function siteOrigin(url: URL): string {
	return new URL(env.ORIGIN || url.origin).origin;
}
