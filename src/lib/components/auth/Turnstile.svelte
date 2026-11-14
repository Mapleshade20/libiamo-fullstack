<script lang="ts">
import { captcha } from "#lib/auth/captcha.svelte.ts";

/* Cloudflare Turnstile, "interaction-only": nothing shows unless Cloudflare asks for a click. Without a site key, nothing. */
type Api = {
	render: (el: HTMLElement, o: Record<string, unknown>) => string;
	reset: (id: string) => void;
	remove: (id: string) => void;
};
const api = () => (window as unknown as { turnstile?: Api }).turnstile;

function load(): Promise<void> {
	if (api()) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const s = document.createElement("script");
		s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		s.async = true;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error("turnstile did not load"));
		document.head.append(s);
	});
}

/* Rendered from the box itself once it is in the page, and again whenever the site key changes: the key comes with the
   auth layout's setup, which may arrive before or after the box. */
function widget(box: HTMLElement) {
	const siteKey = captcha.siteKey;
	if (!siteKey) return;
	let id: string | null = null;
	let gone = false;
	load()
		.then(() => {
			const t = api();
			if (!t || gone) return;
			id = t.render(box, {
				sitekey: siteKey,
				appearance: "interaction-only",
				callback: (token: string) => (captcha.token = token),
				"expired-callback": () => (captcha.token = null),
			});
			captcha.reset = () => id && t.reset(id);
		})
		.catch(() => {});
	return () => {
		gone = true;
		if (id) api()?.remove(id);
		captcha.reset = null;
	};
}
</script>

<div class="turnstile" {@attach widget}></div>

<style>
.turnstile:empty {
	display: none;
}
.turnstile {
	margin-top: 16px;
}
</style>
