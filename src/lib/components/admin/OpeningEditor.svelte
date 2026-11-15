<script lang="ts">
import CornerDownRight from "@lucide/svelte/icons/corner-down-right";
import Plus from "@lucide/svelte/icons/plus";
import X from "@lucide/svelte/icons/x";
import { dropAt, type FlatComment, replyAt, tagsOf, tagsText } from "#lib/admin/opening-form.ts";
import Checkbox from "#lib/components/common/Checkbox.svelte";
import { autogrow } from "#lib/components/common/motion.ts";
import { tip } from "#lib/components/common/tip.ts";
import Button from "#lib/components/ui/button/button.svelte";
import type { ExchangePlace } from "#lib/constants.ts";

/*
 * What the learner finds when they arrive, in the place's own terms (the opening a place is drawn from): an AO3
 * chapter with its tags, end note and comments; a Reddit post and its comment tree; a mail thread; a Discord channel or
 * DM; an iMessage chat. Who is there is the editor's People list, not repeated here. Times are written as the place
 * shows them. The opening (and, on a thread, the flat comment list) is edited in place.
 */
// biome-ignore lint/suspicious/noExplicitAny: the opening's shape follows the place; fields are bound directly and the server validates it whole on save
type Rec = Record<string, any>;
let { place, opening, comments, lang }: { place: ExchangePlace; opening: Rec; comments: FlatComment[]; lang: string } = $props();
const TAGS: [string, string][] = [
	["fandoms", "Fandoms"],
	["relationships", "Relationships"],
	["characters", "Characters"],
	["additionalTags", "Additional tags"],
];
</script>

{#snippet thread(placeholder: string)}
	<div class="adm-field full">
		<span class="l">Comments</span>
		<ul class="tree">
			{#each comments as c, i (i)}
				<li class="node" style:--depth={c.depth}>
					<div class="head">
						<input class="adm-input who" bind:value={c.author} aria-label="Author" {placeholder}>
						<input class="adm-input when" bind:value={c.time} aria-label="When" placeholder="1 hr. ago">
						<span class="grow"></span>
						<button
							type="button"
							class="adm-icon"
							aria-label="Reply to {c.author || "this comment"}"
							use:tip={"Reply"}
							onclick={() => replyAt(comments, i)}
						>
							<CornerDownRight class="size-4" aria-hidden="true" />
						</button>
						<button
							type="button"
							class="adm-icon"
							aria-label="Remove {c.author || "this comment"} and its replies"
							use:tip={"Remove, with its replies"}
							onclick={() => dropAt(comments, i)}
						>
							<X class="size-4" aria-hidden="true" />
						</button>
					</div>
					<textarea class="adm-input" rows="1" use:autogrow={c.text} bind:value={c.text} aria-label="Comment" {lang}></textarea>
				</li>
			{/each}
		</ul>
		<div>
			<Button variant="ghost" size="sm" onclick={() => comments.push({ author: "", text: "", depth: 0 })}
				><Plus aria-hidden="true" />Add a comment</Button
			>
		</div>
	</div>
{/snippet}

<div class="adm-grid op">
	{#if place === "ao3"}
		<label class="adm-field"><span class="l">Work</span><input class="adm-input" bind:value={opening.workTitle} {lang}></label>
		<label class="adm-field"><span class="l">Author</span><input class="adm-input" bind:value={opening.authorName}></label>
		<label class="adm-field full"><span class="l">Chapter</span><input class="adm-input" bind:value={opening.chapterTitle} {lang}></label>
		{#each TAGS as [key, label] (key)}
			<label class="adm-field"
				><span class="l">{label}</span>
				<input
					class="adm-input"
					value={tagsText(opening[key])}
					oninput={(e) => (opening[key] = tagsOf(e.currentTarget.value))}
					placeholder="Separated by commas"
				></label
			>
		{/each}
		<label class="adm-field full"
			><span class="l">Summary</span
			><textarea class="adm-input" rows="2" use:autogrow={opening.summary} bind:value={opening.summary} {lang}></textarea></label
		>
		<label class="adm-field full"
			><span class="l">Excerpt</span
			><textarea class="adm-input" rows="4" use:autogrow={opening.bodyExcerpt} bind:value={opening.bodyExcerpt} {lang}></textarea></label
		>
		<label class="adm-field full"
			><span class="l">Author's note</span
			><textarea class="adm-input" rows="2" use:autogrow={opening.endNote} bind:value={opening.endNote} {lang}></textarea></label
		>
		{@render thread("username")}
	{:else if place === "reddit"}
		{@const post = opening.post}
		<label class="adm-field"
			><span class="l">Subreddit</span><input class="adm-input" bind:value={post.subreddit} placeholder="languagelearning"></label
		>
		<div class="adm-grid pair">
			<label class="adm-field"><span class="l">Posted by</span><input class="adm-input" bind:value={post.author}></label>
			<label class="adm-field"><span class="l">When</span><input class="adm-input" bind:value={post.timestamp} placeholder="2 hr. ago"></label>
		</div>
		<label class="adm-field full"><span class="l">Title</span><input class="adm-input" bind:value={post.title} {lang}></label>
		<label class="adm-field full"
			><span class="l">Post</span><textarea class="adm-input" rows="4" use:autogrow={post.body} bind:value={post.body} {lang}></textarea></label
		>
		{@render thread("u/someone")}
	{:else if place === "email"}
		<div class="adm-field full">
			<span class="l">The thread, oldest first</span>
			{#each opening.emails as m, i (i)}
				<div class="mail">
					<div class="adm-grid pair">
						<label class="adm-field"><span class="l">From</span><input class="adm-input" bind:value={m.from} placeholder="Prof. Hannah Lin"></label>
						<label class="adm-field"><span class="l">To</span><input class="adm-input" bind:value={m.to} placeholder="the learner"></label>
						<label class="adm-field"><span class="l">Subject</span><input class="adm-input" bind:value={m.subject} {lang}></label>
						<label class="adm-field"><span class="l">When</span><input class="adm-input" bind:value={m.time} placeholder="14:30"></label>
					</div>
					<label class="adm-field"
						><span class="l">Email</span><textarea class="adm-input" rows="5" use:autogrow={m.body} bind:value={m.body} {lang}></textarea></label
					>
					{#if opening.emails.length > 1}
						<div>
							<Button variant="ghost" size="sm" onclick={() => opening.emails.splice(i, 1)}><X aria-hidden="true" />Remove this email</Button>
						</div>
					{/if}
				</div>
			{/each}
			<div>
				<Button variant="ghost" size="sm" onclick={() => opening.emails.push({ from: "", to: "", subject: "", body: "" })}
					><Plus aria-hidden="true" />Add an email</Button
				>
			</div>
		</div>
	{:else}
		{#if place === "discord"}
			<!-- biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders a native checkbox inside the label -->
			<label class="adm-field full check"
				><Checkbox bind:checked={() => !!opening.dm, (v) => (opening.dm = v || undefined)} />
				<span>A direct message with the first person</span></label
			>
			{#if !opening.dm}
				<label class="adm-field"
					><span class="l">Server</span><input class="adm-input" bind:value={opening.serverName} placeholder="Readers' Corner"></label
				>
				<label class="adm-field"
					><span class="l">Channel</span><input class="adm-input" bind:value={opening.channelName} placeholder="book-club"></label
				>
			{/if}
		{:else}
			<label class="adm-field full"
				><span class="l">Group name</span>
				<input class="adm-input" bind:value={opening.groupName} placeholder="None: a conversation with the first person"></label
			>
		{/if}
		<div class="adm-field full">
			<span class="l">Messages</span>
			{#each opening.previousMessages as m, i (i)}
				<div class="msg">
					<input class="adm-input who" bind:value={m.sender} aria-label="Sender" placeholder="Sender">
					<textarea class="adm-input" rows="1" use:autogrow={m.text} bind:value={m.text} aria-label="Message" {lang}></textarea>
					{#if place === "discord"}
						<input class="adm-input when" bind:value={m.timestamp} aria-label="When" placeholder="21:04">
					{/if}
					<button type="button" class="adm-icon" aria-label="Remove message" onclick={() => opening.previousMessages.splice(i, 1)}>
						<X class="size-4" aria-hidden="true" />
					</button>
				</div>
			{/each}
			<div>
				<Button variant="ghost" size="sm" onclick={() => opening.previousMessages.push({ sender: "", text: "" })}
					><Plus aria-hidden="true" />Add a message</Button
				>
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
.mail {
	display: grid;
	gap: 10px;
	padding-bottom: 12px;
	border-bottom: 1px solid var(--line-soft);
}
.check {
	flex-direction: row;
	align-items: center;
	gap: 8px;
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
