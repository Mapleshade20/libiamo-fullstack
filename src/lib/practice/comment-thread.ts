import type { ChatMessage } from "./messages";

/** Surfaces whose conversation is a public comment tree rather than a linear chat. */
export type ThreadUi = "reddit" | "ao3";

/** Stored on learner messages (and copied to their replies) to place them in the tree. */
export type CommentThreadMetadata = {
	commentId?: string;
	targetCommentId?: string | null;
	parentCommentId?: string | null;
	responderName?: string;
	mode?: string;
};

/** An authored opening comment; Reddit and AO3 name their fields differently. */
export type OpeningComment = Record<string, unknown> & { id?: unknown; replies?: unknown };

/** A comment the learner can reply to. */
export type ThreadTarget = {
	id: string;
	author: string;
	text: string;
	parentId: string | null;
};

export type ThreadComment = ThreadTarget & {
	timestamp?: string;
	depth: number;
	replies: ThreadComment[];
	/** The authored comment, for platform fields such as votes, icon or chapter. */
	opening?: OpeningComment;
	/** The session message behind a learner comment or a reply to it. */
	message?: ChatMessage;
};

type ThreadPlatform = {
	author: (comment: OpeningComment) => unknown;
	text: (comment: OpeningComment) => unknown;
	anonymous: string;
	/** Who answers a top-level comment: the post author or the work's author. */
	owner: (openingState: Record<string, unknown>) => unknown;
	ownerFallback: string;
	topLevelMode: string;
};

const PLATFORMS: Record<ThreadUi, ThreadPlatform> = {
	reddit: {
		author: (comment) => comment.author,
		text: (comment) => comment.text,
		anonymous: "deleted",
		owner: (state) => (state.post as Record<string, unknown> | undefined)?.author,
		ownerFallback: "OP",
		topLevelMode: "post",
	},
	ao3: {
		author: (comment) => comment.username,
		text: (comment) => comment.comment,
		anonymous: "Anonymous",
		owner: (state) => state.authorName,
		ownerFallback: "FicAuthor",
		topLevelMode: "work",
	},
};

export function threadText(value: unknown, fallback = ""): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asComments(value: unknown): OpeningComment[] {
	return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as OpeningComment[]) : [];
}

/** The name that answers comments made directly on the post or work. */
export function getThreadOwner(ui: ThreadUi, openingState: unknown): string {
	return threadText(PLATFORMS[ui].owner(asRecord(openingState)), PLATFORMS[ui].ownerFallback);
}

function openingTree(ui: ThreadUi, comments: OpeningComment[], depth: number, parentId: string | null, path: number[]): ThreadComment[] {
	return comments.map((comment, index) => {
		const currentPath = [...path, index];
		const id = threadText(comment.id, `opening-${currentPath.join("-")}`);
		return {
			id,
			author: threadText(PLATFORMS[ui].author(comment), PLATFORMS[ui].anonymous),
			text: threadText(PLATFORMS[ui].text(comment)),
			timestamp: threadText(comment.timestamp) || undefined,
			parentId,
			depth,
			opening: comment,
			replies: openingTree(ui, asComments(comment.replies), depth + 1, id, currentPath),
		};
	});
}

function flatten(comments: ThreadComment[]): ThreadComment[] {
	return comments.flatMap((comment) => [comment, ...flatten(comment.replies)]);
}

/** Authored opening comments, depth-first, with the ids learner replies refer to. */
export function flattenOpeningComments(ui: ThreadUi, openingState: unknown): ThreadComment[] {
	return flatten(openingTree(ui, asComments(asRecord(openingState).previousComments), 0, null, []));
}

export function getCommentId(ui: ThreadUi, message: Pick<ChatMessage, "id" | "role" | "clientMessageId" | "thread">): string {
	if (message.thread?.commentId) return message.thread.commentId;
	return `${ui}-${message.role}-${message.clientMessageId ?? message.id}`;
}

export function getParentCommentId(ui: ThreadUi, message: Pick<ChatMessage, "role" | "clientMessageId" | "thread">): string | null {
	if (message.role === "user") return message.thread?.targetCommentId ?? null;
	return message.thread?.parentCommentId ?? (message.clientMessageId ? `${ui}-user-${message.clientMessageId}` : null);
}

function sessionComment(ui: ThreadUi, message: ChatMessage): ThreadComment {
	return {
		id: getCommentId(ui, message),
		author: message.authorName,
		text: message.text,
		timestamp: message.timestamp,
		parentId: getParentCommentId(ui, message),
		depth: 0,
		replies: [],
		message,
	};
}

/**
 * The opening comments with session comments attached under the comment they answer. Pending
 * placeholders are left out: neither platform shows anything while a reply is being written.
 */
export function buildCommentThread(ui: ThreadUi, openingState: unknown, messages: ChatMessage[]): ThreadComment[] {
	const root = openingTree(ui, asComments(asRecord(openingState).previousComments), 0, null, []);
	const byId = new Map(flatten(root).map((comment) => [comment.id, comment]));
	for (const message of messages) {
		if (message.deliveryState === "pending") continue;
		const comment = sessionComment(ui, message);
		const parent = comment.parentId ? byId.get(comment.parentId) : undefined;
		if (parent) {
			comment.depth = parent.depth + 1;
			parent.replies.push(comment);
		} else {
			root.push(comment);
		}
		byId.set(comment.id, comment);
	}
	return root;
}

export function countComments(comments: ThreadComment[]): number {
	return flatten(comments).length;
}

/** A reply target among the opening comments or the session's comments. */
export function findThreadTarget(
	ui: ThreadUi,
	openingState: unknown,
	messages: ChatMessage[],
	targetId: string | null | undefined,
): ThreadTarget | null {
	if (!targetId) return null;
	const opening = flattenOpeningComments(ui, openingState).find((comment) => comment.id === targetId);
	if (opening) return opening;
	const message = messages.find((candidate) => getCommentId(ui, candidate) === targetId);
	return message ? sessionComment(ui, message) : null;
}

/**
 * Where a new learner comment sits in the tree and who answers it: the target's author, or the
 * post/work owner for a top-level comment. The reply is placed under the learner's comment.
 */
export function newCommentMetadata(ui: ThreadUi, clientMessageId: string, target: ThreadTarget | null, openingState: unknown) {
	const responderName = target?.author || getThreadOwner(ui, openingState);
	const commentId = `${ui}-user-${clientMessageId}`;
	return {
		user: { commentId, targetCommentId: target?.id ?? null, responderName, mode: target ? "reply" : PLATFORMS[ui].topLevelMode },
		agent: { commentId: `${ui}-agent-${clientMessageId}`, parentCommentId: commentId, responderName, mode: "reply" },
	} satisfies Record<string, CommentThreadMetadata>;
}
