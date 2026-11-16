<script lang="ts">
import "./layout.css";
import "#lib/components/stickers/stickers.css";
import "#lib/components/shell/sheet.css";
import { onMount, type Snippet, setContext } from "svelte";
import { followSystem } from "#lib/account/look.svelte.ts";
import Toast from "#lib/components/shell/Toast.svelte";
import Tour from "#lib/components/tour/Tour.svelte";
import { metaOf } from "#lib/seo.ts";
import { DISPLAY_CLOCK_CONTEXT, type DisplayClock } from "#lib/time/display-clock.ts";
import { onNavigate } from "$app/navigation";
import { page } from "$app/state";

let { children, data }: { children: Snippet; data: { clock: DisplayClock; origin: string } } = $props();
onMount(followSystem);
// The places' dates and times (lib/time/display-clock.ts): in the learner's time zone, the same on both sides.
setContext(DISPLAY_CLOCK_CONTEXT, () => data.clock);
// The head: only the public pages are indexed (lib/seo.ts); a page may name itself after this (the admin's do).
const meta = $derived(metaOf(data.origin, page.error ? null : page.route.id));

/*
 * Every navigation is a view transition (the root owns them, as in the main app). Pages name the parts that carry
 * over only for the trip they belong to: <html data-vt="from>to"> holds the trip while it runs, so a page can say
 * `html[data-vt="/>/live"] .composer { view-transition-name: card }` and nothing lingers on any other trip.
 */
// Whether a page has the sidebar is its route group's: <html data-side="out|in"> marks a trip that leaves it or comes
// back to it, so the bar slides away and back on every such trip (a focused page added later included).
const focused = (id: string | null | undefined) => !!id?.startsWith("/(focus)");
/** A trip is named by its pages, not by which piece: /live/<piece> is "/live", /collect/<reading> is "/collect". */
const trip = (path = "") => path.replace(/^\/(live|collect)\/[^/]+$/, "/$1");
onNavigate((nav) => {
	if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	if (nav.from?.url?.pathname === nav.to?.url?.pathname) return;
	const html = document.documentElement;
	html.dataset.vt = `${trip(nav.from?.url?.pathname)}>${trip(nav.to?.url?.pathname)}`;
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

<svelte:head>
	<title>{meta.title}</title>
	<meta name="robots" content={meta.robots}>
	{#if meta.canonical && meta.description}
		<link rel="canonical" href={meta.canonical}>
		<meta name="description" content={meta.description}>
		<meta property="og:url" content={meta.canonical}>
		<meta property="og:description" content={meta.description}>
	{/if}
	<meta property="og:site_name" content="Libiamo">
	<meta property="og:title" content={meta.title}>
	<meta property="og:type" content="website">
	<meta property="og:image" content={meta.image}>
	<meta property="og:image:width" content="512">
	<meta property="og:image:height" content="512">
	<meta property="og:image:alt" content="Libiamo">
	<meta name="twitter:card" content="summary">
	<meta name="application-name" content="Libiamo">
	<meta name="apple-mobile-web-app-title" content="Libiamo">
	<link rel="icon" href="/brand/libiamo-icon.svg" type="image/svg+xml" sizes="any">
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
	<link rel="manifest" href="/manifest.webmanifest">
</svelte:head>

{@render children()}
<Toast />
<Tour />
