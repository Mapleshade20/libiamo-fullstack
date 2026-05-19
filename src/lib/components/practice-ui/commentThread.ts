import type { ChatMessage } from "./chatMessages";

export type CommentThreadMetadata = {
	commentId?: string;
	targetCommentId?: string | null;
	parentCommentId?: string | null;
	responderName?: string;
	mode?: string;
};

export type CommentThreadTarget = {
	id: string;
	author: string;
	text: string;
	depth: number;
	parentId: string | null;
	timestamp?: string;
};

export type CommentThreadRenderableComment = CommentThreadTarget & {
	replies: CommentThreadRenderableComment[];
	source: "opening" | "session";
	messageId?: string;
	deliveryState?: "sent" | "pending" | "failed";
	retryText?: string;
	role?: "user" | "agent";
};

export type CommentThreadConfig<TOpeningComment extends Record<string, unknown> = Record<string, unknown>> = {
	idPrefix: string;
	openingIdPrefix?: string;
	defaultAuthor: string;
	getAuthor: (comment: TOpeningComment) => unknown;
	getText: (comment: TOpeningComment) => unknown;
	getReplies?: (comment: TOpeningComment) => unknown;
	getTimestamp?: (comment: TOpeningComment) => unknown;
	getMetadata?: (message: ChatMessage) => CommentThreadMetadata | undefined;
};

export type BuildCommentThreadTreeParams<
	TOpeningComment extends Record<string, unknown>,
	TRenderableComment extends CommentThreadRenderableComment,
> = {
	openingComments?: TOpeningComment[];
	messages: ChatMessage[];
	config: CommentThreadConfig<TOpeningComment>;
	mapOpeningComment?: (comment: TOpeningComment, base: CommentThreadRenderableComment) => Partial<TRenderableComment>;
	mapMessageComment?: (message: ChatMessage, base: CommentThreadRenderableComment) => Partial<TRenderableComment>;
};

export function normalizeThreadText(value: unknown, fallback = ""): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getOpeningCommentId<TOpeningComment extends Record<string, unknown>>(
	path: number[],
	comment: TOpeningComment,
	config: CommentThreadConfig<TOpeningComment>,
): string {
	return normalizeThreadText(comment.id, `${config.openingIdPrefix ?? "opening"}-${path.join("-")}`);
}

function getOpeningReplies<TOpeningComment extends Record<string, unknown>>(
	comment: TOpeningComment,
	config: CommentThreadConfig<TOpeningComment>,
): TOpeningComment[] {
	const replies = config.getReplies ? config.getReplies(comment) : comment.replies;
	return Array.isArray(replies) ? (replies as TOpeningComment[]) : [];
}

export function flattenOpeningComments<TOpeningComment extends Record<string, unknown>>(
	comments: TOpeningComment[] = [],
	config: CommentThreadConfig<TOpeningComment>,
	depth = 0,
	parentId: string | null = null,
	path: number[] = [],
): CommentThreadTarget[] {
	return comments.flatMap((comment, index) => {
		const currentPath = [...path, index];
		const id = getOpeningCommentId(currentPath, comment, config);
		const target: CommentThreadTarget = {
			id,
			author: normalizeThreadText(config.getAuthor(comment), config.defaultAuthor),
			text: normalizeThreadText(config.getText(comment)),
			depth,
			parentId,
			timestamp: normalizeThreadText(config.getTimestamp?.(comment)) || undefined,
		};
		return [target, ...flattenOpeningComments(getOpeningReplies(comment, config), config, depth + 1, id, currentPath)];
	});
}

function makeOpeningTree<TOpeningComment extends Record<string, unknown>>(
	comments: TOpeningComment[] = [],
	config: CommentThreadConfig<TOpeningComment>,
	depth = 0,
	parentId: string | null = null,
	path: number[] = [],
): CommentThreadRenderableComment[] {
	return comments.map((comment, index) => {
		const currentPath = [...path, index];
		const id = getOpeningCommentId(currentPath, comment, config);
		return {
			id,
			author: normalizeThreadText(config.getAuthor(comment), config.defaultAuthor),
			text: normalizeThreadText(config.getText(comment)),
			depth,
			parentId,
			timestamp: normalizeThreadText(config.getTimestamp?.(comment)) || undefined,
			replies: makeOpeningTree(getOpeningReplies(comment, config), config, depth + 1, id, currentPath),
			source: "opening",
		};
	});
}

export function findOpeningCommentTarget<TOpeningComment extends Record<string, unknown>>(
	comments: TOpeningComment[] = [],
	config: CommentThreadConfig<TOpeningComment>,
	targetCommentId: string | null | undefined,
): CommentThreadTarget | null {
	if (!targetCommentId) return null;
	return flattenOpeningComments(comments, config).find((target) => target.id === targetCommentId) ?? null;
}

export function getThreadMetadata(message: ChatMessage, config?: Pick<CommentThreadConfig, "getMetadata">): CommentThreadMetadata {
	return config?.getMetadata?.(message) ?? message.thread ?? {};
}

export function getCommentIdForMessage(message: ChatMessage, config: Pick<CommentThreadConfig, "idPrefix" | "getMetadata">): string {
	const metadata = getThreadMetadata(message, config);
	if (metadata.commentId) return metadata.commentId;
	if (message.role === "user" && message.clientMessageId) return `${config.idPrefix}-user-${message.clientMessageId}`;
	if (message.role === "agent" && message.clientMessageId) return `${config.idPrefix}-agent-${message.clientMessageId}`;
	return `${config.idPrefix}-${message.role}-${message.id}`;
}

export function getParentCommentIdForMessage(message: ChatMessage, config: Pick<CommentThreadConfig, "idPrefix" | "getMetadata">): string | null {
	const metadata = getThreadMetadata(message, config);
	if (message.role === "user") return metadata.targetCommentId ?? null;
	return metadata.parentCommentId ?? (message.clientMessageId ? `${config.idPrefix}-user-${message.clientMessageId}` : null);
}

export function getTargetsFromMessages(
	messages: ChatMessage[],
	config: Pick<CommentThreadConfig, "idPrefix" | "getMetadata">,
): CommentThreadTarget[] {
	return messages
		.filter((message) => !message.isHidden)
		.map((message) => ({
			id: getCommentIdForMessage(message, config),
			author: message.authorName,
			text: message.text,
			depth: 0,
			parentId: getParentCommentIdForMessage(message, config),
			timestamp: message.timestamp,
		}));
}

export function findTargetInMessages(
	messages: ChatMessage[],
	config: Pick<CommentThreadConfig, "idPrefix" | "getMetadata">,
	targetCommentId: string | null | undefined,
): CommentThreadTarget | null {
	if (!targetCommentId) return null;
	return getTargetsFromMessages(messages, config).find((target) => target.id === targetCommentId) ?? null;
}

function attachComment(root: CommentThreadRenderableComment[], comment: CommentThreadRenderableComment) {
	if (!comment.parentId) {
		root.push(comment);
		return;
	}

	const stack = [...root];
	while (stack.length) {
		const current = stack.shift();
		if (!current) continue;
		if (current.id === comment.parentId) {
			comment.depth = current.depth + 1;
			current.replies.push(comment);
			return;
		}
		stack.push(...current.replies);
	}

	root.push(comment);
}

export function buildCommentThreadTree<
	TOpeningComment extends Record<string, unknown>,
	TRenderableComment extends CommentThreadRenderableComment = CommentThreadRenderableComment,
>(params: BuildCommentThreadTreeParams<TOpeningComment, TRenderableComment>): TRenderableComment[] {
	const root = makeOpeningTree(params.openingComments ?? [], params.config) as TRenderableComment[];

	function decorateOpeningTree(comments: TRenderableComment[], openingComments: TOpeningComment[]) {
		for (const [index, comment] of comments.entries()) {
			const opening = openingComments[index];
			if (opening) Object.assign(comment, params.mapOpeningComment?.(opening, comment) ?? {});
			decorateOpeningTree(comment.replies as TRenderableComment[], opening ? getOpeningReplies(opening, params.config) : []);
		}
	}
	decorateOpeningTree(root, params.openingComments ?? []);

	for (const message of params.messages) {
		if (message.isHidden) continue;
		const parentId = getParentCommentIdForMessage(message, params.config);
		const base: CommentThreadRenderableComment = {
			id: getCommentIdForMessage(message, params.config),
			author: message.authorName,
			text: message.text,
			depth: 0,
			parentId,
			timestamp: message.timestamp,
			replies: [],
			source: "session",
			messageId: message.id,
			deliveryState: message.deliveryState,
			retryText: message.retryText,
			role: message.role,
		};
		attachComment(root, { ...base, ...(params.mapMessageComment?.(message, base) ?? {}) });
	}

	return root;
}

export function countThreadComments(comments: Pick<CommentThreadRenderableComment, "replies">[]): number {
	return comments.reduce((count, comment) => count + 1 + countThreadComments(comment.replies), 0);
}

export function buildTargetedCommentPrompt(params: {
	surfaceName: string;
	containerDescription: string;
	containerAuthorName: string;
	comment: string;
	target: CommentThreadTarget | null;
	responderName: string;
	topLevelActionDescription: string;
	replyActionDescription: string;
}): string {
	const base = params.target
		? `The learner replied to this ${params.surfaceName} comment on ${params.containerDescription}:\nComment author you must roleplay as: ${params.responderName}\nOriginal comment: ${params.target.text}`
		: `The learner left a new top-level ${params.surfaceName} comment on ${params.containerDescription}. You must roleplay as ${params.containerAuthorName}, ${params.responderName}.`;

	return `${base}\n\nLearner's comment:\n${params.comment}\n\nReply as ${params.responderName} with only the ${params.surfaceName} comment text. Stay in character as that commenter for this turn only.`;
}
