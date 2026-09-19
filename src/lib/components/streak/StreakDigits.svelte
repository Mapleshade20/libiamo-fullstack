<script lang="ts">
interface Props {
	value: number;
	/** Direction of the roll: up when the number grows, down when it is spent back. */
	direction?: "up" | "down";
	muted?: boolean;
}

let { value, direction = "up", muted = false }: Props = $props();

// Per digit, so 9 → 10 widens smoothly instead of swapping the whole number at once.
const digits = $derived(String(Math.max(0, Math.trunc(value))).split(""));
</script>

<span class="digits tabular-nums" class:muted class:down={direction === "down"} aria-label={String(value)}>
	{#each digits as digit, index (index)}
		<span class="slot">
			{#key digit}
				<span class="digit">{digit}</span>
			{/key}
		</span>
	{/each}
</span>

<style>
.digits {
	display: inline-flex;
	color: var(--color-foreground);
	transition: color calc(300ms * var(--streak-speed, 1)) ease-out;
}

.digits.muted {
	color: var(--color-muted-foreground);
}

.slot {
	position: relative;
	display: inline-block;
	overflow: hidden;
	height: 1.2em;
	line-height: 1.2em;
}

.digit {
	display: inline-block;
	animation: digit-in calc(280ms * var(--streak-speed, 1)) cubic-bezier(0.2, 0, 0.15, 1);
}

.down .digit {
	animation-name: digit-in-down;
}

@keyframes digit-in {
	from {
		transform: translateY(100%);
	}
	to {
		transform: translateY(0);
	}
}

@keyframes digit-in-down {
	from {
		transform: translateY(-100%);
	}
	to {
		transform: translateY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.digit {
		animation: none;
	}
	.digits {
		transition: none;
	}
}
</style>
