<script lang="ts">
import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";
import { onMount } from "svelte";
import TwoStep from "#lib/components/common/TwoStep.svelte";
import { tip } from "#lib/components/common/tip.ts";
import Button from "#lib/components/ui/button/button.svelte";
import Speaker from "./Speaker.svelte";

/* A slip the learner can fix themselves: their words in the box, ready to change. Once they answer, the box itself says
   right or wrong and the note says why; then there is nothing left to reveal, only the way on. */
type Outcome = { to?: string; ok: boolean | null; self: boolean; note?: string; keep?: boolean };
let {
	who,
	icon,
	text,
	initial,
	labels,
	judge,
	reveal,
	done,
}: {
	who: { name: string; color: string };
	icon: string;
	text: string;
	initial: string;
	labels: { submit: string; reveal: string; keep: string; keepSure: string; cont: string };
	judge: (typed: string) => Outcome;
	reveal: () => Outcome;
	done: (o: Outcome) => void;
} = $props();
// svelte-ignore state_referenced_locally
let value = $state(initial);
let outcome = $state<Outcome | null>(null);
let input: HTMLInputElement | null = $state(null);
let cont: HTMLButtonElement | null = $state(null);
onMount(() => {
	const t = setTimeout(() => {
		input?.focus({ preventScroll: true });
		input?.setSelectionRange(value.length, value.length);
	}, 260);
	return () => clearTimeout(t);
});
async function submit() {
	if (outcome) return;
	outcome = judge(value);
	await Promise.resolve();
	setTimeout(() => cont?.focus({ preventScroll: true }));
}
</script>

<div class="p1-card" style:--who={who.color}>
	<!-- The ways out sit at the far end of the card's head, away from the field and its key. -->
	<Speaker {who} {icon}>
		{#snippet aside()}
			<!-- Keeping their own words stays possible after a wrong answer (they may know better: a name, their meaning). -->
			{#if !outcome || outcome.ok === false}
				<span class="p1-links">
					{#if !outcome}
						<button type="button" class="p1-link" onclick={() => done(reveal())}>{labels.reveal}</button>
					{/if}
					<TwoStep class="p1-link" label={labels.keep} confirm={labels.keepSure} onconfirm={() => done({ keep: true, ok: null, self: false })} />
				</span>
			{/if}
		{/snippet}
		{text}
	</Speaker>
	<div class="p1-actions inline-row">
		<input
			bind:this={input}
			bind:value
			class="fix-in"
			class:right={outcome?.ok === true}
			class:wrong={outcome?.ok === false}
			readonly={!!outcome}
			autocomplete="off"
			spellcheck="false"
			aria-label={text}
			onkeydown={(e) => {
				if (e.key === "Enter" && !e.isComposing) {
					e.preventDefault();
					submit();
				}
			}}
		>
		<button type="button" class="send key" disabled={!!outcome} onclick={submit} use:tip={labels.submit}>
			<CornerDownLeft class="size-4" aria-hidden="true" />
		</button>
	</div>
	{#if outcome}
		<div class="p1-actions after">
			<p class="note">{outcome.note}</p>
			<Button bind:ref={cont} variant="secondary" size="sm" onclick={() => outcome && done(outcome)}>{labels.cont}</Button>
		</div>
	{/if}
</div>

<style>
.inline-row {
	flex-wrap: nowrap;
}
.fix-in {
	flex: 1;
	min-width: 0;
	height: 40px;
	padding: 0 12px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--field-strong);
	color: var(--ink);
	font: inherit;
	font-size: 15px;
	transition:
		background-color 0.25s ease,
		border-color 0.25s ease,
		box-shadow 0.15s;
}
.fix-in:focus {
	outline: 0;
	box-shadow: inset 0 2px 0 var(--red);
}
.fix-in.right {
	background: var(--right-bg);
	border-color: var(--right-line);
}
.fix-in.wrong {
	background: var(--wrong-bg);
	border-color: var(--wrong-line);
}
.after {
	flex-direction: column;
	align-items: flex-start;
	margin-top: 10px;
	animation: p1-in 0.5s ease both;
}
.note {
	margin: 0;
}
@media (pointer: coarse) {
	.fix-in {
		height: 44px;
		font-size: 16px;
	}
}
</style>
