<script lang="ts">
import { onMount, setContext } from "svelte";
import { onNavigate } from "$app/navigation";
import { page } from "$app/state";
import "./layout.css";
import "$lib/components/interaction-motion.css";
import favicon from "$lib/assets/favicon.svg";
import { syncBrowserTimeZone } from "$lib/client/browser-timezone";
import { installFormFeedback } from "$lib/client/form-attention";
import { resolvePageTransition } from "$lib/client/page-transition";
import { DISPLAY_CLOCK_CONTEXT } from "$lib/display-clock";
import { resolvePageDocumentLanguage } from "$lib/document-language";

let { children, data } = $props();
setContext(DISPLAY_CLOCK_CONTEXT, () => data.displayClock);
let transitionSequence = 0;
let documentLanguage = $derived(
	resolvePageDocumentLanguage({
		routeId: page.error === null ? page.route.id : null,
		learnerDocumentLanguage: data.learnerDocumentLanguage,
	}),
);

$effect(() => {
	document.documentElement.lang = documentLanguage;
});

onMount(() => {
	void syncBrowserTimeZone();
	return installFormFeedback(document);
});

onNavigate((navigation) => {
	const transitionKind = navigation.to?.url ? resolvePageTransition(navigation.from?.url ?? null, navigation.to.url) : "none";
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
</svelte:head>
{@render children()}
