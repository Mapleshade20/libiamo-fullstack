<script lang="ts">
import { account } from "#lib/account/account.svelte.ts";

/* What a visitor sees at the site's address. A placeholder until the real page is designed (design §11). */
</script>

<svelte:head><title>Libiamo · Write for real readers</title></svelte:head>

<div class="hero">
	<h1>Write for real readers.</h1>
	<p class="lede">
		Paste a post, a comment or an email you wrote in the language you are learning, and go over it with a tutor until it says what you meant. Keep the
		phrases you meet while reading, and see them again in review.
	</p>
	<div class="acts">
		{#if account.signedIn}
			<a class="btn main" href="/">Open Libiamo</a>
		{:else}
			<a class="btn main" href="/sign-up">Get started</a>
			<a class="btn" href="/sign-in">Sign in</a>
		{/if}
	</div>
	<p class="note">Libiamo runs on your own AI key; we recommend Claude Haiku through OpenRouter.</p>
</div>

<style>
.hero {
	padding-top: clamp(24px, 10vh, 120px);
}
.hero h1 {
	font-size: clamp(40px, 7vw, 64px);
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
	font-weight: 500;
	text-decoration: none;
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
.note {
	margin-top: 22px !important;
	color: var(--muted) !important;
	font-size: 14px;
}
</style>
