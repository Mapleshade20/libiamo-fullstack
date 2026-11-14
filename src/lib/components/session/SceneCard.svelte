<script lang="ts">
import ChoiceGroup from "#lib/components/common/ChoiceGroup.svelte";
import LimitNotice from "#lib/components/common/LimitNotice.svelte";
import { autogrow, shake } from "#lib/components/common/motion.ts";
import Button from "#lib/components/ui/button/button.svelte";
import type { Session } from "#lib/session/session.svelte.ts";

/*
 * The scene card stands where the home page's box stood (the view transition grows one into the other): the draft as
 * the box set it, the notes the learner may add, what the model understood, and how much the passes point out. The
 * server starts pass 1 the moment it knows the scene, so it runs while this card is read. A scenario already knows the
 * place, the reader and the purpose: its card only holds the draft while pass 1 is written.
 */
let { session }: { session: Session } = $props();
const tt = (k: string, v?: Record<string, string | number>) => session.tt(k, v);
const s = $derived(session.scene);
const scenario = $derived(!!session.setup.scenario);
let notes: HTMLTextAreaElement | undefined = $state();
const nameOf = (code: string) => {
	try {
		const n = new Intl.DisplayNames([session.lang], { type: "language" }).of(code === "zh-CN" ? "zh-Hans" : code) ?? code;
		return n.charAt(0).toLocaleUpperCase(session.lang) + n.slice(1);
	} catch {
		return code;
	}
};
async function wrong() {
	const asked = await session.correctScene();
	if (!asked) {
		session.toast(tt("explainFirst"));
		shake(notes);
		notes?.focus();
	}
}
</script>

<section class="scene-card">
	<div class="draft">{session.setup.text}</div>
	{#if scenario}
		<div class="part">
			{#if session.sceneError}
				<LimitNotice kind={session.sceneError.kind} tx={tt} lang={session.lang} onretry={session.sceneError.retry} />
			{:else}
				<span class="wait-dots" role="status" aria-label={tt("generating")}><i></i><i></i><i></i></span>
			{/if}
		</div>
	{:else}
		<div class="part">
			<label class="label" for="scene-notes">{tt("bgOpt")}</label>
			<textarea id="scene-notes" bind:this={notes} bind:value={session.background} rows="2" placeholder={tt("bgPlaceholder")} use:autogrow></textarea>
		</div>
		<div class="part">
			<span class="label">{tt("understood")}</span>
			{#if session.sceneError}
				<LimitNotice kind={session.sceneError.kind} tx={tt} lang={session.lang} onretry={session.sceneError.retry} />
			{:else if s && !session.sceneBusy}
				<dl class="infer">
					<div>
						<dt>{tt("postedOn")}</dt>
						<dd>{s.platform}</dd>
					</div>
					<div>
						<dt>{tt("readers")}</dt>
						<dd>{s.audience}</dd>
					</div>
					<div>
						<dt>{tt("purpose")}</dt>
						<dd>{s.purpose}</dd>
					</div>
					<div>
						<dt>{tt("language")}</dt>
						<dd>{nameOf(session.setup.learner)} → {nameOf(s.target)}</dd>
					</div>
				</dl>
			{:else}
				<span class="wait-dots" role="status" aria-label={tt("generating")}><i></i><i></i><i></i></span>
			{/if}
		</div>
		<div class="part">
			<ChoiceGroup
				name="detail"
				flat
				legend={tt("detail")}
				value={session.detail}
				onValueChange={(v: string) => session.setDetail(v === "needed" ? "needed" : "more")}
				items={[
					{ value: "more", label: tt("detailMore"), description: tt("detailMoreSub") },
					{ value: "needed", label: tt("detailNeeded"), description: tt("detailNeededSub") },
				]}
			/>
		</div>
		<div class="actions">
			<Button disabled={!s || session.sceneBusy} onclick={() => session.begin()}>{tt("start")}</Button>
			<Button variant="secondary" disabled={!s || session.sceneBusy} onclick={wrong}>{tt("wrongScene")}</Button>
		</div>
	{/if}
</section>

<style>
.scene-card {
	background: var(--raised);
	border: 1px solid var(--edge);
	border-radius: 6px;
	padding: 14px 14px 16px 18px;
	box-shadow: var(--paper-lift);
}
/* Set exactly as the home page's box sets the draft (padding, type, a blank line between paragraphs). */
.draft {
	max-height: 24vh;
	overflow: auto;
	padding: 4px 4px 6px 0;
	font-size: 16px;
	line-height: 1.6;
	white-space: pre-wrap;
	overflow-wrap: break-word;
}
.part {
	margin-top: 10px;
	padding-top: 12px;
	border-top: 1px solid var(--line-soft);
}
.label {
	display: block;
	font-size: 13px;
	color: var(--muted);
	margin: 0 0 6px;
}
textarea {
	display: block;
	width: 100%;
	resize: none;
	border: 0;
	border-radius: 6px;
	padding: 8px 10px;
	background: var(--groove);
	box-shadow: var(--groove-shadow);
	color: var(--ink);
	font: 14.5px / 1.6 var(--font-sans-stack);
}
textarea:focus {
	outline: 0;
	box-shadow:
		var(--groove-shadow),
		inset 0 2px 0 var(--red);
}
.infer {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 8px;
	margin: 0;
}
.infer div {
	background: var(--well);
	border-radius: 6px;
	padding: 8px 12px;
	font-size: 14px;
}
.infer dt {
	color: var(--muted);
	font-size: 12px;
}
.infer dd {
	margin: 0;
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 18px;
}
@media (pointer: coarse) {
	textarea {
		font-size: 16px;
	}
}
</style>
