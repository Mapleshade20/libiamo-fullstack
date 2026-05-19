import type { ChatMessage } from "../chatMessages";
import {
	buildCommentThreadTree,
	buildTargetedCommentPrompt,
	type CommentThreadConfig,
	type CommentThreadMetadata,
	type CommentThreadRenderableComment,
	type CommentThreadTarget,
	countThreadComments,
	findOpeningCommentTarget,
	findTargetInMessages,
	flattenOpeningComments,
	getTargetsFromMessages,
	normalizeThreadText,
} from "../commentThread";
import type { RedditComment, RedditOpeningState } from "./types";
import { seededInt } from "./utils";

export type RedditMessageMetadata = CommentThreadMetadata & {
	mode?: "post" | "reply";
};

export type RedditTarget = CommentThreadTarget & {
	username: string;
	comment: string;
};

export type RedditRenderableComment = CommentThreadRenderableComment & {
	username: string;
	comment: string;
	votes?: number;
	replies: RedditRenderableComment[];
};

export const redditThreadConfig: CommentThreadConfig<RedditComment> = {
	idPrefix: "reddit",
	defaultAuthor: "deleted",
	getAuthor: (comment) => comment.author,
	getText: (comment) => comment.text,
	getReplies: (comment) => comment.replies,
	getTimestamp: (comment) => comment.timestamp,
	getMetadata: (message) => message.thread,
};

function toRedditTarget(target: CommentThreadTarget): RedditTarget {
	return { ...target, username: target.author, comment: target.text };
}

export function normalizeRedditText(value: unknown, fallback = ""): string {
	return normalizeThreadText(value, fallback);
}

export function getRedditPostAuthor(openingState: RedditOpeningState, fallback = "OP"): string {
	return normalizeRedditText(openingState.post?.author, fallback);
}

export function flattenRedditComments(
	comments: RedditComment[] = [],
	depth = 0,
	parentId: string | null = null,
	path: number[] = [],
): RedditTarget[] {
	return flattenOpeningComments(comments, redditThreadConfig, depth, parentId, path).map(toRedditTarget);
}

export function findRedditTarget(openingState: RedditOpeningState, targetCommentId: string | null | undefined): RedditTarget | null {
	const target = findOpeningCommentTarget(openingState.previousComments ?? [], redditThreadConfig, targetCommentId);
	return target ? toRedditTarget(target) : null;
}

export function getRedditTargetsFromMessages(messages: ChatMessage[]): RedditTarget[] {
	return getTargetsFromMessages(messages, redditThreadConfig).map(toRedditTarget);
}

export function findRedditTargetInMessages(messages: ChatMessage[], targetCommentId: string | null | undefined): RedditTarget | null {
	const target = findTargetInMessages(messages, redditThreadConfig, targetCommentId);
	return target ? toRedditTarget(target) : null;
}

export function resolveRedditResponder(openingState: RedditOpeningState, target: RedditTarget | null): string {
	return target?.username || getRedditPostAuthor(openingState);
}

export function buildRedditUserPrompt(params: {
	openingState: RedditOpeningState;
	comment: string;
	target: RedditTarget | null;
	responderName: string;
}): string {
	const title = normalizeRedditText(params.openingState.post?.title, "this post");
	const subreddit = normalizeRedditText(params.openingState.post?.subreddit, "Reddit").replace(/^r\//, "");
	return buildTargetedCommentPrompt({
		surfaceName: "Reddit",
		containerDescription: `r/${subreddit} post "${title}"`,
		containerAuthorName: "the post author",
		comment: params.comment,
		target: params.target,
		responderName: params.responderName,
		topLevelActionDescription: "new top-level Reddit comment",
		replyActionDescription: "replied to this Reddit comment",
	});
}

export function buildRedditCommentTree(params: { openingState: RedditOpeningState; messages: ChatMessage[] }): RedditRenderableComment[] {
	return buildCommentThreadTree<RedditComment, RedditRenderableComment>({
		openingComments: params.openingState.previousComments ?? [],
		messages: params.messages,
		config: redditThreadConfig,
		mapOpeningComment: (comment, base) => ({
			username: base.author,
			comment: base.text,
			votes: comment.votes,
		}),
		mapMessageComment: (_message, base) => ({
			username: base.author,
			comment: base.text,
		}),
	});
}

export function getRedditCommentVotes(comment: RedditRenderableComment, fallbackSeed: string, min = 10, max = 800): number {
	return comment.votes ?? seededInt(fallbackSeed, min, max);
}

export function countRedditComments(comments: RedditRenderableComment[]): number {
	return countThreadComments(comments);
}
