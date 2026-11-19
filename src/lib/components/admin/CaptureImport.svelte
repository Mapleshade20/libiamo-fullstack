<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Copy from "@lucide/svelte/icons/copy";
import { SvelteSet } from "svelte/reactivity";
import {
	type Capture,
	type CaptureCut,
	type CapturedMessage,
	cutCapture,
	cutProblem,
	joinChatAt,
	OPENING_LIMIT,
	parseCapture,
	withAncestors,
	withDescendants,
} from "#lib/admin/capture.ts";
import Checkbox from "#lib/components/common/Checkbox.svelte";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import type { ExchangePlace } from "#lib/constants.ts";
import type { ExchangeVersion } from "#lib/scenario/versions.ts";
import { sourceStatus } from "#lib/writing/source-status.ts";

/*
 * Importing a page capture into a scenario: the console script for the place (the same scripts learners use for
 * context, from /api/capture-scripts), then the copy pasted here and checked the way the composer checks it
 * (lib/writing/source-status.ts). Then what the learner sees is chosen: in a thread, the comments the opening shows
 * (ticking a reply ticks what it answers); in a chat, the message where the learner comes in, taking its author's
 * place. Import fills the version's opening, its people and what really followed (lib/admin/capture.ts).
 */
let {
	open = $bindable(false),
	site,
	place,
	lang,
	people,
	pasted = $bindable(""),
	onimport,
}: {
	open?: boolean;
	site: string;
	place: ExchangePlace;
	lang: string;
	/** The version's people now, kept by the import when something is written about them (`mergePeople`). */
	people: ExchangeVersion["people"];
	/** What is pasted: the editor may hand in a learner's suggested capture. */
	pasted?: string;
	onimport: (cut: CaptureCut) => void;
} = $props();
const PLATFORMS = [
	{ key: "reddit", label: "Reddit", how: "On the post. Or open the post's address with .json at the end and copy the whole page." },
	{ key: "ao3", label: "AO3", how: "On the chapter whose comments you want (a one-shot's work page is its only chapter)." },
	{ key: "discord", label: "Discord", how: "In the channel, after scrolling up until the history you want is loaded." },
];
const uid = $props.id();
const here = $derived(PLATFORMS.find((p) => p.label === site)?.key);
let scripts: Promise<Record<string, string>> | null = null;
let copied = $state<string | null>(null);
const EN: Record<string, string> = {
	srcFound: "{what}: {n} messages, {w} words.",
	srcText: "Plain text, {w} words: not a capture. Copy it with a script.",
	srcBroken: "This does not read as a capture any more: copy it again with the script.",
};
const en = (key: string, vars: Record<string, string | number> = {}) => (EN[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const status = $derived(sourceStatus(pasted, en));
const capture = $derived<Capture | null>(status.kind === "capture" ? parseCapture(pasted) : null);
const elsewhere = $derived(capture && capture.platform !== place ? PLATFORMS.find((p) => p.key === capture.platform)?.label : undefined);
const usable = $derived(capture && !elsewhere ? capture : null);
const replies = $derived(Map.groupBy(usable?.messages ?? [], (m) => m.parent ?? ""));
const byId = $derived(new Map(usable?.messages.map((m) => [m.id, m])));

// A thread's opening is chosen comment by comment; a chat is joined at one message (none: after the last).
const chosen = new SvelteSet<string>();
let seat = $state<string | undefined>();
$effect(() => {
	void usable;
	chosen.clear();
	seat = undefined;
});
const choice = $derived(usable?.platform === "discord" ? joinChatAt(usable, seat) : { opening: [...chosen] });
const cut = $derived(usable ? cutCapture(usable, choice, lang) : null);
const inOpening = $derived(new Set(choice.opening));
// What the version would not save is refused here, before the editor is changed.
const problem = $derived(cut ? cutProblem(cut, place, people) : null);

async function copyScript(k: string) {
	scripts ??= fetch("/api/capture-scripts").then((r) => r.json());
	await navigator.clipboard?.writeText((await scripts)[k]).catch(() => {});
	// The button says so: a toast would sit under the dialog's backdrop.
	copied = k;
}
/** Ticking a comment brings what it answers along; leaving it out takes its replies with it. */
function tick(m: CapturedMessage, on: boolean) {
	if (!usable) return;
	for (const id of on ? withAncestors(usable, [m.id]) : withDescendants(usable, [m.id])) {
		if (on) chosen.add(id);
		else chosen.delete(id);
	}
}
function tickAll(on: boolean) {
	chosen.clear();
	if (on) for (const m of usable?.messages ?? []) chosen.add(m.id);
}
function done() {
	if (!cut || problem) return;
	onimport(cut);
	open = false;
	pasted = "";
	copied = null;
}
</script>

{#snippet thread(parent: string)}
	<ul class="tree" class:nested={!!parent}>
		{#each replies.get(parent) ?? [] as m (m.id)}
			<li>
				<label class="msg" class:on={chosen.has(m.id)} for="{uid}-{m.id}">
					<Checkbox id="{uid}-{m.id}" checked={chosen.has(m.id)} onchange={(e) => tick(m, e.currentTarget.checked)} />
					<span class="mt"><b>{m.author}</b><span class="tx">{m.text}</span></span>
				</label>
				{@render thread(m.id)}
			</li>
		{/each}
	</ul>
{/snippet}

<ModalDialog bind:open labelledby="cap-h" wide>
	<h2 id="cap-h" class="mb-2">Import a capture</h2>
	<!-- Once a capture is in, the scripts step aside so choosing has the room (and Import stays in view). -->
	{#if !usable}
		<p class="p">On the page, open the console (F12), paste the script and press Enter: the capture is copied. Paste it below.</p>
		<ul class="plats">
			{#each PLATFORMS as p (p.key)}
				<li class:here={here === p.key}>
					<div class="pm"><span class="pl">{p.label}</span><span class="how">{p.how}</span></div>
					<Button variant="secondary" size="sm" onclick={() => copyScript(p.key)}
						>{#if copied === p.key}
							<Check aria-hidden="true" />Copied
						{:else}
							<Copy aria-hidden="true" />Copy script
						{/if}</Button
					>
				</li>
			{/each}
		</ul>
	{/if}
	<textarea
		class="adm-input cap"
		rows={usable ? 2 : 5}
		spellcheck="false"
		bind:value={pasted}
		aria-label="Capture"
		aria-describedby="cap-status"
		placeholder="Paste the capture"
		data-initial-focus
	></textarea>
	<p
		class="status"
		id="cap-status"
		class:bad={status.kind === "broken" || status.kind === "text" || !!elsewhere}
		class:ok={!!usable}
		aria-live="polite"
	>
		{#if elsewhere}
			This is a {elsewhere} capture; this scenario happens on {site}.
		{:else}
			{status.line}
		{/if}
	</p>
	{#if usable?.platform === "discord"}
		<div class="pick">
			<p class="ph">
				Where does the learner come in? They take that person's place: the lines before it open the channel, what follows is what really happened.
			</p>
			<ol class="chat" aria-label="Captured messages">
				{#each usable.messages as m (m.id)}
					{@const answers = m.parent ? byId.get(m.parent) : undefined}
					<li>
						<button
							type="button"
							class="msg line"
							class:seat={m.id === seat}
							class:shown={inOpening.has(m.id)}
							aria-pressed={m.id === seat}
							onclick={() => (seat = seat === m.id ? undefined : m.id)}
						>
							{#if m.id === seat}
								<span class="adm-tag">The learner comes in here</span>
							{/if}
							<span class="mt"
								><b>{m.author}</b>
								{#if answers}
									<span class="re">↪ {answers.author}</span>
								{/if}
								<span class="tx">{m.text}</span></span
							>
						</button>
					</li>
				{/each}
			</ol>
		</div>
	{:else if usable}
		<div class="pick">
			<div class="ph-row">
				<p class="ph">
					Tick the comments the learner sees under the {usable.platform === "ao3" ? "chapter" : "post"}. The rest is what really followed.
				</p>
				<Button variant="ghost" size="sm" onclick={() => tickAll(true)}>All</Button>
				<Button variant="ghost" size="sm" onclick={() => tickAll(false)}>None</Button>
			</div>
			<section class="comments" aria-label="Captured comments">
				{@render thread("")}
				{#if !usable.messages.length}
					<p class="none">No comments: the opening is the {usable.platform === "ao3" ? "chapter" : "post"} alone.</p>
				{/if}
			</section>
		</div>
	{/if}
	{#if cut}
		<p class="sum" class:bad={!!problem} role="status">
			{#if usable?.platform === "discord"}
				{inOpening.size} {inOpening.size === 1 ? "line opens" : "lines open"} the channel{seat ? "" : " (the learner comes in after the last)"}
			{:else}
				{inOpening.size}
				of {usable?.messages.length} comments in the opening{!problem && inOpening.size > OPENING_LIMIT
					? ", which makes every reply slower and costlier"
					: ""}
			{/if}
			· {cut.followed.length} followed · {cut.people.length} {cut.people.length === 1 ? "person" : "people"}{problem ? `: ${problem}` : ""}
		</p>
	{/if}
	<div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
		<Button disabled={!cut || !!problem} onclick={done}>Import</Button>
	</div>
</ModalDialog>

<style>
.p {
	margin: 0 0 14px;
	color: var(--muted);
	font-size: 14px;
}
.plats {
	display: grid;
	gap: 6px;
	margin: 0 0 14px;
	padding: 0;
	list-style: none;
}
.plats li {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 10px 10px 12px;
	border-radius: 6px;
	background: var(--well);
}
.plats li.here {
	box-shadow: inset 0 0 0 1px var(--line);
}
.pm {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
}
.pl {
	font-size: 14px;
	font-weight: 500;
}
.how {
	color: var(--muted);
	font-size: 12.5px;
	line-height: 1.45;
}
.cap {
	font:
		12px / 1.5 ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
}
.status {
	min-height: 1.4em;
	margin: 6px 0 0;
	color: var(--muted);
	font-size: 13px;
}
.status.ok {
	color: var(--ok);
}
.status.bad {
	color: var(--bad);
}
.pick {
	margin-top: 12px;
}
.ph-row {
	display: flex;
	align-items: center;
	gap: 4px;
}
.ph {
	flex: 1;
	margin: 0 0 8px;
	color: var(--muted);
	font-size: 13px;
	line-height: 1.45;
}
.ph-row .ph {
	margin: 0;
}
.comments,
.chat {
	max-height: min(22rem, 45vh);
	margin: 8px 0 0;
	padding: 4px;
	overflow-y: auto;
	border-radius: 6px;
	background: var(--well);
	list-style: none;
}
.tree {
	margin: 0;
	padding: 0;
	list-style: none;
}
.tree.nested {
	margin-left: 18px;
	padding-left: 8px;
	border-left: 1px solid var(--line);
}
.msg {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	width: 100%;
	min-height: 40px;
	padding: 7px 8px;
	border-radius: 5px;
	font-size: 13px;
	text-align: left;
	cursor: pointer;
	transition: background-color 120ms;
}
.msg:hover {
	background: color-mix(in oklch, var(--ink) 4%, transparent);
}
.msg.on,
.msg.seat {
	background: color-mix(in oklch, var(--ink) 7%, transparent);
}
.msg.line {
	flex-direction: column;
	gap: 4px;
	border-left: 3px solid transparent;
}
.msg.line.shown {
	border-left-color: color-mix(in oklch, var(--ink) 25%, transparent);
}
.msg.line.seat {
	border-left-color: var(--ink);
}
.msg :global(.cbox) {
	margin-top: 1px;
}
.mt {
	display: flex;
	flex-direction: column;
	min-width: 0;
}
.mt b {
	font-weight: 500;
}
.re {
	color: var(--muted);
	font-size: 12px;
}
.tx {
	display: -webkit-box;
	overflow: hidden;
	color: var(--muted);
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
}
.none {
	margin: 0;
	padding: 10px;
	color: var(--muted);
	font-size: 13px;
}
.sum {
	margin: 8px 0 0;
	color: var(--muted);
	font-size: 13px;
}
.sum.bad {
	color: var(--bad);
}
@media (max-width: 480px) {
	.plats li {
		flex-direction: column;
		align-items: stretch;
	}
}
</style>
