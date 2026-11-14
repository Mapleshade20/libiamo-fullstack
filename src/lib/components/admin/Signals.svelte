<script lang="ts">
import CircleDollarSign from "@lucide/svelte/icons/circle-dollar-sign";
import CircleSlash2 from "@lucide/svelte/icons/circle-slash-2";
import DoorOpen from "@lucide/svelte/icons/door-open";
import Eye from "@lucide/svelte/icons/eye";
import FileX from "@lucide/svelte/icons/file-x";
import Hourglass from "@lucide/svelte/icons/hourglass";
import MessageCircleQuestionMark from "@lucide/svelte/icons/message-circle-question-mark";
import PenLine from "@lucide/svelte/icons/pen-line";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import { tip } from "$lib/components/common/tip";
import { SIGNALS, type Signal } from "$lib/demo/admin";

/*
 * A session's signals as small marks, each named on hover: the learner's pushback in ink, the system's struggles in
 * amber. Derived from the record alone (docs/design/2026-11-11-session-records.md).
 */
let { signals, labels = false }: { signals: Signal[]; labels?: boolean } = $props();
const ICON = {
	kept: CircleSlash2,
	own: PenLine,
	question: MessageCircleQuestionMark,
	tries: RotateCcw,
	answer: Eye,
	left: DoorOpen,
	failed: TriangleAlert,
	lost: FileX,
	slow: Hourglass,
	cost: CircleDollarSign,
};
</script>

<span class="sig" class:labels>
	{#each signals as g (g.kind)}
		{@const Icon = ICON[g.kind]}
		{@const text = SIGNALS[g.kind].label(g.n ?? 1)}
		<!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: the label goes with role="img", both set only without visible labels -->
		<span
			class="mark"
			class:system={SIGNALS[g.kind].system}
			use:tip={labels ? undefined : text}
			aria-label={labels ? undefined : text}
			role={labels ? undefined : "img"}
		>
			<Icon class="size-3.5" aria-hidden="true" />
			{#if labels}
				<span>{text}</span>
			{:else if (g.n ?? 1) > 1 && g.kind !== "slow"}
				<span class="n">{g.n}</span>
			{/if}
		</span>
	{/each}
</span>

<style>
.sig {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px;
}
.mark {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	height: 22px;
	min-width: 22px;
	justify-content: center;
	padding: 0 5px;
	border-radius: 4px;
	background: var(--well);
	color: var(--ink-2);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}
.mark.system {
	background: color-mix(in srgb, var(--warn) 13%, transparent);
	color: var(--warn);
}
.labels .mark {
	padding: 0 8px 0 6px;
	gap: 5px;
}
</style>
