<script module lang="ts">
// Module-level Map: persists collapse state across Svelte component remounts.
// When a parent collapses then expands, children are destroyed then recreated.
// This Map remembers each node's collapse state by a scoped key (sessionId + nodeId).
const collapseStateMap = new Map<string, boolean>();
</script>

<script lang="ts">
import ArrowBigDown from "@lucide/svelte/icons/arrow-big-down";
import ArrowBigUp from "@lucide/svelte/icons/arrow-big-up";
import Gift from "@lucide/svelte/icons/gift";
import MessageSquare from "@lucide/svelte/icons/message-square";
import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
import Share2 from "@lucide/svelte/icons/share-2";
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import CommentEditor from "./CommentEditor.svelte";
// Self-import for recursive rendering
import CommentTree from "./CommentTree.svelte";
import type { CommentTreeNode, ContextComment } from "./types";
import { formatVotes } from "./utils";

let {
	node,
	depth = 0,
	ancestorPath = [] as ContextComment[],
	disabled = false,
	userName = "",
	avatarUrl = "",
	avatarColor = "bg-[#FF4500]",
	agentColor = "bg-[#0079D3]",
	agentAvatarUrl = "",
	agentName = "",
	sessionId = null as number | null,
	t = {} as Record<string, string>,
	language = "en",
	onMockAction = () => {},
	replyingToId = null as string | null,
	isAgentTyping = false,
}: {
	node: CommentTreeNode;
	depth?: number;
	ancestorPath?: ContextComment[];
	disabled?: boolean;
	userName?: string;
	avatarUrl?: string;
	avatarColor?: string;
	agentColor?: string;
	agentAvatarUrl?: string;
	agentName?: string;
	sessionId?: number | null;
	t?: Record<string, string>;
	language?: string;
	onMockAction?: () => void;
	replyingToId?: string | null;
	isAgentTyping?: boolean;
} = $props();

// Collapse state persisted via module-level Map
// Key includes sessionId to prevent cross-session state leakage
const collapseKey = $derived(`${sessionId ?? "no-session"}-${node.id}`);
let collapsed = $state(false);
$effect(() => {
	collapsed = collapseStateMap.get(collapseKey) ?? false;
});
$effect(() => {
	collapseStateMap.set(collapseKey, collapsed);
});

let showReply = $state(false);
let vote = $state<"up" | "down" | null>(null);

// Extended ancestor path for hint context
const extendedPath = $derived<ContextComment[]>([...ancestorPath, { author: node.author, text: node.text }]);

function toggleCollapse() {
	if (!collapsed) showReply = false;
	collapsed = !collapsed;
}

function toggleVote(dir: "up" | "down") {
	vote = vote === dir ? null : dir;
}

function handleReplySubmit(text: string) {
	if (node.onReply) {
		node.onReply(text, node.id);
	} else {
		onMockAction();
	}
	showReply = false;
}

const displayVotes = $derived(node.baseVotes + (vote === "up" ? 1 : vote === "down" ? -1 : 0));
const isPending = $derived(node.deliveryState === "pending");
const isFailed = $derived(node.deliveryState === "failed");
const replyPlaceholder = $derived((t.replyPlaceholder ?? "Reply to u/{author}").replace("{author}", node.author));
const hasChildren = $derived(node.children.length > 0);

// Should we show the agent loading indicator under THIS node?
const showLoadingHere = $derived(isAgentTyping && replyingToId === node.id);

// Reddit thread line colors cycle per depth
const lineColors = ["#EDEFF1", "#FF4500", "#0079D3", "#46D0A6", "#FFB800", "#7193FF"];
const nextLineColor = $derived(lineColors[(depth + 1) % lineColors.length]);

// Resolve avatar: use authorAvatarUrl if available, else fall back to colored initial
const resolvedAvatarUrl = $derived(node.authorAvatarUrl || "");
const avatarInitial = $derived(node.author.charAt(0).toUpperCase());

// Is this node's avatar the agent?
const isAgentNode = $derived(node.role === "agent");
const userNodeAvatarUrl = $derived(isAgentNode ? agentAvatarUrl : avatarUrl);
const effectiveAvatarUrl = $derived(resolvedAvatarUrl || userNodeAvatarUrl);

const hasVisibleChildren = $derived(hasChildren || showLoadingHere);
</script>

<!-- Single comment node -->
<div class="comment-node">
	<!-- Comment body -->
	<div class="py-1">
		<!-- Author row: avatar + username + collapse toggle + metadata -->
		<div class="flex flex-wrap items-center gap-1 text-xs">
			{#if effectiveAvatarUrl}
				<img src={effectiveAvatarUrl} alt={node.author} class="h-5 w-5 shrink-0 rounded-full object-cover">
			{:else}
				<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full {node.authorColor} text-[9px] font-bold text-white">
					{avatarInitial}
				</div>
			{/if}
			<button type="button" class="font-bold text-[#0079D3] hover:underline" onclick={onMockAction}>{node.author}</button>
			<span class="text-[#878A8C]">•</span>
			<span class="text-[#878A8C]">{node.timestamp}</span>
			{#if !isPending}
				<span class="font-bold text-[#878A8C]">{formatVotes(node.baseVotes)} {t.points}</span>
			{/if}
			<button
				type="button"
				class="rounded px-0.5 py-0.5 text-[#878A8C] transition-colors hover:bg-[#F6F7F8] hover:text-[#FF4500] {collapsed
					? 'font-bold'
					: ''}"
				onclick={toggleCollapse}
				aria-label={collapsed ? "Expand" : "Collapse"}
			>
				[{collapsed ? "+" : "−"}]
			</button>
			{#if collapsed && hasVisibleChildren}
				<span class="text-[#878A8C]"
					>({node.children.length}
					{node.children.length === 1 ? "reply" : "replies"})</span
				>
			{/if}
		</div>

		{#if !collapsed}
			<!-- Comment text -->
			{#if isPending}
				<div class="flex items-center gap-1 py-2 pl-7">
					<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]"></span>
					<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]" style="animation-delay: 0.15s"></span>
					<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]" style="animation-delay: 0.3s"></span>
				</div>
			{:else}
				<div
					class="mb-1 pl-7 text-sm leading-6 {isFailed
						? 'text-red-500'
						: 'text-[#1C1C1C]'}"
				>
					<MarkdownRenderer content={node.text} />
				</div>
			{/if}

			<!-- Action row -->
			{#if !isPending}
				<div class="flex flex-wrap items-center gap-0.5 pl-6 text-xs font-bold text-[#878A8C]">
					<button
						type="button"
						class="rounded p-1 transition-colors hover:bg-[#F6F7F8] {vote ===
						'up'
							? 'text-[#FF4500]'
							: ''}"
						onclick={() => toggleVote("up")}
						aria-label="Upvote"
					>
						<ArrowBigUp size={15} fill={vote === "up" ? "currentColor" : "none"} />
					</button>
					<span
						class="min-w-[2ch] px-0.5 text-center text-xs {vote ===
						'up'
							? 'text-[#FF4500]'
							: vote === 'down'
								? 'text-[#7193FF]'
								: 'text-[#1C1C1C]'}"
					>
						{formatVotes(displayVotes)}
					</span>
					<button
						type="button"
						class="rounded p-1 transition-colors hover:bg-[#F6F7F8] {vote ===
						'down'
							? 'text-[#7193FF]'
							: ''}"
						onclick={() => toggleVote("down")}
						aria-label="Downvote"
					>
						<ArrowBigDown size={15} fill={vote === "down" ? "currentColor" : "none"} />
					</button>
					<div class="mx-1 h-4 w-px bg-[#EDEFF1]"></div>
					<button
						type="button"
						class="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-[#F6F7F8] {showReply
							? 'bg-[#F6F7F8] text-[#0079D3]'
							: ''}"
						onclick={() => (showReply = !showReply)}
					>
						<MessageSquare size={12} />
						{t.reply}
					</button>
					<button type="button" class="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
						<Gift size={12} />
						{t.award}
					</button>
					<button type="button" class="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
						<Share2 size={12} />
						{t.share}
					</button>
					<button type="button" class="rounded px-1.5 py-1 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
						<MoreHorizontal size={14} />
					</button>
					{#if isFailed && node.onRetry}
						<button
							type="button"
							class="ml-1 rounded bg-red-100 px-2 py-1 text-red-600 transition-colors hover:bg-red-200"
							onclick={() => node.onRetry?.(node.id)}
						>
							{t.retry}
						</button>
					{/if}
				</div>
			{/if}

			<!-- Inline reply editor -->
			{#if showReply}
				<div class="mt-1 pl-6">
					<CommentEditor
						{disabled}
						{userName}
						{avatarUrl}
						{avatarColor}
						{t}
						{language}
						{sessionId}
						placeholder={replyPlaceholder}
						contextPath={extendedPath}
						onSubmit={handleReplySubmit}
					/>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Children: simple border-left replies-wrapper for the vertical thread line -->
	{#if !collapsed && hasVisibleChildren}
		<div class="replies-wrapper" style="--thread-color: {nextLineColor}">
			{#each node.children as child}
				<CommentTree
					node={child}
					depth={depth + 1}
					ancestorPath={extendedPath}
					{disabled}
					{userName}
					{avatarUrl}
					{avatarColor}
					{agentColor}
					{agentAvatarUrl}
					{agentName}
					{sessionId}
					{t}
					{language}
					{onMockAction}
					{replyingToId}
					{isAgentTyping}
				/>
			{/each}

			<!-- Agent loading indicator pinned to the correct parent -->
			{#if showLoadingHere}
				<div class="loading-child">
					<div class="py-1">
						<div class="flex flex-wrap items-center gap-1 text-xs">
							{#if agentAvatarUrl}
								<img src={agentAvatarUrl} alt={agentName} class="h-5 w-5 shrink-0 rounded-full object-cover">
							{:else}
								<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full {agentColor} text-[9px] font-bold text-white">
									{agentName.charAt(0).toUpperCase()}
								</div>
							{/if}
							<span class="font-bold text-[#0079D3]">{agentName}</span>
							<span class="text-[#878A8C]">{t.thinking}</span>
						</div>
						<div class="flex items-center gap-1 py-1 pl-7">
							<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]"></span>
							<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]" style="animation-delay: 0.15s"></span>
							<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]" style="animation-delay: 0.3s"></span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
/* Vertical thread line via replies-wrapper border-left */
.replies-wrapper {
	margin-left: 20px;
	padding-left: 16px;
	border-left: 2px solid var(--thread-color);
}

/* L-curve connector from vertical line to each child comment.
       :global() needed because these elements belong to child component instances. */
.replies-wrapper > :global(.comment-node),
.replies-wrapper > :global(.loading-child) {
	position: relative;
}

.replies-wrapper > :global(.comment-node)::before,
.replies-wrapper > :global(.loading-child)::before {
	content: "";
	position: absolute;
	left: -16px;
	top: 0;
	width: 16px;
	height: 13px;
	border-left: 2px solid var(--thread-color);
	border-bottom: 2px solid var(--thread-color);
	border-bottom-left-radius: 8px;
}
</style>
