<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import { tick } from "svelte";
import TwoStep from "#lib/components/common/TwoStep.svelte";
import { tip } from "#lib/components/common/tip.ts";
import Button from "#lib/components/ui/button/button.svelte";
import type { Session } from "#lib/session/session.svelte.ts";
import Disc from "./Disc.svelte";

/*
 * The reply bar, pinned under the conversation: where the learner acts. It keeps its height; after they act it only
 * dims, and it changes to the next step once the conversation above has finished changing, so the two never move at
 * the same time. Quick replies, a composer, buttons and links, as the step asks.
 */
let { session }: { session: Session } = $props();
const bar = $derived(session.bar);
const spec = $derived(bar.spec);
let text = $state("");
let ta: HTMLTextAreaElement | null = $state(null);
const people = $derived(session.people());

function grow() {
	if (!ta) return;
	ta.style.height = "30px";
	ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}
// A new step: the composer starts from what the step gives it and takes the focus.
$effect(() => {
	void bar.n;
	text = spec?.value ?? "";
	tick().then(() => {
		grow();
		if (ta && spec?.compose) {
			ta.focus({ preventScroll: true });
			// A ⟨placeholder⟩ left for the learner to fill is selected, so typing replaces it; otherwise the caret goes to the end.
			const ph = ta.value.match(/⟨[^⟩]*⟩/);
			if (ph?.index !== undefined) ta.setSelectionRange(ph.index, ph.index + ph[0].length);
			else ta.setSelectionRange(ta.value.length, ta.value.length);
		}
	});
});
function send() {
	const t = text.trim();
	if (!t) {
		session.toast(session.tt("writeSomething"));
		ta?.focus({ preventScroll: true });
		return;
	}
	session.reply({ v: "send", text: t });
}
</script>

{#snippet ways(inline = false)}
	<span class="p1-links" class:inline
		>{#each spec?.links ?? [] as l}
			{#if l.confirm}
				<TwoStep class="p1-link" label={l.label} confirm={l.confirm} onconfirm={() => session.reply({ v: l.v, typed: text })} />
			{:else}
				<button type="button" class="p1-link" onclick={() => session.reply({ v: l.v, typed: text })}>{l.label}</button>
			{/if}
		{/each}</span
	>
{/snippet}

<div class="dockbar" class:waiting={bar.waiting} class:out={bar.out}>
	{#if spec}
		<div class="bar-in">
			<!-- The ways out (a hint, the answer, leaving it) sit at the right, above the field: never under its send key. -->
			{#if spec.compose && spec.links?.length}
				{@render ways()}
			{/if}
			{#if spec.quick}
				<div class="quick">
					{#each spec.quick as q}
						{#if q.confirm}
							<TwoStep class="pill" label={q.label} confirm={q.confirm} onconfirm={() => session.reply({ v: q.v })} />
						{:else}
							<button type="button" class="pill" onclick={() => session.reply({ v: q.v })}>{q.label}</button>
						{/if}
					{/each}
				</div>
			{/if}
			{#if spec.compose}
				<div class="composer">
					<span class="who"><Disc icon="person" color={people.me.color} /></span>
					<div class="box">
						<textarea
							bind:this={ta}
							bind:value={text}
							rows="1"
							placeholder={spec.compose}
							spellcheck="false"
							readonly={bar.waiting}
							oninput={() => (grow(), spec.onInput?.(text))}
							onkeydown={(e) => {
								if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
									e.preventDefault();
									send();
								}
							}}
						></textarea>
						<button type="button" class="send key small" onclick={send} use:tip={session.tt("send")}>
							<ArrowUp class="size-4" aria-hidden="true" />
						</button>
					</div>
				</div>
			{/if}
			{#if spec.buttons}
				<div class="bar-row">
					{#each spec.buttons as b}
						<Button variant={b.primary ? "default" : "secondary"} onclick={() => session.reply({ v: b.v })}>{b.label}</Button>
					{/each}
					{#if spec.links?.length}
						{@render ways(true)}
					{/if}
				</div>
			{:else if spec.links?.length && !spec.compose}
				{@render ways()}
			{/if}
		</div>
	{/if}
</div>

<style>
.dockbar {
	flex: none;
	min-height: 100px;
	padding: 10px 2px calc(14px + env(safe-area-inset-bottom));
	border-top: 1px solid var(--line);
}
.bar-in {
	transition: opacity 0.4s ease;
}
.waiting .bar-in {
	opacity: 0.45;
	pointer-events: none;
	transition-duration: 0.5s;
}
.out .bar-in {
	opacity: 0;
	transition-duration: 0.25s;
}
.quick {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.quick :global(.pill) {
	min-height: 36px;
	padding: 6px 14px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised-face);
	box-shadow: var(--raised-shadow);
	color: var(--ink);
	cursor: pointer;
	font-size: 14px;
	line-height: 1.4;
	text-align: start;
	transition:
		translate 0.15s,
		box-shadow 0.15s;
}
.quick :global(.pill):hover {
	translate: 0 -1px;
}
.quick :global(.pill):active {
	translate: 0 1px;
	box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.12);
}
.composer {
	display: flex;
	gap: 10px;
	align-items: flex-end;
}
.who {
	flex: none;
	margin-bottom: 5px;
}
.box {
	flex: 1;
	display: flex;
	align-items: flex-end;
	gap: 8px;
	border: 1px solid var(--line);
	border-radius: 6px;
	padding: 5px 6px 5px 12px;
	background: var(--field-strong);
	transition: box-shadow 0.15s;
}
.box:focus-within {
	box-shadow: inset 0 2px 0 var(--red);
}
textarea {
	flex: 1;
	border: 0;
	outline: none;
	resize: none;
	padding: 5px 0;
	height: 30px;
	max-height: 120px;
	font: 15.5px / 1.3 var(--font-sans-stack);
	background: transparent;
	color: var(--ink);
}
.bar-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}
.bar-in > .p1-links {
	margin-bottom: 4px;
}
.bar-in > .p1-links:not(:first-child) {
	margin: 6px 0 0;
}
@media (pointer: coarse) {
	.dockbar {
		min-height: 110px;
	}
	.quick :global(.pill) {
		min-height: 40px;
	}
}
</style>
