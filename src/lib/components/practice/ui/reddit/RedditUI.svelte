<script lang="ts">
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Search from "@lucide/svelte/icons/search";
import { SvelteSet } from "svelte/reactivity";
import FinishSheet from "$lib/components/practice/session/FinishSheet.svelte";
import { createPracticeSession, type PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import UnavailableNotice from "$lib/components/practice/session/UnavailableNotice.svelte";
import { buildCommentThread, countComments, getThreadOwner, newCommentMetadata, type ThreadComment } from "$lib/practice/comment-thread";
import CommentEditor from "./CommentEditor.svelte";
import CommentTree from "./CommentTree.svelte";
import CommunityPanel from "./CommunityPanel.svelte";
import Header from "./Header.svelte";
import { i18n } from "./i18n";
import PostCard from "./PostCard.svelte";
import Sidebar from "./Sidebar.svelte";
import type { RedditOpeningState } from "./types";

let props: PracticeSurfaceProps = $props();

const t = $derived(i18n[props.language] ?? i18n.en);
const opening = $derived((props.openingState ?? {}) as RedditOpeningState);
const post = $derived({
	title: opening.post?.title || "Untitled Post",
	body: opening.post?.body || "",
	subreddit: opening.post?.subreddit || "AskReddit",
	author: getThreadOwner("reddit", props.openingState),
	votes: opening.post?.votes ?? 1,
});
const session = createPracticeSession(() => props, { fallbackAgentName: () => post.author });
const comments = $derived(buildCommentThread("reddit", props.openingState, session.messages));
// The post is the root every hint's reply context starts from.
const postContext = $derived([{ author: post.author, text: post.body || post.title }]);

let showMobileMenu = $state(false);
// Owned here, not by each comment, so a nested thread stays collapsed when an ancestor is re-expanded.
const collapsed = new SvelteSet<string>();
let notice = $state<UnavailableNotice>();
const mock = () => notice?.show();

function sendComment(text: string, target: ThreadComment | null) {
	return session.send(text, {
		fields: target ? { threadTargetCommentId: target.id } : {},
		thread: (clientMessageId) => newCommentMetadata("reddit", clientMessageId, target, props.openingState),
	});
}
</script>

<div class="practice-surface fixed inset-0 z-[999] flex flex-col bg-white font-inter-stack text-[#1C1C1C]">
	<UnavailableNotice bind:this={notice} language={props.language} class="border border-[#EDEFF1] bg-white text-[#1C1C1C]" />
	<Header {session} language={props.language} {t} onMockAction={mock} onToggleMobileMenu={() => (showMobileMenu = !showMobileMenu)} />

	<div class="flex flex-1 overflow-hidden">
		<Sidebar
			{t}
			returnHref={props.returnHref}
			language={props.language}
			subreddit={post.subreddit}
			userName={props.userName}
			avatarUrl={props.avatarUrl}
			{showMobileMenu}
			onCloseMobileMenu={() => (showMobileMenu = false)}
			onMockAction={mock}
		/>

		<div class="flex flex-1 overflow-hidden">
			<div class="flex-1 overflow-y-auto">
				<div class="mx-auto max-w-[740px] px-2 py-3 md:px-3">
					<PostCard {post} commentCount={countComments(comments)} {t} onMockAction={mock} />

					<div class="mb-3">
						<CommentEditor
							{session}
							owner="top-level"
							placeholder={t.joinConversation}
							contextPath={postContext}
							userName={props.userName}
							avatarUrl={props.avatarUrl}
							language={props.language}
							{t}
							onSubmit={(text) => sendComment(text, null)}
						/>
					</div>

					<div class="mb-3 flex items-center gap-2 rounded-md border border-[#CFDBD5] bg-white px-3 py-1">
						<button
							type="button"
							class="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold transition-colors hover:bg-[#F6F7F8] md:min-h-8"
							onclick={mock}
						>
							{t.sortBest}
							<ChevronDown size={14} aria-hidden="true" />
						</button>
						<div class="flex-1"></div>
						<button
							type="button"
							class="flex min-h-11 items-center gap-1.5 rounded-sm px-2 text-xs font-bold text-[#878A8C] transition-colors hover:bg-[#F6F7F8] md:min-h-8"
							onclick={mock}
						>
							<Search size={12} aria-hidden="true" />
							{t.searchComments}
						</button>
					</div>

					{#each comments as comment (comment.id)}
						<CommentTree
							{comment}
							{session}
							{collapsed}
							ancestors={postContext}
							userName={props.userName}
							avatarUrl={props.avatarUrl}
							language={props.language}
							{t}
							onReply={sendComment}
							onMockAction={mock}
						/>
					{/each}
				</div>
			</div>

			<CommunityPanel subreddit={post.subreddit} {t} onMockAction={mock} />
		</div>
	</div>

	<FinishSheet {session} language={props.language} />
</div>

<style>
::-webkit-scrollbar {
	width: 6px;
	height: 6px;
}
::-webkit-scrollbar-thumb {
	background: #ccc;
	border-radius: 4px;
}
:global(.markdown-wrapper p) {
	margin: 0;
	display: inline;
}
</style>
