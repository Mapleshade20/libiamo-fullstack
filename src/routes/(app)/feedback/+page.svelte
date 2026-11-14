<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Bug from "@lucide/svelte/icons/bug";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import { autogrow, shake } from "$lib/components/common/motion";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import { tip } from "$lib/components/common/tip";
import EmptyState from "$lib/components/shell/EmptyState.svelte";
import { tx } from "$lib/demo/app.svelte";

/*
 * Feedback about Libiamo itself: what it is about (an idea, something wrong, anything else) and a box, sent like a
 * message. The app is young and shaped by what learners tell us, so this sits in the account menu, one click away.
 * (The demo keeps nothing; the main app would file it with the page and browser it came from.)
 */
let kind = $state("idea");
let text = $state("");
let sent = $state(false);
let box: HTMLElement | undefined = $state();
let area: HTMLTextAreaElement | undefined = $state();
function send(e: SubmitEvent) {
	e.preventDefault();
	if (!text.trim()) {
		shake(box);
		area?.focus();
		return;
	}
	sent = true;
	text = "";
}
onMount(() => {
	document.title = `${tx("navFeedback")} · ${tx("homeTitle")}`;
	area?.focus();
});
</script>

<main class="sheet">
	<h1>{tx("navFeedback")}</h1>
	{#if sent}
		<div in:fly={{ y: 8, duration: 250 }}>
			<EmptyState art="pen" title={tx("fbkThanks")} action={{ label: tx("fbkMore"), onclick: () => (sent = false) }} />
		</div>
	{:else}
		<form class="fb" onsubmit={send}>
			<SegmentedControl
				label={tx("fbkKind")}
				bind:value={kind}
				items={[
					{ value: "idea", label: tx("fbkIdea"), icon: Lightbulb },
					{ value: "bug", label: tx("fbkBug"), icon: Bug },
					{ value: "other", label: tx("fbkOther"), icon: MessageCircle },
				]}
			/>
			<div class="box" bind:this={box}>
				<textarea
					bind:this={area}
					bind:value={text}
					use:autogrow={text}
					rows="5"
					placeholder={tx(kind === "bug" ? "fbkPhBug" : kind === "idea" ? "fbkPhIdea" : "fbkPhOther")}
					aria-label={tx("navFeedback")}
				></textarea>
				<div class="bar">
					<button type="submit" class="go" disabled={!text.trim()} use:tip={tx("send")}>
						<ArrowUp class="size-[17px]" strokeWidth={2.4} aria-hidden="true" />
					</button>
				</div>
			</div>
		</form>
	{/if}
</main>

<style>
.fb {
	display: grid;
	gap: 14px;
	justify-items: start;
	margin-top: 18px;
}
.box {
	width: 100%;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--raised);
	box-shadow: var(--shadow);
	transition:
		border-color 150ms,
		box-shadow 150ms;
}
.box:focus-within {
	border-color: color-mix(in srgb, var(--ink) 24%, transparent);
}
textarea {
	display: block;
	width: 100%;
	min-height: 140px;
	max-height: 50vh;
	padding: 16px 18px 4px;
	border: 0;
	outline: 0;
	resize: none;
	background: none;
	color: var(--ink);
	font: 16px / 1.6 var(--font-sans-stack);
}
textarea::placeholder {
	color: var(--muted);
}
.bar {
	display: flex;
	justify-content: flex-end;
	padding: 6px 10px 10px;
}
.go {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: 6px;
	background: var(--ink);
	color: var(--bg);
	cursor: pointer;
	transition:
		opacity 150ms,
		scale 150ms;
}
.go:disabled {
	opacity: 0.3;
	cursor: default;
}
.go:active:not(:disabled) {
	scale: 0.97;
}
.go:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
@media (pointer: coarse) {
	.go {
		width: 44px;
		height: 44px;
	}
}
</style>
