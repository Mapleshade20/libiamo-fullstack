<script lang="ts">
/** Review: two cards stacked slightly out of true. Clicking deals the top one over. */
let { playing = false }: { playing?: boolean } = $props();
</script>

<svg viewBox="0 0 32 32" aria-hidden="true" class:playing>
	<!-- Paper is composited first; overlapping objects occlude ink, never each other's white rim. -->
	<g transform="translate(14.25 16.9)">
		<g class="card back">
			<path class="nav-cut" d="M-5.7-10.6 5.5-10.2Q8-10.4 8.1-7.7L7.5 8.5Q7.4 10.8 5 10.6L-5.8 10.2Q-8.3 10.3-8.1 7.7L-7.8-8.2Q-7.8-10.5-5.7-10.6Z" />
		</g>
	</g>
	<g transform="translate(18.2 15.8)">
		<g class="card front">
			<path class="nav-cut" d="M-5.4-10.3 5.8-10.7Q7.9-10.7 7.8-8L8.2 8.1Q8.3 10.1 5.7 10.3L-5.6 10.7Q-8 10.8-8 8L-8.2-7.7Q-8.3-10.2-5.4-10.3Z" />
		</g>
	</g>
	<!-- The stack is set down so that what is drawn sits square in the middle of the box: the row
	     scales its stickers about that middle, and off centre a sticker would slide as it grew. -->
	<g transform="translate(14.25 16.9)">
		<g class="card back">
			<rect class="paper back-paper nav-stroke" x="-7.6" y="-10.2" width="15.2" height="20.4" rx="2.2" />
		</g>
	</g>

	<g transform="translate(18.2 15.8)">
		<g class="card front">
			<rect class="paper front-paper nav-stroke" x="-7.6" y="-10.2" width="15.2" height="20.4" rx="2.2" />
			<!-- The word being studied, and the line it is waiting to be turned over for. -->
			<path class="rule nav-stroke nav-stroke-thin" d="M-4.3-2.4h8.6" />
			<path class="rule nav-stroke nav-stroke-thin" d="M-4.3 1.6h5.4" />
		</g>
	</g>
</svg>

<style>
svg {
	width: 100%;
	height: 100%;
	/* Drawn out so the tilted stack carries the same weight as the rest of the row.
	   The pen divides this scale back out, so the outline keeps the row's one weight. */
	--nav-ink-scale: 1.4;
	scale: var(--nav-ink-scale);
	overflow: visible;
}

.back-paper {
	fill: color-mix(in oklch, var(--color-accent-blue) 34%, #fff);
}

.front-paper {
	fill: color-mix(in oklch, var(--color-accent-yellow) 12%, #fff);
}

.rule {
	stroke: color-mix(in oklch, var(--nav-line) 45%, transparent);
}

.card {
	transform-origin: 0px 7.8px;
}

.back {
	transform: rotate(-12deg);
}

.front {
	transform: rotate(6deg);
}

.playing .back {
	animation: deal-back 500ms cubic-bezier(0.34, 1.3, 0.5, 1);
}

.playing .front {
	animation: deal-front 500ms cubic-bezier(0.34, 1.3, 0.5, 1);
}

@keyframes deal-back {
	0%,
	100% {
		transform: rotate(-12deg);
	}
	45% {
		transform: rotate(-22deg) translateX(-1.2px);
	}
}

@keyframes deal-front {
	0%,
	100% {
		transform: rotate(6deg) translateY(0);
	}
	45% {
		transform: rotate(15deg) translate(1.4px, -1.6px);
	}
}

@media (prefers-reduced-motion: reduce) {
	.playing .back,
	.playing .front {
		animation: none;
	}
}
</style>
