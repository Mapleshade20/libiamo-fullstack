<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import { base } from "$app/paths";
import { page } from "$app/state";
import WineGlassIcon from "$lib/components/WineGlassIcon.svelte";

function errorCopy(status: number) {
	if (status === 404) {
		return {
			label: "Page not found",
			title: "This page has left the table.",
			message: "The address may have changed, or the page may never have existed.",
		};
	}
	if (status === 403) {
		return {
			label: "Access restricted",
			title: "This room isn’t open to this account.",
			message: "Return to a place you can access, or sign in with a different account.",
		};
	}
	if (status === 501) {
		return {
			label: "Not available",
			title: "This part of Libiamo isn’t ready yet.",
			message: "The rest of your learning space is still available.",
		};
	}
	if (status >= 500) {
		return {
			label: "Service error",
			title: "Something went wrong on our side.",
			message: "Your work may still be intact. Try this page once more, or return to a familiar place.",
		};
	}
	return {
		label: "Request not completed",
		title: "We couldn’t open this page.",
		message: "Check the address or return to a familiar place and try again.",
	};
}

let copy = $derived(errorCopy(page.status));
let signedIn = $derived(Boolean(page.data.viewer));
let primaryHref = $derived(signedIn ? `${base}/` : `${base}/welcome`);
let primaryLabel = $derived(signedIn ? "Return to Quest Hall" : "Go to the homepage");
</script>

<svelte:head>
	<title>{page.status} · {copy.label} · Libiamo</title>
	<meta name="robots" content="noindex, nofollow">
</svelte:head>

<div class="error-shell">
	<header class="error-header">
		<a href={`${base}/welcome`} aria-label="Libiamo homepage">
			<WineGlassIcon width={32} height={32} />
			<span>Libiamo</span>
		</a>
		<span>{copy.label}</span>
	</header>

	<main class="error-main" aria-labelledby="error-title">
		<section class="error-sheet">
			<p class="error-number" aria-hidden="true">{page.status}</p>
			<div class="error-copy" role="alert">
				<p class="error-kicker">Libiamo · {page.status}</p>
				<h1 id="error-title">{copy.title}</h1>
				<p class="error-message">{copy.message}</p>
				<div class="error-actions">
					<a class="error-primary" href={primaryHref}>{primaryLabel}<ArrowRight size={17} aria-hidden="true" /></a>
					{#if page.status >= 500}
						<button class="error-retry" type="button" onclick={() => location.reload()}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
					{:else}
						<a class="error-secondary" href={signedIn ? `${base}/welcome` : `${base}/sign-in`}> {signedIn ? "Visit the homepage" : "Sign in"} </a>
					{/if}
				</div>
			</div>
		</section>
	</main>
</div>

<style>
.error-shell {
	--error-paper: #f7f1e6;
	--error-sheet: #fffaf1;
	--error-ink: #2d2924;
	--error-muted: #6d665d;
	--error-wine: #803945;
	--error-olive: #65705a;
	min-height: 100svh;
	background:
		radial-gradient(circle at 14% 12%, rgb(255 250 241 / 94%), transparent 27rem),
		radial-gradient(circle at 87% 75%, rgb(179 145 80 / 11%), transparent 30rem), var(--error-paper);
	color: var(--error-ink);
}

.error-header {
	display: flex;
	width: min(100% - 2rem, 72rem);
	min-height: 4.75rem;
	margin-inline: auto;
	align-items: center;
	justify-content: space-between;
	border-bottom: 1px solid rgb(45 41 36 / 14%);
}

.error-header a {
	display: inline-flex;
	min-height: 44px;
	align-items: center;
	gap: 0.55rem;
	color: inherit;
	font-family: var(--font-serif);
	font-size: 1.2rem;
	text-decoration: none;
}

.error-header > span {
	color: var(--error-muted);
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.1em;
	text-transform: uppercase;
}

.error-main {
	display: grid;
	width: min(100% - 2rem, 72rem);
	min-height: calc(100svh - 4.75rem);
	margin-inline: auto;
	place-items: center;
	padding-block: 3rem;
}

.error-sheet {
	position: relative;
	display: grid;
	width: min(100%, 54rem);
	grid-template-columns: minmax(10rem, 0.72fr) minmax(0, 1.55fr);
	align-items: center;
	border: 1px solid rgb(45 41 36 / 15%);
	background: var(--error-sheet);
	box-shadow: 0 30px 70px rgb(45 41 36 / 13%);
}

.error-sheet::before {
	position: absolute;
	z-index: -1;
	inset: 0;
	border: 1px solid rgb(45 41 36 / 10%);
	background: rgb(255 250 241 / 65%);
	content: "";
	transform: translate(0.65rem, 0.65rem) rotate(0.7deg);
}

.error-number {
	margin: 0;
	color: var(--error-wine);
	font-family: var(--font-serif);
	font-size: clamp(5rem, 11vw, 8rem);
	font-variant-numeric: lining-nums;
	font-weight: 400;
	letter-spacing: -0.08em;
	line-height: 1;
	text-align: center;
}

.error-copy {
	margin-block: 2.75rem;
	padding: 0.4rem clamp(2rem, 5vw, 4.5rem);
	border-left: 1px solid rgb(45 41 36 / 16%);
}

.error-kicker {
	margin: 0 0 0.8rem;
	color: var(--error-wine);
	font-size: 0.68rem;
	font-weight: 750;
	letter-spacing: 0.11em;
	text-transform: uppercase;
}

.error-copy h1 {
	max-width: 13ch;
	margin: 0;
	font-family: var(--font-serif);
	font-size: clamp(2.35rem, 5vw, 4.1rem);
	font-weight: 430;
	letter-spacing: -0.035em;
	line-height: 1.02;
	text-wrap: balance;
}

.error-message {
	max-width: 36rem;
	margin: 1.35rem 0 0;
	color: var(--error-muted);
	font-size: 0.98rem;
	line-height: 1.65;
}

.error-actions {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin-top: 2rem;
}

.error-primary,
.error-secondary,
.error-retry {
	display: inline-flex;
	min-height: 44px;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.7rem 1rem;
	font: inherit;
	font-size: 0.78rem;
	font-weight: 700;
	text-decoration: none;
	transition:
		background-color 220ms ease,
		color 220ms ease,
		transform 220ms ease;
}

.error-primary {
	border: 1px solid var(--error-wine);
	background: var(--error-wine);
	color: var(--error-sheet);
}

.error-secondary,
.error-retry {
	border: 1px solid rgb(45 41 36 / 24%);
	background: transparent;
	color: var(--error-ink);
	cursor: pointer;
}

.error-primary:hover,
.error-secondary:hover,
.error-retry:hover {
	transform: translateY(-2px);
}

.error-secondary:hover,
.error-retry:hover {
	background: rgb(101 112 90 / 10%);
}

.error-header a:focus-visible,
.error-primary:focus-visible,
.error-secondary:focus-visible,
.error-retry:focus-visible {
	outline: 2px solid #305f89;
	outline-offset: 3px;
}

@media (max-width: 42rem) {
	.error-main {
		place-items: start center;
		padding-block: 2.5rem 3.5rem;
	}

	.error-sheet {
		grid-template-columns: 1fr;
	}

	.error-number {
		padding: 2rem 1.5rem 1.4rem;
		font-size: 4.6rem;
		text-align: left;
	}

	.error-copy {
		margin: 0;
		padding: 2rem 1.5rem 2.5rem;
		border-top: 1px solid rgb(45 41 36 / 16%);
		border-left: 0;
	}

	.error-copy h1 {
		font-size: clamp(2.3rem, 12vw, 3.25rem);
	}

	.error-actions {
		align-items: stretch;
		flex-direction: column;
	}
}

@media (prefers-reduced-motion: reduce) {
	.error-primary,
	.error-secondary,
	.error-retry {
		transition: none;
	}

	.error-primary:hover,
	.error-secondary:hover,
	.error-retry:hover {
		transform: none;
	}
}
</style>
