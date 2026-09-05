<script lang="ts">
import { onMount } from "svelte";
import { onNavigate } from "$app/navigation";
import "./layout.css";
import favicon from "$lib/assets/favicon.svg";
import { syncBrowserTimeZone } from "$lib/client/browser-timezone";
import { resolvePageTransition } from "$lib/client/page-transition";

let { children } = $props();
let transitionSequence = 0;

onMount(() => {
	void syncBrowserTimeZone();
});

onNavigate((navigation) => {
	const transitionKind = navigation.to?.url ? resolvePageTransition(navigation.from?.url ?? null, navigation.to.url) : "fade";
	if (transitionKind === "none") return;
	if (!document.startViewTransition) return;

	const sequence = ++transitionSequence;
	document.documentElement.dataset.pageTransition = transitionKind;

	return new Promise((resolve) => {
		const transition = document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});

		const clearTransitionKind = () => {
			if (sequence !== transitionSequence) return;
			delete document.documentElement.dataset.pageTransition;
		};
		void transition.finished.then(clearTransitionKind, clearTransitionKind);
	});
});
</script>

<svelte:head>
	<title>Libiamo</title>
	<meta name="description" content="Practice real-world language skills through simulated conversations, translation, feedback, and spaced review.">
	<meta name="application-name" content="Libiamo">
	<meta name="theme-color" content="#f7f0e6">
	<meta property="og:site_name" content="Libiamo">
	<meta property="og:title" content="Libiamo">
	<meta
		property="og:description"
		content="Practice real-world language skills through simulated conversations, translation, feedback, and spaced review."
	>
	<meta property="og:type" content="website">
	<meta name="twitter:card" content="summary">
	<link rel="icon" href={favicon}>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
	<link
		href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Noto+Serif+JP:wght@400;500;600&display=swap"
		rel="stylesheet"
	>
</svelte:head>
{@render children()}
