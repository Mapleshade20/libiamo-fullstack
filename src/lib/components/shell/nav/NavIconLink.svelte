<script lang="ts">
import type { Component } from "svelte";
import AvatarSticker from "./AvatarSticker.svelte";

interface Props {
	href: string;
	label: string;
	/** A drawn sticker, or — for the account — the learner's own avatar. Exactly one is given. */
	Icon?: Component<{ playing?: boolean; active?: boolean }>;
	avatarUrl?: string;
	active: boolean;
	/** A deterministic tilt, so the row reads as clippings pasted by hand rather than a grid. */
	tilt?: number;
	onclick?: (event: MouseEvent) => void;
}

let { href, label, Icon, avatarUrl, active, tilt = 0, onclick }: Props = $props();

let playing = $state(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function play() {
	clearTimeout(timer);
	playing = false;
	// Restart on the next frame so a second click replays rather than doing nothing.
	requestAnimationFrame(() => {
		playing = true;
		timer = setTimeout(() => (playing = false), 620);
	});
}

$effect(() => () => clearTimeout(timer));
</script>

<a
	{href}
	class="clipping"
	class:active
	aria-current={active ? "page" : undefined}
	aria-label={label}
	title={label}
	style="--tilt: {tilt}deg"
	onclick={(event) => {
		play();
		onclick?.(event);
	}}
>
	<span class="sticker">
		{#if Icon}
			<Icon {playing} {active} />
		{:else if avatarUrl}
			<!-- Drawn like the rest of the row until this is the page you are on. -->
			<AvatarSticker {avatarUrl} revealed={active} {playing} />
		{/if}
	</span>
	<!-- The current mark: a pen line ruled under the drawing. Absolute, so it adds no height. -->
	<svg class="rule" viewBox="0 0 40 6" aria-hidden="true" preserveAspectRatio="none">
		<path d="M2 3.6c6-1.6 12-1.6 18-.4s12 1.4 18 .2" />
	</svg>
</a>

<style>
.clipping {
	position: relative;
	display: grid;
	place-items: center;
	padding: var(--nav-icon-pad, 0.25rem);
	-webkit-tap-highlight-color: transparent;
}

/* The drawing stays small; the target does not. */
.clipping::before {
	content: "";
	position: absolute;
	inset: calc(-1 * var(--nav-icon-reach, 0.4rem)) 0;
}

/*
 * The sticker is the drawing: its white rim is cut in the SVG along the icon's own silhouette, so
 * all that belongs here is the tilt it was pasted at and the shadow it casts on the bar.
 */
.sticker {
	display: block;
	width: var(--nav-icon-size, 1.65rem);
	height: var(--nav-icon-size, 1.65rem);
	transform: rotate(var(--tilt));
	/* Off duty a sticker is a little sun-faded; the current one is the one that kept its colour.
	   Paired with the ruled line below, the route reads at a glance. */
	filter: drop-shadow(0 1px 1.2px oklch(0.25 0.005 285 / 0.3)) saturate(0.72) opacity(0.86);
	transition:
		transform 240ms cubic-bezier(0.34, 1.2, 0.5, 1),
		filter 240ms ease-out;
}

.clipping:hover .sticker {
	transform: rotate(var(--tilt)) translateY(-1.5px) scale(1.04);
	filter: drop-shadow(0 1.4px 1.8px oklch(0.25 0.005 285 / 0.3)) saturate(0.92) opacity(0.96);
}

/*
 * Keyboard focus rings the drawing. The clipping's own box is the target a thumb aims at — as wide
 * as the rail can spread it — and outlining that would draw the empty space instead of the route.
 */
.clipping:focus-visible {
	outline: none;
}

.clipping:focus-visible .sticker {
	outline: 2px solid var(--color-ring);
	outline-offset: 3px;
	border-radius: 0.4rem;
}

/*
 * The current clipping grows where it stands: no lift of its own, and every drawing is inked about
 * the middle of its own box, so all the growth is around a middle that does not move.
 */
.clipping.active .sticker {
	transform: rotate(calc(var(--tilt) - 3deg)) scale(1.1);
	filter: drop-shadow(0 1.8px 2.4px oklch(0.25 0.005 285 / 0.34)) saturate(1) opacity(1);
}

/* Hovered, it still answers the pointer with the same lift as the rest of the row — otherwise the
   clipping you just clicked would drop a pixel and a half under your cursor. */
.clipping.active:hover .sticker {
	transform: rotate(calc(var(--tilt) - 3deg)) translateY(-1.5px) scale(1.1);
	filter: drop-shadow(0 1.8px 2.4px oklch(0.25 0.005 285 / 0.34)) saturate(1) opacity(1);
}

.rule {
	position: absolute;
	/* Below the clipping rather than inside it: the drawings are scaled out past their own boxes,
	   and the line has to clear the feet of the glasses, not cross them. */
	bottom: -0.25rem;
	left: 50%;
	transform: translateX(-50%);
	width: calc(var(--nav-icon-size, 1.65rem) * 0.95);
	height: 0.3rem;
	overflow: visible;
	pointer-events: none;
}

.rule path {
	fill: none;
	stroke: var(--color-ink-wine);
	stroke-width: 1.8;
	stroke-linecap: round;
	stroke-dasharray: 40;
	stroke-dashoffset: 40;
	transition: stroke-dashoffset 320ms ease-out;
}

.clipping.active .rule path {
	stroke-dashoffset: 0;
}

@media (prefers-reduced-motion: reduce) {
	.sticker,
	.rule path {
		transition: none;
	}
	.clipping:hover .sticker {
		transform: rotate(var(--tilt));
	}
}
</style>
