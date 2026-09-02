<script lang="ts">
import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
import { base } from "$app/paths";

const demo = {
	href: `${base}/quest-hall-layout-demo/bureau-spread`,
	index: "01",
	title: "Livre de bureau",
	description: "Une ouverture à deux pages, puis la préparation partagée à côté du livre.",
} as const;
</script>

<svelte:head>
	<title>Laboratoire CARTE · Libiamo</title>
	<meta name="description" content="Prototype animé pour choisir la prochaine mission de langue.">
</svelte:head>

<div class="carte-demo-theme demo-index">
	<header>
		<p>PROTOTYPE RETENU</p>
		<h1>Ouvrir la CARTE</h1>
		<span>Le livre de bureau utilise les missions et les états du Quest Hall.</span>
	</header>

	<ol>
		<li>
			<a href={demo.href}>
				<span class="number">{demo.index}</span>
				<span class="copy">
					<strong>{demo.title}</strong>
					<span>{demo.description}</span>
				</span>
				<ArrowUpRight size={20} strokeWidth={1.5} aria-hidden="true" />
			</a>
		</li>
	</ol>
</div>

<style>
.demo-index {
	min-height: calc(100vh - 8rem);
	padding: clamp(1.25rem, 4vw, 3rem);
	border: 1px solid color-mix(in oklab, var(--carte-ink) 14%, transparent);
}

header {
	max-width: 48rem;
	border-top: 3px double color-mix(in oklab, var(--carte-ink) 48%, transparent);
	border-bottom: 1px solid color-mix(in oklab, var(--carte-ink) 18%, transparent);
	padding-block: 2rem;
}

header p,
header span {
	font-family: var(--font-sans);
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.11em;
	text-transform: uppercase;
	color: var(--carte-ink-muted);
}

h1 {
	margin-block: 0.65rem 0.8rem;
	font-family: var(--font-serif);
	font-size: clamp(2.3rem, 7vw, 4.8rem);
	font-weight: 500;
	line-height: 0.98;
	text-wrap: balance;
}

ol {
	margin: 2rem 0 0;
	padding: 0;
	list-style: none;
}

li {
	border-bottom: 1px solid color-mix(in oklab, var(--carte-ink) 16%, transparent);
}

a {
	display: grid;
	min-height: 7.5rem;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 1.25rem;
	padding: 1.2rem 0.35rem;
	color: inherit;
	transition:
		background 180ms ease,
		padding-inline 180ms ease;
}

a:hover {
	padding-inline: 1rem;
	background: color-mix(in oklab, var(--carte-sheet) 68%, transparent);
}

a:focus-visible {
	outline: 2px solid var(--carte-focus);
	outline-offset: 3px;
}

.number {
	font-size: 0.7rem;
	font-weight: 750;
	color: var(--carte-wine);
}

.copy {
	display: grid;
	gap: 0.35rem;
}

.copy strong {
	font-family: var(--font-serif);
	font-size: clamp(1.35rem, 3vw, 1.9rem);
	font-weight: 500;
}

.copy span {
	max-width: 42rem;
	font-size: 0.88rem;
	line-height: 1.5;
	color: var(--carte-ink-muted);
}

@media (prefers-reduced-motion: reduce) {
	a {
		transition: none;
	}
}
</style>
