<script lang="ts">
/*
 * The account: the learner's own face (their picture, or their initial on a disc) cut to the stickers' die-cut
 * silhouette. While the account is in hand (its menu open, or one of its pages open) the face gives way to the drawn
 * stranger of the other stickers, the same selected/unselected sense as the carton's lid. The two dissolve into each
 * other, each through a small change of size.
 */
let { name, photo, drawn = false, size = 28 }: { name: string; photo?: string; drawn?: boolean; size?: number } = $props();
const id = $props.id();
const initial = $derived((name.trim()[0] ?? "?").toUpperCase());
</script>

<span class="stack" class:drawn style:--st-size="{size}px" aria-hidden="true">
	<svg class="face" viewBox="0 0 32 32" aria-hidden="true">
		<defs>
			<clipPath id="{id}-c"><circle cx="16" cy="16" r="13.8" /></clipPath>
		</defs>
		<path class="nav-cut" d="M1.8 15.2C2.1 7.1 8.5 1.5 16.5 1.9S30.6 8.8 30 16.6 23.8 30.8 15.5 30.2 1.2 23.2 1.8 15.2Z" />
		{#if photo}
			<image href={photo} x="2.2" y="2.2" width="27.6" height="27.6" preserveAspectRatio="xMidYMid slice" clip-path="url(#{id}-c)" />
		{:else}
			<circle class="initial-disc" cx="16" cy="16" r="13.8" />
			<text x="16" y="16" dy="0.36em" text-anchor="middle">{initial}</text>
		{/if}
	</svg>
	<svg class="stranger st-me" viewBox="0 0 32 32" aria-hidden="true">
		<defs>
			<clipPath id="{id}-d"><circle cx="16" cy="16" r="13.8" /></clipPath>
		</defs>
		<path class="nav-cut" d="M1.8 15.2C2.1 7.1 8.5 1.5 16.5 1.9S30.6 8.8 30 16.6 23.8 30.8 15.5 30.2 1.2 23.2 1.8 15.2Z" />
		<circle class="disc" cx="16" cy="16" r="13.8" />
		<g clip-path="url(#{id}-d)"><path class="coat nav-stroke" d="M4.6 32c0-6.2 5.1-11.4 11.4-11.4S27.4 25.8 27.4 32Z" /></g>
		<circle class="head nav-stroke" cx="16" cy="12.8" r="5" />
		<path class="nav-shine" d="M13.2 10.6a3.2 3.2 0 0 1 2.2-1.7" />
		<circle class="nav-stroke" cx="16" cy="16" r="13.8" />
	</svg>
</span>

<style>
.stack {
	position: relative;
	display: block;
	flex: none;
	width: var(--st-size);
	height: var(--st-size);
	filter: drop-shadow(0 1px 1.2px rgb(40 32 24 / 0.3));
}
svg {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	overflow: visible;
	scale: 1.08;
	transition: opacity 150ms;
}
.stranger {
	opacity: 0;
}
.drawn .stranger {
	opacity: 1;
}
.drawn .face {
	opacity: 0;
}
/* The stranger is drawn in with a turn, for those who have not asked for less motion; else the faces only fade. */
@media (prefers-reduced-motion: no-preference) {
	svg {
		transition:
			opacity 320ms ease,
			transform 400ms cubic-bezier(0.32, 0.9, 0.35, 1);
	}
	.stranger {
		transform: scale(0.9) rotate(-8deg);
	}
	.drawn .stranger {
		transform: rotate(-3deg);
	}
	.drawn .face {
		transform: scale(1.08);
	}
}
.initial-disc {
	fill: color-mix(in oklch, var(--ink-wine) 78%, #fff);
}
text {
	fill: #fff;
	font: 600 13px var(--font-sans-stack);
}
</style>
