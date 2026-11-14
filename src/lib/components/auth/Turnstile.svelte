<script lang="ts">
import { onMount } from "svelte";
import { captcha } from "#lib/auth/captcha.svelte.ts";

/* Cloudflare Turnstile, "interaction-only": nothing shows unless Cloudflare asks for a click. Without a site key, nothing. */
type Api = {
	render: (el: HTMLElement, o: Record<string, unknown>) => string;
	reset: (id: string) => void;
	remove: (id: string) => void;
};
let box: HTMLDivElement | undefined = $state();
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

onMount(() => {
	const siteKey = captcha.siteKey;
	if (!siteKey || !box) return;
	let id: string | null = null;
	load()
		.then(() => {
			const t = api();
			if (!t || !box) return;
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
		if (id) api()?.remove(id);
		captcha.reset = null;
	};
});
</script>

<div class="turnstile" bind:this={box}></div>

<style>
.turnstile:empty {
	display: none;
}
.turnstile {
	margin-top: 16px;
}
</style>
