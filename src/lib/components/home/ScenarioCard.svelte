<script lang="ts">
import { siteOf } from "#lib/writing/sites.ts";
import SiteArt from "./SiteArt.svelte";

/*
 * A scenario (or an unfinished piece) as a card. By day a postcard: the place's name, a perforated stamp with its drawing,
 * a postmark. At night a badge: a deep band, the drawing on an uneven disc. On a phone a row with a square cover.
 * `state` marks a piece in progress (a dot) or one already written (muted).
 */
let {
	site,
	title,
	line,
	meta,
	href,
	onclick,
	state = "new",
	compact = false,
}: {
	site: string;
	title: string;
	line: string;
	meta: string;
	href?: string;
	onclick?: () => void;
	state?: "new" | "open" | "written";
	compact?: boolean;
} = $props();
const st = $derived(siteOf(site));
</script>

<svelte:element
	this={href ? "a" : "button"}
	type={href ? undefined : "button"}
	{href}
	class="card"
	class:written={state === "written"}
	class:compact
	style:--tone={st.tone}
	style:--deep={st.deep}
	{onclick}
	role={href ? undefined : "button"}
>
	<div class="cover">
		<span class="badge"><SiteArt art={st.art} disc /></span>
		<span class="square"><SiteArt art={st.art} disc size={62} /></span>
		<span class="site">{site}</span>
		<div class="stamp">
			<span class="face"><SiteArt art={st.art} size={42} /></span>
		</div>
		<svg class="postmark" viewBox="0 0 74 40" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
			<circle cx="20" cy="20" r="16" />
			<circle cx="20" cy="20" r="11.5" />
			<path d="M40 12c5-4 9 4 14 0s9 4 14 0M40 20c5-4 9 4 14 0s9 4 14 0M40 28c5-4 9 4 14 0s9 4 14 0" />
		</svg>
	</div>
	<div class="body">
		<h3>{title}</h3>
		<p>{line}</p>
		<div class="meta"><span class="site-m">{site}</span><span class:on={state === "open"}>{meta}</span></div>
	</div>
</svelte:element>

<style>
.card {
	display: flex;
	flex-direction: column;
	min-height: 272px;
	border: 1px solid var(--edge);
	box-shadow: var(--lift);
	border-radius: 6px;
	background: var(--card-bg);
	overflow: hidden;
	cursor: pointer;
	text-align: start;
	padding: 0;
	color: inherit;
	text-decoration: none;
	transition:
		background-color 150ms,
		scale 150ms;
}
.card.compact {
	min-height: 236px;
}
.card:hover {
	background: var(--card-hover);
}
.card:active {
	scale: 0.985;
}
.card:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.cover {
	position: relative;
	height: 118px;
	display: flex;
	align-items: flex-end;
	padding: 12px 14px;
	background: var(--bg-2);
	color: var(--ink-2);
	overflow: hidden;
}
.compact .cover {
	height: 96px;
}
.site {
	position: relative;
	font-family: var(--font-serif-stack);
	font-size: 22px;
	line-height: 1;
}
.stamp {
	position: absolute;
	right: 14px;
	top: 12px;
	width: 54px;
	height: 64px;
	padding: 6px;
	background: var(--raised);
	filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.08));
	--holes: radial-gradient(circle 3px at 4px 4px, transparent 97%, #000) -4px -4px / 8px 8px;
	-webkit-mask:
		var(--holes),
		linear-gradient(#000 0 0) content-box;
	mask:
		var(--holes),
		linear-gradient(#000 0 0) content-box;
}
.compact .stamp {
	top: 8px;
}
.face {
	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
	background: var(--tone);
}
.postmark {
	position: absolute;
	right: 46px;
	top: 32px;
	width: 74px;
	height: 40px;
	color: var(--ink);
	opacity: 0.18;
}
.badge,
.square {
	display: none;
}
/* Written already: the stamp is cancelled, the card a little quieter. */
.written .cover {
	filter: saturate(0.6);
}
.written .postmark {
	opacity: 0.35;
}
:global([data-theme="dark"]) .cover {
	background: var(--deep);
	justify-content: center;
	align-items: center;
}
:global([data-theme="dark"]) .site,
:global([data-theme="dark"]) .stamp,
:global([data-theme="dark"]) .postmark {
	display: none;
}
:global([data-theme="dark"]) .badge {
	display: block;
}
:global([data-theme="dark"]) .compact .badge :global(.site-art) {
	scale: 0.85;
}
.body {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 13px 15px 14px;
}
h3 {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	line-height: 1.35;
}
p {
	margin: 0;
	color: var(--muted);
	font-size: 13px;
	line-height: 1.5;
}
.meta {
	margin-top: auto;
	display: flex;
	gap: 8px;
	align-items: center;
	font-size: 12px;
	color: var(--muted);
}
.meta .on {
	color: var(--ink);
}
.meta .on::before {
	content: "";
	display: inline-block;
	width: 6px;
	height: 6px;
	margin-inline-end: 5px;
	border-radius: 50%;
	background: var(--accent-c);
	vertical-align: 1px;
}
.site-m {
	display: none;
}
@media (max-width: 640px) {
	.card {
		flex-direction: row;
		min-height: 0;
	}
	.cover {
		width: 88px;
		height: auto;
		min-height: 104px;
		flex: none;
		padding: 0;
		align-items: center;
		justify-content: center;
		background: var(--tone);
	}
	.compact .cover {
		height: auto;
	}
	:global([data-theme="dark"]) .cover {
		background: var(--deep);
	}
	.site,
	.stamp,
	.postmark,
	.badge,
	:global([data-theme="dark"]) .badge {
		display: none;
	}
	.square {
		display: block;
	}
	.square :global(.disc) {
		fill: color-mix(in srgb, #fff 55%, var(--tone));
	}
	.site-m {
		display: inline;
	}
}
</style>
