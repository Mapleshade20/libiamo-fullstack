<script lang="ts">
import CornerDownRight from "@lucide/svelte/icons/corner-down-right";
import Plus from "@lucide/svelte/icons/plus";
import X from "@lucide/svelte/icons/x";
import { autogrow } from "#lib/components/common/motion.ts";
import { tip } from "#lib/components/common/tip.ts";
import Button from "#lib/components/ui/button/button.svelte";
import type { Situation } from "#lib/demo/scenarios.ts";

/*
 * What the learner finds when they arrive, in the place's terms (the main app's opening state): a Reddit post and its
 * comment tree, an email with its headers, a chat's messages, an AO3 chapter's end. Who is there is the editor's
 * People list, not repeated here. Times are written as the
 * place shows them. The situation object is edited in place.
 */
let { s, lang }: { s: Situation; lang: string } = $props();

type Comment = Extract<Situation, { kind: "reddit" }>["comments"][number];
/** A reply goes right after its parent's last descendant, one level deeper. */
function reply(list: Comment[], at: number) {
	const depth = (list[at].depth ?? 0) + 1;
	let end = at + 1;
	while (end < list.length && (list[end].depth ?? 0) >= depth) end++;
	list.splice(end, 0, { author: "", body: "", depth });
}
/** Removing a comment takes its replies with it. */
function drop(list: Comment[], at: number) {
	const depth = list[at].depth ?? 0;
	let end = at + 1;
	while (end < list.length && (list[end].depth ?? 0) > depth) end++;
	list.splice(at, end - at);
}
</script>

<div class="adm-grid op">
	{#if s.kind === "ao3"}
		<label class="adm-field"><span class="l">Work</span><input class="adm-input" bind:value={s.work} {lang}></label>
		<label class="adm-field"><span class="l">Author</span><input class="adm-input" bind:value={s.author}></label>
		<label class="adm-field full"><span class="l">Chapter</span><input class="adm-input" bind:value={s.chapter} {lang}></label>
		<label class="adm-field full"
			><span class="l">Excerpt</span><textarea class="adm-input" rows="4" use:autogrow={s.excerpt} bind:value={s.excerpt} {lang}></textarea></label
		>
		<label class="adm-field full"
			><span class="l">Author's note</span><textarea class="adm-input" rows="2" use:autogrow={s.note} bind:value={s.note} {lang}></textarea></label
		>
	{:else if s.kind === "reddit"}
		{@const r = s}
		<label class="adm-field"><span class="l">Subreddit</span><input class="adm-input" bind:value={r.sub} placeholder="languagelearning"></label>
		<div class="adm-grid pair">
			<label class="adm-field"><span class="l">Posted by</span><input class="adm-input" bind:value={r.author}></label>
			<label class="adm-field"><span class="l">When</span><input class="adm-input" bind:value={r.time} placeholder="2 hr. ago"></label>
		</div>
		<label class="adm-field full"><span class="l">Title</span><input class="adm-input" bind:value={r.title} {lang}></label>
		<label class="adm-field full"
			><span class="l">Post</span><textarea class="adm-input" rows="4" use:autogrow={r.body} bind:value={r.body} {lang}></textarea></label
		>
		<div class="adm-field full">
			<span class="l">Comments</span>
			<ul class="tree">
				{#each r.comments as c, i (i)}
					<li class="node" style:--depth={c.depth ?? 0}>
						<div class="head">
							<input class="adm-input who" bind:value={c.author} aria-label="Author" placeholder="u/someone">
							<input class="adm-input when" bind:value={c.time} aria-label="When" placeholder="1 hr. ago">
							<span class="grow"></span>
							<button
								type="button"
								class="adm-icon"
								aria-label="Reply to {c.author || "this comment"}"
								use:tip={"Reply"}
								onclick={() => reply(r.comments, i)}
							>
								<CornerDownRight class="size-4" aria-hidden="true" />
							</button>
							<button
								type="button"
								class="adm-icon"
								aria-label="Remove {c.author || "this comment"} and its replies"
								use:tip={"Remove, with its replies"}
								onclick={() => drop(r.comments, i)}
							>
								<X class="size-4" aria-hidden="true" />
							</button>
						</div>
						<textarea class="adm-input" rows="1" use:autogrow={c.body} bind:value={c.body} aria-label="Comment" {lang}></textarea>
					</li>
				{/each}
			</ul>
			<div>
				<Button variant="ghost" size="sm" onclick={() => r.comments.push({ author: "", body: "", depth: 0 })}
					><Plus aria-hidden="true" />Add a comment</Button
				>
			</div>
		</div>
	{:else if s.kind === "email"}
		<label class="adm-field"><span class="l">From</span><input class="adm-input" bind:value={s.from} placeholder="Prof. Hannah Lin"></label>
		<label class="adm-field"><span class="l">To</span><input class="adm-input" bind:value={s.to} placeholder="the learner"></label>
		<label class="adm-field"><span class="l">Subject</span><input class="adm-input" bind:value={s.subject} {lang}></label>
		<label class="adm-field"><span class="l">When</span><input class="adm-input" bind:value={s.time} placeholder="14:30"></label>
		<label class="adm-field full"
			><span class="l">Email</span><textarea class="adm-input" rows="5" use:autogrow={s.body} bind:value={s.body} {lang}></textarea></label
		>
	{:else if s.kind === "chat"}
		{@const c = s}
		<label class="adm-field full"
			><span class="l">Channel or chat</span><input class="adm-input" bind:value={c.place} placeholder="#book-club"></label
		>
		<div class="adm-field full">
			<span class="l">Messages</span>
			{#each c.messages as m, i (i)}
				<div class="msg">
					<input class="adm-input who" bind:value={m.author} aria-label="Sender" placeholder="Sender">
					<textarea class="adm-input" rows="1" use:autogrow={m.text} bind:value={m.text} aria-label="Message" {lang}></textarea>
					<input class="adm-input when" bind:value={m.time} aria-label="When" placeholder="21:04">
					<button type="button" class="adm-icon" aria-label="Remove message" onclick={() => c.messages.splice(i, 1)}>
						<X class="size-4" aria-hidden="true" />
					</button>
				</div>
			{/each}
			<div>
				<Button variant="ghost" size="sm" onclick={() => c.messages.push({ author: "", text: "" })}><Plus aria-hidden="true" />Add a message</Button>
			</div>
		</div>
	{/if}
</div>

<style>
.pair {
	gap: 14px 12px;
}
.grow {
	flex: 1;
}
.tree {
	display: grid;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}
/* A reply sits under its parent, a step in, with a thread line. */
.node {
	display: grid;
	gap: 6px;
	margin-left: calc(var(--depth) * 22px);
	padding-left: calc(min(var(--depth), 1) * 12px);
	border-left: calc(min(var(--depth), 1) * 2px) solid var(--line-soft);
}
.head {
	display: flex;
	align-items: center;
	gap: 6px;
}
.who {
	flex: 0 1 12rem;
	height: 34px;
}
.when {
	flex: 0 1 7rem;
	height: 34px;
	font-size: 13px;
}
.msg {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}
.msg textarea {
	flex: 1;
	min-height: 40px;
}
.msg .who,
.msg .when {
	height: 40px;
}
.msg .adm-icon {
	margin-top: 4px;
}
@container (max-width: 560px) {
	.msg {
		flex-wrap: wrap;
	}
	.msg .who {
		flex: 1 1 60%;
	}
	.msg textarea {
		flex: 1 1 100%;
		order: 3;
	}
	.node {
		margin-left: calc(var(--depth) * 12px);
	}
}
</style>
