<script lang="ts" module>
type TurnstileApi = {
	render: (container: HTMLElement, options: Record<string, unknown>) => string;
	reset: (widgetId: string) => void;
	remove: (widgetId: string) => void;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	scriptLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = SCRIPT_URL;
		script.async = true;
		script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
		script.onerror = () => {
			scriptLoad = null;
			reject(new Error("Turnstile did not load"));
		};
		document.head.append(script);
	});
	return scriptLoad;
}
</script>

<script lang="ts">
import { untrack } from "svelte";

/**
 * Cloudflare Turnstile inside a form. The widget adds a hidden `cf-turnstile-response` input to
 * its container, so the token posts with the form like any other field. A token is single-use:
 * change `resetKey` (pass the action result) to fetch a fresh one after each submission.
 */
let { siteKey, resetKey }: { siteKey: string; resetKey?: unknown } = $props();

let container: HTMLDivElement | null = $state(null);
let widgetId: string | null = null;
let failed = $state(false);

$effect(() => {
	const target = container;
	if (!target) return;
	let cancelled = false;
	loadTurnstile()
		.then((turnstile) => {
			if (cancelled) return;
			widgetId = turnstile.render(target, { sitekey: siteKey, theme: "light", size: "flexible" });
		})
		.catch(() => {
			if (!cancelled) failed = true;
		});
	return () => {
		cancelled = true;
		if (widgetId) window.turnstile?.remove(widgetId);
		widgetId = null;
	};
});

let lastResetKey: unknown = untrack(() => resetKey);
$effect(() => {
	const key = resetKey;
	if (key === lastResetKey) return;
	lastResetKey = key;
	if (widgetId) window.turnstile?.reset(widgetId);
});
</script>

<!-- Holds the widget's height before it renders so the form below does not jump. -->
<div class="min-h-[65px]" bind:this={container}></div>
{#if failed}
	<p class="text-sm text-destructive" role="alert">
		The human check could not load. Check your connection or disable content blockers, then reload the page.
	</p>
{/if}
