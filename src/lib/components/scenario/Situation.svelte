<script lang="ts">
import type { Collector } from "#lib/components/collect/collector.svelte.ts";
import type { Situation } from "#lib/demo/scenarios.ts";
import Passage from "./Passage.svelte";

/*
 * What a scenario responds to, in its place's own look (a quieter take on the main app's practice surfaces): an AO3
 * chapter with its author's note, a Reddit post and its comments, an email, a chat, or a text to translate. With a
 * collector every passage is highlightable (phrases kept to the notebook); without one it is plain text.
 */
let { s, lang, collector }: { s: Situation; lang: string; collector?: Collector } = $props();
</script>

{#if s.kind === "ao3"}
	<article class="ao3">
		<header>
			<p class="work">{s.work}</p>
			<p class="by">by <span>{s.author}</span></p>
			<p class="chapter">{s.chapter}</p>
		</header>
		<Passage class="prose" text={s.excerpt} {lang} block="excerpt" {collector} />
		<div class="notes">
			<p class="notes-h">Notes:</p>
			<Passage text={s.note} {lang} block="note" {collector} />
		</div>
	</article>
{:else if s.kind === "reddit"}
	<article class="reddit">
		<p class="sub">r/{s.sub} · <span>Posted by {s.author}</span></p>
		<Passage class="title" text={s.title} {lang} block="title" {collector} />
		<Passage class="body" text={s.body} {lang} block="body" {collector} />
		{#if s.comments.length}
			<ul class="comments">
				{#each s.comments as c, i}
					<li>
						<p class="who">{c.author}</p>
						<Passage text={c.body} {lang} block="c{i}" {collector} />
					</li>
				{/each}
			</ul>
		{/if}
	</article>
{:else if s.kind === "email"}
	<article class="email">
		<dl>
			<dt>From</dt>
			<dd>{s.from}</dd>
			<dt>Subject</dt>
			<dd class="subj">{s.subject}</dd>
		</dl>
		<Passage class="body" text={s.body} {lang} block="mail" {collector} />
	</article>
{:else if s.kind === "chat"}
	<article class="chat">
		<p class="place">{s.place}</p>
		<ul>
			{#each s.messages as m, i}
				<li class:same={i > 0 && s.messages[i - 1].author === m.author}>
					{#if !(i > 0 && s.messages[i - 1].author === m.author)}
						<span class="avatar" aria-hidden="true">{m.author.slice(0, 1).toUpperCase()}</span>
						<p class="who">{m.author}</p>
					{/if}
					<Passage class="msg" text={m.text} {lang} block="m{i}" {collector} />
				</li>
			{/each}
		</ul>
	</article>
{:else if s.kind === "translate"}
	<article class="translate">
		<p class="brief">{s.brief}</p>
		<Passage class="source" text={s.source} lang={s.sourceLang} block="source" {collector} />
	</article>
{/if}

<style>
article {
	font-size: 15px;
	line-height: 1.65;
	color: var(--ink);
}
/* AO3: Georgia-ish body, red-brown work title, the author's note in a quiet box. */
.ao3 header {
	text-align: center;
	margin-bottom: 18px;
}
.work {
	margin: 0;
	font: 500 20px / 1.3 var(--font-serif-stack);
	color: #990000;
}
:global([data-theme="dark"]) .work {
	color: #e07a6c;
}
.by,
.chapter {
	margin: 2px 0 0;
	color: var(--muted);
	font-size: 13.5px;
}
.by span {
	color: #990000;
	text-decoration: underline;
	text-underline-offset: 2px;
}
:global([data-theme="dark"]) .by span {
	color: #e07a6c;
}
.ao3 :global(.prose) {
	font-family: var(--font-serif-stack);
	font-size: 16.5px;
	line-height: 1.75;
}
.notes {
	margin-top: 18px;
	padding: 12px 14px;
	border: 1px solid var(--line);
	border-radius: 6px;
	font-size: 14px;
}
.notes-h {
	margin: 0 0 4px;
	font-weight: 600;
}
/* Reddit: the subreddit line, a bold title, comments threaded by a rule. */
.sub {
	margin: 0 0 6px;
	font-size: 12.5px;
	font-weight: 600;
}
.sub span {
	font-weight: 400;
	color: var(--muted);
}
.reddit :global(.title) {
	font-size: 18px;
	font-weight: 600;
	line-height: 1.35;
	margin-bottom: 8px;
}
.comments {
	list-style: none;
	margin: 16px 0 0;
	padding: 0 0 0 14px;
	border-inline-start: 2px solid var(--line-soft);
}
.comments li + li {
	margin-top: 10px;
}
.who {
	margin: 0;
	font-size: 12.5px;
	font-weight: 600;
	color: var(--ink-2);
}
/* Email: header fields, then the message. */
dl {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 2px 12px;
	margin: 0 0 14px;
	padding-bottom: 12px;
	border-bottom: 1px solid var(--line-soft);
	font-size: 13.5px;
}
dt {
	color: var(--muted);
}
dd {
	margin: 0;
}
.subj {
	font-weight: 600;
}
/* Chat: a channel or a person, messages grouped by author. */
.place {
	margin: 0 0 10px;
	font-weight: 600;
	color: var(--ink-2);
}
.chat ul {
	list-style: none;
	margin: 0;
	padding: 0;
}
.chat li {
	position: relative;
	padding-inline-start: 46px;
	margin-top: 12px;
}
.chat li.same {
	margin-top: 2px;
}
.avatar {
	position: absolute;
	inset-inline-start: 0;
	top: 2px;
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--accent-c) 22%, var(--raised));
	font-size: 14px;
	font-weight: 600;
	color: var(--ink-2);
}
.translate .brief {
	margin: 0 0 10px;
	font-size: 13px;
	color: var(--muted);
}
.translate :global(.source) {
	font-size: 17px;
	line-height: 1.8;
}
</style>
