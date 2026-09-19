<script lang="ts">
import type { StreakStatus } from "$lib/streak";

interface Props {
	status: StreakStatus;
	/** Plays the ignite bloom once; the parent flips it back after the animation window. */
	igniting?: boolean;
	size?: number;
}

let { status, igniting = false, size = 20 }: Props = $props();
const lit = $derived(status === "lit");
</script>

<span class="flame" class:lit class:igniting style="--flame-size: {size}px">
	<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
		<!-- One outline, filled or not, so lit and pending share their geometry exactly. -->
		<path
			class="body"
			d="M12 2.6c.5 3 2.2 4.2 3.6 5.8 1.5 1.6 2.6 3.2 2.6 5.4 0 3.6-3 6.4-6.2 6.4S5.8 17.4 5.8 13.8c0-1.9.8-3.3 1.8-4.4.5 1 1.2 1.6 1.9 1.8-.4-2.7.6-5.7 2.5-8.6Z"
		/>
		<path class="core" d="M12 12.1c.9 1.1 1.6 1.9 1.6 3.1 0 1.5-1 2.5-2.2 2.5S9.2 16.7 9.2 15.2c0-1.4 1.4-1.9 2.8-3.1Z" />
	</svg>
	{#if igniting}
		<span class="glow" aria-hidden="true"></span>
		<span class="ember ember-1" aria-hidden="true"></span>
		<span class="ember ember-2" aria-hidden="true"></span>
		<span class="ember ember-3" aria-hidden="true"></span>
	{/if}
</span>

<style>
.flame {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	line-height: 0;
}

.body {
	fill: none;
	stroke: var(--color-muted-foreground);
	stroke-width: 1.4;
	stroke-linejoin: round;
	opacity: 0.55;
	transition:
		fill calc(300ms * var(--streak-speed, 1)) ease-out,
		stroke calc(300ms * var(--streak-speed, 1)) ease-out,
		opacity calc(300ms * var(--streak-speed, 1)) ease-out;
}

.core {
	fill: none;
	opacity: 0;
	transition:
		fill calc(300ms * var(--streak-speed, 1)) ease-out,
		opacity calc(300ms * var(--streak-speed, 1)) ease-out;
}

.lit .body {
	fill: var(--color-streak-flame);
	stroke: var(--color-streak-flame);
	opacity: 1;
}

.lit .core {
	fill: var(--color-streak-flame-core);
	opacity: 0.9;
}

.igniting svg {
	animation: flame-pop calc(320ms * var(--streak-speed, 1)) cubic-bezier(0.2, 0, 0.15, 1);
}

.glow {
	position: absolute;
	inset: -60%;
	border-radius: 9999px;
	background: radial-gradient(circle, color-mix(in oklch, var(--color-streak-flame) 45%, transparent) 0%, transparent 70%);
	animation: flame-glow calc(600ms * var(--streak-speed, 1)) ease-out forwards;
	pointer-events: none;
}

.ember {
	position: absolute;
	bottom: 30%;
	width: 2px;
	height: 2px;
	border-radius: 9999px;
	background: var(--color-streak-flame);
	animation: flame-ember calc(600ms * var(--streak-speed, 1)) ease-out forwards;
	pointer-events: none;
}

.ember-1 {
	left: 30%;
	animation-delay: calc(40ms * var(--streak-speed, 1));
}
.ember-2 {
	left: 50%;
	animation-delay: calc(120ms * var(--streak-speed, 1));
}
.ember-3 {
	left: 68%;
	animation-delay: calc(200ms * var(--streak-speed, 1));
}

@keyframes flame-pop {
	0% {
		transform: scale(0.94);
	}
	55% {
		transform: scale(1.04);
	}
	100% {
		transform: scale(1);
	}
}

@keyframes flame-glow {
	0% {
		opacity: 0;
	}
	30% {
		opacity: 1;
	}
	100% {
		opacity: 0;
	}
}

@keyframes flame-ember {
	0% {
		opacity: 0;
		transform: translateY(0);
	}
	25% {
		opacity: 0.9;
	}
	100% {
		opacity: 0;
		transform: translateY(-10px);
	}
}

/* Reduced motion keeps the state change, drops the travel. */
@media (prefers-reduced-motion: reduce) {
	.igniting svg,
	.glow,
	.ember {
		animation: none;
	}
	.glow,
	.ember {
		display: none;
	}
	.body,
	.core {
		transition: none;
	}
}
</style>
