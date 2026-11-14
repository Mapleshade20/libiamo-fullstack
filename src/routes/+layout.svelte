<script lang="ts">
import "./layout.css";
import "#lib/components/stickers/stickers.css";
import "#lib/components/debug/calls.css";
import "#lib/components/shell/sheet.css";
import type { Snippet } from "svelte";
import Toast from "#lib/components/shell/Toast.svelte";
import Tour from "#lib/components/tour/Tour.svelte";
import { onNavigate } from "$app/navigation";

let { children }: { children: Snippet } = $props();

/*
 * Every navigation is a view transition (the root owns them, as in the main app). Pages name the parts that carry
 * over only for the trip they belong to: <html data-vt="from>to"> holds the trip while it runs, so a page can say
 * `html[data-vt="/>/live"] .composer { view-transition-name: card }` and nothing lingers on any other trip.
 */
// Whether a page has the sidebar is its route group's: <html data-side="out|in"> marks a trip that leaves it or comes
// back to it, so the bar slides away and back on every such trip (a focused page added later included).
const focused = (id: string | null | undefined) => !!id?.startsWith("/(focus)");
/** A trip is named by its pages, not by which piece: /live/<piece> is "/live". */
const trip = (path = "") => path.replace(/^\/live\/[^/]+$/, "/live");
onNavigate((nav) => {
	if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	if (nav.from?.url.pathname === nav.to?.url.pathname) return;
	const html = document.documentElement;
	html.dataset.vt = `${trip(nav.from?.url.pathname)}>${trip(nav.to?.url.pathname)}`;
	const [a, b] = [focused(nav.from?.route.id), focused(nav.to?.route.id)];
	if (a !== b) html.dataset.side = b ? "out" : "in";
	return new Promise((resolve) => {
		const vt = document.startViewTransition(async () => {
			resolve();
			await nav.complete;
		});
		vt.finished.finally(() => {
			delete html.dataset.vt;
			delete html.dataset.side;
		});
	});
});
</script>

{@render children()}
<Toast />
<Tour />
