<script lang="ts">
import { onNavigate } from "$app/navigation";
import "./layout.css";
import favicon from "$lib/assets/favicon.svg";

let { children } = $props();

onNavigate((navigation) => {
	if (!document.startViewTransition) return;
	return new Promise((resolve) => {
		document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});
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
