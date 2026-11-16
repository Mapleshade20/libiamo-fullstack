<script lang="ts">
import { account } from "#lib/account/account.svelte.ts";
import { page } from "$app/state";

/*
 * A page that could not be shown: an address that leads nowhere, a page this account may not open, or a failure on the
 * server. In English, like the documents (routes/(public)); src/error.html is for when even this cannot render.
 */
const copy = $derived(
	page.status === 404
		? { title: "This page isn’t here.", line: "The address may have changed, or the page never existed." }
		: page.status === 403
			? { title: "This page isn’t open to this account.", line: "Go back to a page you can open, or sign in with another account." }
			: page.status >= 500
				? { title: "Something went wrong on our side.", line: "What you wrote is kept. Try the page again in a moment." }
				: { title: "This page couldn’t be opened.", line: "Check the address, or go back and try again." },
);
</script>

<svelte:head><title>{page.status} · Libiamo</title></svelte:head>

<main class="err" lang="en">
	<p class="code">{page.status}</p>
	<h1>{copy.title}</h1>
	<p class="line">{copy.line}</p>
	<div class="acts">
		{#if page.status >= 500}
			<button class="btn" type="button" onclick={() => location.reload()}>Try again</button>
		{/if}
		<a class="btn main" href={account.signedIn ? "/" : "/about"}>{account.signedIn ? "Back to Libiamo" : "Go to Libiamo"}</a>
	</div>
</main>

<style>
.err {
	min-height: 100dvh;
	display: flex;
	flex-direction: column;
	justify-content: center;
	width: min(560px, 100% - 40px);
	margin: 0 auto;
	padding: 48px 0;
	color: var(--ink);
}
.code {
	margin: 0;
	color: var(--muted);
	font: 500 14px var(--font-sans-stack);
	letter-spacing: 0.08em;
}
h1 {
	margin: 8px 0 0;
	font: 400 clamp(30px, 5vw, 40px) / 1.15 var(--font-serif-stack);
	letter-spacing: -0.01em;
}
.line {
	margin: 12px 0 0;
	color: var(--muted);
	line-height: 1.6;
}
.acts {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 28px;
}
.btn {
	display: inline-flex;
	align-items: center;
	min-height: 44px;
	padding: 0 20px;
	border: 1px solid var(--edge);
	border-radius: 6px;
	background: var(--raised-face);
	box-shadow: var(--raised-shadow);
	color: var(--ink);
	font: inherit;
	font-weight: 500;
	text-decoration: none;
	cursor: pointer;
}
.btn.main {
	border-color: var(--key-edge);
	background: var(--key-face);
	box-shadow: var(--key-light);
	color: var(--key-ink);
}
.btn:hover {
	filter: brightness(1.05);
}
</style>
