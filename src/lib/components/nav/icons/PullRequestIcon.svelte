<script lang="ts">
/** Contribute: a branch opened against the trunk. Clicking walks the branch back in and lands it. */
let { playing = false }: { playing?: boolean } = $props();
</script>

<svg viewBox="0 0 32 32" aria-hidden="true" class:playing>
	<!--
		The trunk and its nodes share one cut: the paper rim is wider than they stand apart, so a rim
		each would paint out its neighbours. The branch and the head keep their own, because a cut
		that stayed put while its part drew itself on would give the drawing away.

		The graph is drawn so that what is inked sits square in the middle of the box: the row scales
		its stickers about that middle, and off centre a sticker would slide as it grew.
	-->
	<g class="nav-cut">
		<path class="nav-cut-line" d="M8.4 8.1q.8 7.8.1 15.8" />
		<path d="M5 8c.1-2.3 2-3.9 4.2-3.7s3.6 1.9 3.4 4.2-1.9 3.5-4 3.3S4.8 10.2 5 8Z" />
		<path d="M5.1 23.6c.2-2.2 1.9-3.5 4.1-3.4s3.6 1.9 3.3 4.2-1.9 3.5-4.2 3.2-3.5-1.8-3.2-4Z" />
		<path d="M19.5 24c-.2-2.1 1.5-4 3.8-3.9s3.9 1.8 3.8 4-1.9 3.7-4.2 3.5-3.4-1.7-3.4-3.6Z" />
	</g>

	<!-- The work travels from the branch back into the trunk and stops at the commit the trunk is
	     asked to take it into, which is the whole claim a pull request makes. The head's paper goes
	     down first so the branch runs into the head rather than being cut short of it. -->
	<g class="arrow">
		<path class="nav-cut" d="m18.8 4.6.3 7-6-3.3Z" />
	</g>
	<path class="branch-cut nav-cut nav-cut-line" d="M23.5 20.5c-.5-8.8.6-12.9-5-12.6" />
	<path class="line branch nav-stroke" d="M23.2 20.5c0-9.2.6-12.4-4.6-12.4" />
	<!-- Solid, because at this size a chevron would read as a second fork in the branch. -->
	<g class="arrow">
		<path class="head nav-stroke" d="M18.6 5.1v6L13.6 8.1Z" />
	</g>

	<path class="line nav-stroke" d="M8.8 11.3v9.4" />

	<circle class="dot source nav-stroke" cx="8.8" cy="23.9" r="3.4" />
	<circle class="dot source nav-stroke" cx="23.2" cy="23.9" r="3.4" />
	<!-- The commit the trunk gains by taking the branch in. -->
	<g class="landing">
		<circle class="dot target nav-stroke" cx="8.8" cy="8.1" r="3.4" />
	</g>
</svg>

<style>
svg {
	width: 100%;
	height: 100%;
	/* Drawn out so the graph carries the same weight as the rest of the row.
	   The pen divides this scale back out, so the outline keeps the row's one weight. */
	--nav-ink-scale: 1.38;
	scale: var(--nav-ink-scale);
	overflow: visible;
}

/* Branches are the body of this drawing, not its detail, so they are drawn with a fatter nib. */
.line {
	stroke-width: calc(2.4 / var(--nav-ink-scale, 1));
}

.source {
	fill: color-mix(in oklch, var(--color-accent-sage) 66%, #fff);
}

.target {
	fill: color-mix(in oklch, var(--color-accent-rose) 66%, #fff);
}

.head {
	fill: color-mix(in oklch, var(--color-accent-sage) 82%, #fff);
}

.landing {
	transform-box: fill-box;
	transform-origin: 50% 50%;
}

.arrow {
	transform-box: fill-box;
	transform-origin: 50% 0;
}

.playing .branch,
.playing .branch-cut {
	/* The branch runs about 16 units; one whole dash of it is walked on from the branch end. */
	stroke-dasharray: 16;
	animation: branch-draw 580ms cubic-bezier(0.32, 0.9, 0.35, 1);
}

.playing .arrow {
	animation: arrow-land 580ms cubic-bezier(0.34, 1.35, 0.5, 1);
}

.playing .landing {
	animation: landing-take 580ms cubic-bezier(0.34, 1.5, 0.5, 1);
}

@keyframes branch-draw {
	0% {
		stroke-dashoffset: 16;
	}
	62%,
	100% {
		stroke-dashoffset: 0;
	}
}

/* The head comes in behind the branch it belongs to, from the branch's side. */
@keyframes arrow-land {
	0%,
	40% {
		opacity: 0;
		transform: translateX(3px);
	}
	70% {
		opacity: 1;
		transform: translateX(-0.8px);
	}
	100% {
		opacity: 1;
		transform: translateX(0);
	}
}

@keyframes landing-take {
	0%,
	70% {
		transform: scale(1);
	}
	84% {
		transform: scale(1.25);
	}
	100% {
		transform: scale(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.playing .branch,
	.playing .branch-cut,
	.playing .arrow,
	.playing .landing {
		animation: none;
	}
}
</style>
