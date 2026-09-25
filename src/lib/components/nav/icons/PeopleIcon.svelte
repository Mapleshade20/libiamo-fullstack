<script lang="ts">
/** Admin: two people, one half behind the other. Clicking steps them apart and back together. */
let { playing = false }: { playing?: boolean } = $props();
</script>

<svg viewBox="0 0 32 32" aria-hidden="true" class:playing>
	<g class="person back">
		<path class="nav-cut" d="M13.8 25.6c.3-4.7 3.7-7.4 7-7.1s6 2.7 6.8 7.4Z" />
		<path class="nav-cut" d="M16.2 11.1c-.1-2.7 2.4-4.5 4.8-4.2s4.1 2 4 4.8-2.3 4.2-4.8 4-4.1-2-4-4.6Z" />
		<path class="coat back-coat nav-stroke" d="M14.2 25.4c.6-4.3 3.1-6.7 6.5-6.7s5.9 2.4 6.5 6.7Z" />
		<circle class="head back-head nav-stroke" cx="20.7" cy="11.3" r="4.1" />
	</g>

	<!-- The front figure carries its own cut, so a band of paper parts the two instead of their
	     outlines running together. -->
	<g class="person front">
		<path class="nav-cut" d="M3.9 28.5c.5-5.2 3.7-8.2 8.2-8s7.1 3.3 7.6 8.1Z" />
		<path class="nav-cut" d="M7 13.1c.2-2.7 2-4.6 5-4.5s5 2.4 4.8 5.3-2.5 4.6-5.3 4.3S6.8 16 7 13.1Z" />
		<path class="coat front-coat nav-stroke" d="M4.4 28.2c.7-4.8 3.4-7.4 7.5-7.4s6.8 2.6 7.5 7.4Z" />
		<circle class="head front-head nav-stroke" cx="11.9" cy="13.5" r="4.6" />
		<path class="nav-shine" d="M9.2 11.3a3 3 0 0 1 2-1.6" />
	</g>
</svg>

<style>
svg {
	width: 100%;
	height: 100%;
	/* Drawn out so the pair carries the same weight as the rest of the row.
	   The pen divides this scale back out, so the outline keeps the row's one weight. */
	--nav-ink-scale: 1.38;
	scale: var(--nav-ink-scale);
	overflow: visible;
}

.back-coat {
	fill: color-mix(in oklch, var(--color-accent-rose) 82%, #fff);
}

.back-head {
	fill: color-mix(in oklch, var(--color-accent-rose) 52%, #fff);
}

.front-coat {
	fill: color-mix(in oklch, var(--color-accent-blue) 56%, #fff);
}

.front-head {
	fill: color-mix(in oklch, var(--color-accent-yellow) 30%, #fff);
}

.person {
	transform-box: fill-box;
	transform-origin: 50% 100%;
}

.playing .back {
	animation: step-right 520ms cubic-bezier(0.34, 1.35, 0.5, 1);
}

.playing .front {
	animation: step-left 520ms cubic-bezier(0.34, 1.35, 0.5, 1);
}

@keyframes step-right {
	0%,
	100% {
		transform: translateX(0) rotate(0);
	}
	45% {
		transform: translateX(1.8px) rotate(5deg);
	}
}

@keyframes step-left {
	0%,
	100% {
		transform: translateX(0) rotate(0);
	}
	45% {
		transform: translateX(-1.8px) rotate(-5deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.playing .back,
	.playing .front {
		animation: none;
	}
}
</style>
