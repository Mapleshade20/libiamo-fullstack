<script lang="ts">
import { type CapturedMessage, parseCapture } from "#lib/admin/capture.ts";
import { fmtDay, langEn } from "#lib/admin/records.ts";
import Accordion from "#lib/components/common/Accordion.svelte";
import type { SuggestionPlace } from "#lib/constants.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import type { InboxSuggestion } from "#lib/server/admin/inbox.ts";

/*
 * A learner's suggested situation as the admin reads it: who sent it and where, what happened (a page capture as its
 * conversation, never its JSON), whom they were writing to, what they wanted to do and what they wrote.
 */
let { s }: { s: Omit<InboxSuggestion, "scenario"> } = $props();
const capture = $derived(parseCapture(s.situation));
const placeName = (p: string) => (p === "other" ? "Elsewhere" : SITE_OF[p as Exclude<SuggestionPlace, "other">]);
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const summary = $derived.by(() => {
	if (!capture) return "";
	const n = capture.messages.length;
	if (capture.platform === "reddit") return `r/${capture.post.subreddit} · “${capture.post.title}” · ${count(n, "comment")}`;
	if (capture.platform === "ao3") return `AO3 · “${capture.work.title}” · ${count(n, "comment")}`;
	return `#${capture.channelName} · ${count(n, "message")}`;
});
/** How deep each message sits under what it answers (a thread's replies are indented). */
const depth = $derived.by(() => {
	const parent = new Map(capture?.messages.map((m) => [m.id, m.parent]));
	const of = (m: CapturedMessage) => {
		let d = 0;
		for (let p = m.parent; p && parent.has(p) && d < 6; p = parent.get(p) ?? null) d++;
		return d;
	};
	return new Map(capture?.messages.map((m) => [m.id, of(m)]));
});
</script>

<div class="who">
	<span>{s.by}</span><span class="adm-dot">{placeName(s.place)}</span><span class="adm-dot">{langEn(s.language)}</span><span class="grow"></span
	><span class="adm-meta">{fmtDay(s.at)}</span>
</div>
{#if capture}
	<div class="capture">
		<Accordion variant="plain" title={summary}>
			<div class="thread" lang={s.language}>
				{#if capture.platform === "reddit"}
					<p class="op"><b>{capture.post.title}</b> <span class="by">u/{capture.post.author}</span></p>
					{#if capture.post.body}
						<p class="body">{capture.post.body}</p>
					{/if}
				{:else if capture.platform === "ao3"}
					<p class="op"><b>{capture.work.title}</b> <span class="by">{capture.work.author ?? ""}</span></p>
					{#if capture.work.summary}
						<p class="body">{capture.work.summary}</p>
					{/if}
				{/if}
				{#each capture.messages as m (m.id)}
					<p class="msg" style:--d={depth.get(m.id) ?? 0}><span class="by">{m.author}</span> {m.text}</p>
				{/each}
			</div>
		</Accordion>
	</div>
{:else}
	<p class="sit" lang={s.language}>{s.situation}</p>
{/if}
<dl>
	{#if s.who}
		<dt>Writing to</dt>
		<dd lang={s.language}>{s.who}</dd>
	{/if}
	<dt>Wanted to</dt>
	<dd lang={s.language}>{s.purpose}</dd>
	{#if s.mine}
		<dt>Wrote</dt>
		<dd class="mine" lang={s.language}>{s.mine}</dd>
	{/if}
</dl>

<style>
.who {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	color: var(--muted);
	font-size: 13px;
}
.grow {
	flex: 1;
}
.sit {
	max-height: 24em;
	margin: 8px 0 10px;
	overflow: auto;
	font-size: 15.5px;
	line-height: 1.6;
	white-space: pre-wrap;
}
.capture {
	margin: 4px 0 8px;
}
.thread {
	display: grid;
	gap: 6px;
	max-height: 28em;
	overflow: auto;
	font-size: 14px;
	line-height: 1.55;
}
.thread p {
	margin: 0;
	white-space: pre-wrap;
}
.body {
	color: var(--ink-2);
}
.msg {
	padding-left: calc(var(--d) * 14px);
}
.by {
	color: var(--muted);
	font-weight: 500;
}
dl {
	display: grid;
	grid-template-columns: 6rem minmax(0, 1fr);
	gap: 4px 12px;
	margin: 0;
	font-size: 14px;
	line-height: 1.55;
}
dt {
	color: var(--muted);
}
dd {
	margin: 0;
}
.mine {
	font-style: italic;
	color: var(--ink-2);
	white-space: pre-wrap;
}
@container (max-width: 520px) {
	dl {
		grid-template-columns: minmax(0, 1fr);
	}
	dd + dt {
		margin-top: 6px;
	}
}
</style>
