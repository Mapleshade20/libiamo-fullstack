import type { UiVariant } from "$lib/constants";
import type { ChatMessage } from "./messages";

/** Surfaces whose conversation is a public comment tree rather than a linear chat. */
export type ThreadUi = "reddit" | "ao3";

/** Where a message sits in a comment tree: learner comments name their target, replies their parent. */
export type CommentThreadMetadata = {
	commentId?: string;
	targetCommentId?: string | null;
	parentCommentId?: string | null;
	/** Replies stored before the author was recorded separately. */
	responderName?: string;
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
	/** The post author or the work's author. */
	owner: (openingState: Record<string, unknown>) => unknown;
	ownerFallback: string;
};

const PLATFORMS: Record<ThreadUi, ThreadPlatform> = {
	reddit: {
		author: (comment) => comment.author,
		text: (comment) => comment.text,
		anonymous: "deleted",
		owner: (state) => (state.post as Record<string, unknown> | undefined)?.author,
		ownerFallback: "OP",
	},
	ao3: {
		author: (comment) => comment.username,
		text: (comment) => comment.comment,
		anonymous: "Anonymous",
		owner: (state) => state.authorName,
		ownerFallback: "FicAuthor",
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

/** The post or work author. */
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

/** A message's id in the scene; linear surfaces use the same scheme for reply references. */
export function getCommentId(ui: string, message: Pick<ChatMessage, "id" | "role" | "clientMessageId" | "thread">): string {
	if (message.thread?.commentId) return message.thread.commentId;
	return `${ui}-${message.role}-${message.clientMessageId ?? message.id}`;
}

/** The ref a chat reply quotes: opening lines keep their `opening-<index>` id, session messages use `getCommentId`. */
export function getSceneMessageRef(ui: string, message: Pick<ChatMessage, "id" | "role" | "clientMessageId" | "thread">): string {
	return message.id.startsWith("opening-") ? message.id : getCommentId(ui, message);
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

/** Where a new learner comment sits in the tree. Who answers it, if anyone, is the server's decision. */
export function newCommentMetadata(ui: ThreadUi, clientMessageId: string, target: ThreadTarget | null): CommentThreadMetadata {
	return { commentId: `${ui}-user-${clientMessageId}`, targetCommentId: target?.id ?? null };
}

/** The conversation a learner message serves: the ref it replies to, or its own ref at the top level. */
export function targetRefOf(message: Pick<ChatMessage, "thread">): string | null {
	return message.thread?.targetCommentId ?? message.thread?.commentId ?? null;
}

/** `opening-0-1` → `opening-0`; refs without a numeric path have no derivable parent. */
function openingParentRef(ref: string): string | null {
	const path = /^opening-(\d+(?:-\d+)*)$/.exec(ref)?.[1];
	if (!path) return null;
	const segments = path.split("-");
	return segments.length > 1 ? `opening-${segments.slice(0, -1).join("-")}` : null;
}

/**
 * A ref's ancestors, nearest first. Session messages walk parent refs (a learner comment's
 * target, a reply's parent); `opening-<path>` refs pop path segments. Authored opening ids carry
 * no derivable ancestry, and a cycle in parent refs stops the walk.
 */
export function ancestorRefs(ui: ThreadUi, messages: ChatMessage[], ref: string | null): string[] {
	const byRef = new Map(messages.map((message) => [getCommentId(ui, message), message]));
	const ancestors: string[] = [];
	const seen = new Set<string>();
	let current = ref;
	while (current && !seen.has(current)) {
		seen.add(current);
		const message = byRef.get(current);
		const parent = message ? getParentCommentId(ui, message) : openingParentRef(current);
		if (!parent || seen.has(parent)) break;
		ancestors.push(parent);
		current = parent;
	}
	return ancestors;
}

/** A pending async conversation: the takers serving one target, keyed by its learner messages. */
export type PendingConversation = {
	/** The comment ref the conversation serves; null on mail and on legacy rows. */
	targetRef: string | null;
	/** The conversation's learner messages, oldest first; the current head is the last entry. */
	learnerRefs: string[];
};

/**
 * The pending conversation a new learner message with target `targetRef` supplements, if any.
 * Joining is by exchange, not comment box: the message targets the conversation's comment, or
 * something that grew from its learner messages (a cast reply under them, or one of them).
 * Sibling sub-threads and replies above the exchange open their own conversations instead, and
 * nothing ever merges. Mail folds by null target; on threaded surfaces a legacy null-target
 * conversation joins nothing. Should several match (an invariant violation), the one with the
 * newest head message wins.
 */
export function joinedConversation(
	ui: UiVariant,
	messages: ChatMessage[],
	conversations: PendingConversation[],
	targetRef: string | null,
): PendingConversation | null {
	if (ui !== "reddit" && ui !== "ao3") {
		// Mail is one conversation: a new message folds into the pending null-target one.
		return targetRef === null ? (conversations.find((conversation) => conversation.targetRef === null) ?? null) : null;
	}
	if (targetRef === null) return null;
	const ancestors = ancestorRefs(ui, messages, targetRef);
	const matches = conversations.filter((conversation) => {
		// Legacy null-target conversations join nothing on threaded surfaces until they drain.
		if (conversation.targetRef === null) return false;
		if (conversation.targetRef === targetRef) return true;
		const learnerRefs = new Set(conversation.learnerRefs);
		return learnerRefs.has(targetRef) || ancestors.some((ref) => learnerRefs.has(ref));
	});
	if (matches.length <= 1) return matches[0] ?? null;
	const positionOf = (conversation: PendingConversation) => {
		const head = conversation.learnerRefs.at(-1);
		return head ? messages.findIndex((message) => getCommentId(ui, message) === head) : -1;
	};
	return matches.reduce((best, current) => (positionOf(current) >= positionOf(best) ? current : best));
}
