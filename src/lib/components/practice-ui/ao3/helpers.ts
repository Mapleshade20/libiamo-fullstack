import type { ChatMessage } from "../chatMessages";
import {
	buildCommentThreadTree,
	buildTargetedCommentPrompt,
	type CommentThreadConfig,
	type CommentThreadRenderableComment,
	type CommentThreadTarget,
	countThreadComments,
	findOpeningCommentTarget,
	findTargetInMessages,
	flattenOpeningComments,
	getCommentIdForMessage,
	getParentCommentIdForMessage,
	getTargetsFromMessages,
	normalizeThreadText,
} from "../commentThread";

export type Ao3CommentNode = {
	id?: string;
	username?: string;
	comment?: string;
	timestamp?: string;
	chapterTitle?: string;
	iconUrl?: string;
	replies?: Ao3CommentNode[];
};

export type Ao3Stats = {
	published?: string;
	updated?: string;
	words?: string;
	chapters?: string;
	comments?: string;
	kudos?: string;
	bookmarks?: string;
	hits?: string;
};

export type Ao3OpeningState = {
	workTitle?: string;
	authorName?: string;
	chapterTitle?: string;
	summary?: string;
	bodyExcerpt?: string;
	rating?: string;
	archiveWarning?: string;
	categories?: string[];
	fandoms?: string[];
	relationships?: string[];
	characters?: string[];
	additionalTags?: string[];
	tags?: string[];
	stats?: Ao3Stats;
	previousComments?: Ao3CommentNode[];
};

export type Ao3Target = CommentThreadTarget & {
	username: string;
	comment: string;
};

export type Ao3RenderableComment = CommentThreadRenderableComment & {
	username: string;
	comment: string;
	chapterTitle?: string;
	iconUrl?: string;
	replies: Ao3RenderableComment[];
};

export const DEFAULT_AO3_ICON = "/ao3/icon_user.png";

const ao3ThreadConfig: CommentThreadConfig<Ao3CommentNode> = {
	idPrefix: "ao3",
	defaultAuthor: "Anonymous",
	getAuthor: (comment) => comment.username,
	getText: (comment) => comment.comment,
	getReplies: (comment) => comment.replies,
	getTimestamp: (comment) => comment.timestamp,
	getMetadata: (message) => message.thread,
};

function toAo3Target(target: CommentThreadTarget): Ao3Target {
	return { ...target, username: target.author, comment: target.text };
}

export function normalizeAo3Text(value: unknown, fallback = ""): string {
	return normalizeThreadText(value, fallback);
}

export function getAo3AuthorName(openingState: Ao3OpeningState, fallback = "FicAuthor"): string {
	return normalizeAo3Text(openingState.authorName, fallback);
}

export function getAo3AdditionalTags(openingState: Ao3OpeningState): string[] {
	return [...(openingState.additionalTags ?? []), ...(openingState.tags ?? [])].filter(
		(tag, index, tags) => Boolean(tag) && tags.indexOf(tag) === index,
	);
}

export function flattenAo3Comments(comments: Ao3CommentNode[] = [], depth = 0, parentId: string | null = null, path: number[] = []): Ao3Target[] {
	return flattenOpeningComments(comments, ao3ThreadConfig, depth, parentId, path).map(toAo3Target);
}

export function findAo3Target(openingState: Ao3OpeningState, targetCommentId: string | null | undefined): Ao3Target | null {
	const target = findOpeningCommentTarget(openingState.previousComments ?? [], ao3ThreadConfig, targetCommentId);
	return target ? toAo3Target(target) : null;
}

export function getAo3TargetsFromMessages(messages: ChatMessage[]): Ao3Target[] {
	return getTargetsFromMessages(messages, ao3ThreadConfig).map(toAo3Target);
}

export function findAo3TargetInMessages(messages: ChatMessage[], targetCommentId: string | null | undefined): Ao3Target | null {
	const target = findTargetInMessages(messages, ao3ThreadConfig, targetCommentId);
	return target ? toAo3Target(target) : null;
}

export function resolveAo3Responder(openingState: Ao3OpeningState, target: Ao3Target | null): string {
	return target?.username || getAo3AuthorName(openingState);
}

export function buildAo3UserPrompt(params: {
	openingState: Ao3OpeningState;
	comment: string;
	target: Ao3Target | null;
	responderName: string;
}): string {
	const workTitle = normalizeAo3Text(params.openingState.workTitle, "this work");
	const authorName = getAo3AuthorName(params.openingState);
	return buildTargetedCommentPrompt({
		surfaceName: "AO3",
		containerDescription: `"${workTitle}"${params.target ? "" : ` by ${authorName}`}`,
		containerAuthorName: "the work author",
		comment: params.comment,
		target: params.target,
		responderName: params.responderName,
		topLevelActionDescription: "new top-level AO3 comment",
		replyActionDescription: "replied to this AO3 comment",
	});
}

export function buildAo3CommentTree(params: {
	openingState: Ao3OpeningState;
	messages: ChatMessage[];
	userAvatarUrl?: string;
	agentIconUrl?: string;
}): Ao3RenderableComment[] {
	return buildCommentThreadTree<Ao3CommentNode, Ao3RenderableComment>({
		openingComments: params.openingState.previousComments ?? [],
		// Pending placeholders are polling triggers only: real AO3 shows nothing
		// between submitting a comment and the author's reply appearing.
		messages: params.messages.filter((message) => message.deliveryState !== "pending"),
		config: ao3ThreadConfig,
		mapOpeningComment: (comment, base) => ({
			username: base.author,
			comment: base.text,
			chapterTitle: normalizeAo3Text(comment.chapterTitle) || undefined,
			iconUrl: normalizeAo3Text(comment.iconUrl, DEFAULT_AO3_ICON),
		}),
		mapMessageComment: (message, base) => ({
			username: base.author,
			comment: base.text,
			iconUrl: message.role === "user" ? params.userAvatarUrl || DEFAULT_AO3_ICON : params.agentIconUrl || DEFAULT_AO3_ICON,
		}),
	});
}

export function countAo3Comments(comments: Ao3RenderableComment[]): number {
	return countThreadComments(comments);
}

export { getCommentIdForMessage as getAo3CommentIdForMessage, getParentCommentIdForMessage as getAo3ParentCommentIdForMessage };
