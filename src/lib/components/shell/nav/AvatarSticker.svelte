<script lang="ts">
/**
 * The account clipping.
 *
 * Everywhere else in the app the account is a stranger drawn in the same hand as the other four
 * stickers — a head in a circle, no more personal than a carton or a pack of cards. On the profile
 * page the drawing dissolves into the learner's own face, which is the one place the face is the
 * subject rather than a button.
 */
let { avatarUrl, revealed = false, playing = false }: { avatarUrl: string; revealed?: boolean; playing?: boolean } = $props();

// The bust is cut to the disc it sits in, and the clip needs a name of its own per instance.
const clipId = $props.id();
</script>

<span class="stack" class:revealed class:playing>
	<svg class="face" viewBox="0 0 32 32" aria-hidden="true">
		<defs>
			<clipPath id="{clipId}-photo"><circle cx="16" cy="16" r="13.8" /></clipPath>
		</defs>
		<path class="nav-cut" d="M1.8 15.2C2.1 7.1 8.5 1.5 16.5 1.9S30.6 8.8 30 16.6 23.8 30.8 15.5 30.2 1.2 23.2 1.8 15.2Z" />
		<image href={avatarUrl} x="2.2" y="2.2" width="27.6" height="27.6" preserveAspectRatio="xMidYMid slice" clip-path="url(#{clipId}-photo)" />
	</svg>

	<span class="drawn">
		<svg viewBox="0 0 32 32" aria-hidden="true">
			<defs>
				<clipPath id={clipId}>
					<circle cx="16" cy="16" r="13.8" />
				</clipPath>
			</defs>

			<path class="nav-cut" d="M1.8 15.2C2.1 7.1 8.5 1.5 16.5 1.9S30.6 8.8 30 16.6 23.8 30.8 15.5 30.2 1.2 23.2 1.8 15.2Z" />
			<circle class="disc" cx="16" cy="16" r="13.8" />

			<g clip-path="url(#{clipId})">
				<path class="coat nav-stroke" d="M4.6 32c0-6.2 5.1-11.4 11.4-11.4S27.4 25.8 27.4 32Z" />
			</g>

			<circle class="head nav-stroke" cx="16" cy="12.8" r="5" />
			<path class="nav-shine" d="M13.2 10.6a3.2 3.2 0 0 1 2.2-1.7" />

			<!-- The rim goes on last: it closes the disc over the bust that was cut to it. -->
			<circle class="rim nav-stroke" cx="16" cy="16" r="13.8" />
		</svg>
	</span>
</span>

<style>
.stack {
	position: relative;
	display: block;
	width: 100%;
	height: 100%;
}

/*
 * The two faces sit one over the other and trade places, each easing through its own small change
 * of size so the swap is a dissolve rather than a cut: the drawing opens out as it goes, the
 * photograph settles in from just under full size.
 */
.face,
.drawn {
	position: absolute;
	inset: 0;
	transition:
		opacity 360ms ease,
		transform 420ms cubic-bezier(0.32, 0.9, 0.35, 1);
}

/* The photograph uses the drawing's exact paper silhouette, not stacked CSS rings. */
.face {
	display: block;
	width: 100%;
	height: 100%;
	--nav-ink-scale: 1.08;
	scale: var(--nav-ink-scale);
	overflow: visible;
	opacity: 0;
	transform: scale(0.94);
}

.revealed .face {
	opacity: 1;
	transform: scale(1);
}

.revealed .drawn {
	opacity: 0;
	transform: scale(1.07);
}

.drawn svg {
	display: block;
	width: 100%;
	height: 100%;
	--nav-ink-scale: 1.08;
	scale: var(--nav-ink-scale);
	overflow: visible;
}

.disc {
	fill: color-mix(in oklch, var(--color-accent-blue) 18%, #fff);
}

.rim {
	fill: none;
}

.coat {
	fill: color-mix(in oklch, var(--color-accent-blue) 56%, #fff);
}

.head {
	fill: color-mix(in oklch, var(--color-accent-yellow) 30%, #fff);
}

.stack.playing {
	animation: face-press 520ms cubic-bezier(0.34, 1.4, 0.5, 1);
}

@keyframes face-press {
	0%,
	100% {
		transform: scale(1) rotate(0);
	}
	34% {
		transform: scale(1.16) rotate(-7deg);
	}
	66% {
		transform: scale(0.98) rotate(4deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.stack.playing {
		animation: none;
	}
	.face,
	.drawn {
		transition: opacity 200ms ease;
		transform: none;
	}
	.revealed .face,
	.revealed .drawn {
		transform: none;
	}
}
</style>
