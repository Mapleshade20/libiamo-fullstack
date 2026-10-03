<script lang="ts">
/** Quest Hall: two glasses raised and touched. Clicking swings them together and strikes sparks. */
let { playing = false }: { playing?: boolean } = $props();
</script>

<svg viewBox="0 0 32 32" aria-hidden="true" class:playing>
	<g class="sparks">
		<path class="nav-stroke nav-stroke-thin" d="M15.7-.15v2.8" />
		<path class="nav-stroke nav-stroke-thin" d="m11.1 1.45 1.5 2.4" />
		<path class="nav-stroke nav-stroke-thin" d="m20.3 1.45-1.5 2.4" />
	</g>

	<!-- Paper is composited first; overlapping objects occlude ink, never each other's white rim. -->
	<g transform="translate(7.56 24.65)">
		<g class="glass left">
			<path
				class="nav-cut"
				d="M-5.5-16.4Q-1-18.7 4.9-16.9C5.8-11 3.2-7.3 1-5.8L1.3-1.4 4.4-.9Q5 1.1.1 1.2T-4.5-.9L-1.3-1.5-1.5-5.8C-4-7.1-5.7-11.9-5.5-16.4Z"
			/>
		</g>
	</g>
	<g transform="translate(23.84 24.65)">
		<g class="glass right">
			<path
				class="nav-cut"
				d="M-5.2-16.8Q.5-18.9 5.5-16.5C5.7-10.8 3.1-6.5 1.4-5.9L1-1.3 4.3-.6Q4.7 1.4-.3 1T-4.4-.8L-1.1-1.4-1.2-6.2C-3.5-7.6-5.7-11.4-5.2-16.8Z"
			/>
		</g>
	</g>
	<!-- Each glass is drawn at the origin of its own group and set down by the parent, so the tilt is
	     free to animate without disturbing where the glass stands.
	     The pair is set down so that what is drawn sits square in the middle of the box: the row
	     scales its stickers about that middle, and off centre a sticker would slide as it grew. -->
	<g transform="translate(7.56 24.65)">
		<g class="glass left">
			<path class="bowl nav-stroke" d="M-5.1-16.3C-5.1-10-2.65-6.6 0-6.05 2.65-6.6 5.1-10 5.1-16.3" />
			<path class="wine" d="M-4-12.5C-3.7-9.4-2.1-7.4 0-7c2.1-.4 3.7-2.4 4-5.5Z" />
			<ellipse class="wine-top nav-stroke nav-stroke-thin" cx="0" cy="-12.5" rx="4" ry=".98" />
			<path class="nav-shine" d="M-3.1-13.6c-.05 1.7.4 3.2 1.15 4.3" />
			<path class="nav-stroke" d="M0-6.1v5.2" />
			<ellipse class="glassware nav-stroke" cx="0" cy="-.6" rx="4" ry="1.2" />
			<ellipse class="rim nav-stroke nav-stroke-thin" cx="0" cy="-16.3" rx="5.1" ry="1.7" />
		</g>
	</g>

	<g transform="translate(23.84 24.65)">
		<g class="glass right">
			<path class="bowl nav-stroke" d="M-5.1-16.3C-5.1-10-2.65-6.6 0-6.05 2.65-6.6 5.1-10 5.1-16.3" />
			<path class="wine" d="M-4-12.5C-3.7-9.4-2.1-7.4 0-7c2.1-.4 3.7-2.4 4-5.5Z" />
			<ellipse class="wine-top nav-stroke nav-stroke-thin" cx="0" cy="-12.5" rx="4" ry=".98" />
			<path class="nav-shine" d="M-3.1-13.6c-.05 1.7.4 3.2 1.15 4.3" />
			<path class="nav-stroke" d="M0-6.1v5.2" />
			<ellipse class="glassware nav-stroke" cx="0" cy="-.6" rx="4" ry="1.2" />
			<ellipse class="rim nav-stroke nav-stroke-thin" cx="0" cy="-16.3" rx="5.1" ry="1.7" />
		</g>
	</g>
</svg>

<style>
svg {
	width: 100%;
	height: 100%;
	/* The glasses leave the top of the box to the sparks, so they are drawn out furthest;
	   the sparks are free to overflow, since they only exist mid-click.
	   The pen divides this scale back out, so the outline keeps the row's one weight. */
	--nav-ink-scale: 1.54;
	scale: var(--nav-ink-scale);
	/* The die cut reaches past the drawing, and so must the box that holds it. */
	overflow: visible;
}

.bowl,
.glassware {
	fill: color-mix(in oklch, var(--color-accent-blue) 14%, #fff);
}

/* The rim is the one ellipse a glass is read by; it closes the bowl and sits over its chord. */
.rim {
	fill: color-mix(in oklch, var(--color-accent-blue) 24%, #fff);
}

/* The wine takes no outline of its own — the bowl already encloses it, and a second dark line in a
   space this small turns the glass into a blot. */
.wine {
	fill: var(--color-ink-wine);
	stroke: none;
}

.wine-top {
	fill: color-mix(in oklch, var(--color-ink-wine) 62%, #fff);
}

.glass {
	/* A fixed pivot keeps the separate paper and ink layers registered throughout the clink. */
	transform-origin: 0px 0.6px;
}

.left {
	transform: rotate(14deg);
}

.right {
	transform: rotate(-14deg);
}

/* The sparks only exist at the moment of the strike. */
.sparks {
	opacity: 0;
	transform-box: fill-box;
	transform-origin: 50% 120%;
}

.playing .left {
	animation: clink-left 540ms cubic-bezier(0.34, 1.35, 0.5, 1);
}

.playing .right {
	animation: clink-right 540ms cubic-bezier(0.34, 1.35, 0.5, 1);
}

.playing .sparks {
	animation: clink-sparks 540ms ease-out;
}

@keyframes clink-left {
	0%,
	100% {
		transform: rotate(14deg);
	}
	40% {
		transform: rotate(25deg);
	}
	64% {
		transform: rotate(10deg);
	}
}

@keyframes clink-right {
	0%,
	100% {
		transform: rotate(-14deg);
	}
	40% {
		transform: rotate(-25deg);
	}
	64% {
		transform: rotate(-10deg);
	}
}

@keyframes clink-sparks {
	0%,
	28% {
		opacity: 0;
		transform: scale(0.55);
	}
	46% {
		opacity: 1;
		transform: scale(1);
	}
	100% {
		opacity: 0;
		transform: scale(1.18);
	}
}

@media (prefers-reduced-motion: reduce) {
	.playing .left,
	.playing .right,
	.playing .sparks {
		animation: none;
	}
}
</style>
