import type { ChatMessage } from "../chatMessages";

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

export type Ao3MessageMetadata = {
	commentId?: string;
	targetCommentId?: string | null;
	parentCommentId?: string | null;
	responderName?: string;
	mode?: "work" | "reply";
};

export type Ao3Target = {
	id: string;
	username: string;
	comment: string;
	depth: number;
	parentId: string | null;
	timestamp?: string;
};

export type Ao3RenderableComment = Ao3Target & {
	chapterTitle?: string;
	iconUrl?: string;
	replies: Ao3RenderableComment[];
	source: "opening" | "session";
	messageId?: string;
	deliveryState?: "sent" | "pending" | "failed";
	retryText?: string;
};

export const DEFAULT_AO3_ICON = "https://archiveofourown.org/images/skins/iconsets/default/icon_user.png";

export function normalizeAo3Text(value: unknown, fallback = ""): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function getAo3AuthorName(openingState: Ao3OpeningState, fallback = "FicAuthor"): string {
	return normalizeAo3Text(openingState.authorName, fallback);
}

export function getAo3AdditionalTags(openingState: Ao3OpeningState): string[] {
	return [...(openingState.additionalTags ?? []), ...(openingState.tags ?? [])].filter(
		(tag, index, tags) => Boolean(tag) && tags.indexOf(tag) === index,
	);
}

function makeOpeningCommentId(path: number[], comment: Ao3CommentNode): string {
	return normalizeAo3Text(comment.id, `opening-${path.join("-")}`);
}

export function flattenAo3Comments(comments: Ao3CommentNode[] = [], depth = 0, parentId: string | null = null, path: number[] = []): Ao3Target[] {
	return comments.flatMap((comment, index) => {
		const currentPath = [...path, index];
		const id = makeOpeningCommentId(currentPath, comment);
		const target: Ao3Target = {
			id,
			username: normalizeAo3Text(comment.username, "Anonymous"),
			comment: normalizeAo3Text(comment.comment),
			depth,
			parentId,
			timestamp: normalizeAo3Text(comment.timestamp) || undefined,
		};
		return [target, ...flattenAo3Comments(comment.replies ?? [], depth + 1, id, currentPath)];
	});
}

function makeOpeningTree(comments: Ao3CommentNode[] = [], depth = 0, parentId: string | null = null, path: number[] = []): Ao3RenderableComment[] {
	return comments.map((comment, index) => {
		const currentPath = [...path, index];
		const id = makeOpeningCommentId(currentPath, comment);
		return {
			id,
			username: normalizeAo3Text(comment.username, "Anonymous"),
			comment: normalizeAo3Text(comment.comment),
			depth,
			parentId,
			timestamp: normalizeAo3Text(comment.timestamp) || undefined,
			chapterTitle: normalizeAo3Text(comment.chapterTitle) || undefined,
			iconUrl: normalizeAo3Text(comment.iconUrl, DEFAULT_AO3_ICON),
			replies: makeOpeningTree(comment.replies ?? [], depth + 1, id, currentPath),
			source: "opening",
		};
	});
}

export function findAo3Target(openingState: Ao3OpeningState, targetCommentId: string | null | undefined): Ao3Target | null {
	if (!targetCommentId) return null;
	return flattenAo3Comments(openingState.previousComments ?? []).find((target) => target.id === targetCommentId) ?? null;
}

function getMessageAo3(message: ChatMessage): Ao3MessageMetadata {
	return message.ao3 ?? {};
}

function getCommentIdForMessage(message: ChatMessage): string {
	const ao3 = getMessageAo3(message);
	if (ao3.commentId) return ao3.commentId;
	if (message.role === "user" && message.clientMessageId) return `ao3-user-${message.clientMessageId}`;
	if (message.role === "agent" && message.clientMessageId) return `ao3-agent-${message.clientMessageId}`;
	return `ao3-${message.role}-${message.id}`;
}

function getParentIdForMessage(message: ChatMessage): string | null {
	const ao3 = getMessageAo3(message);
	if (message.role === "user") return ao3.targetCommentId ?? null;
	return ao3.parentCommentId ?? (message.clientMessageId ? `ao3-user-${message.clientMessageId}` : null);
}

export function getAo3TargetsFromMessages(messages: ChatMessage[]): Ao3Target[] {
	return messages
		.filter((message) => !message.isHidden)
		.map((message) => ({
			id: getCommentIdForMessage(message),
			username: message.authorName,
			comment: message.text,
			depth: 0,
			parentId: getParentIdForMessage(message),
			timestamp: message.timestamp,
		}));
}

export function findAo3TargetInMessages(messages: ChatMessage[], targetCommentId: string | null | undefined): Ao3Target | null {
	if (!targetCommentId) return null;
	return getAo3TargetsFromMessages(messages).find((target) => target.id === targetCommentId) ?? null;
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
	const base = params.target
		? `The learner replied to this AO3 comment on "${workTitle}":\nComment author you must roleplay as: ${params.responderName}\nOriginal comment: ${params.target.comment}`
		: `The learner left a new top-level AO3 comment on "${workTitle}" by ${authorName}. You must roleplay as the work author, ${params.responderName}.`;

	return `${base}\n\nLearner's comment:\n${params.comment}\n\nReply as ${params.responderName} with only the AO3 comment text. Stay in character as that commenter for this turn only.`;
}

function attachComment(root: Ao3RenderableComment[], comment: Ao3RenderableComment) {
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

export function buildAo3CommentTree(params: {
	openingState: Ao3OpeningState;
	messages: ChatMessage[];
	userAvatarUrl?: string;
	agentIconUrl?: string;
}): Ao3RenderableComment[] {
	const root = makeOpeningTree(params.openingState.previousComments ?? []);

	for (const message of params.messages) {
		if (message.isHidden) continue;
		const parentId = getParentIdForMessage(message);
		const comment: Ao3RenderableComment = {
			id: getCommentIdForMessage(message),
			username: message.authorName,
			comment: message.text,
			depth: 0,
			parentId,
			timestamp: message.timestamp,
			iconUrl: message.role === "user" ? params.userAvatarUrl || DEFAULT_AO3_ICON : params.agentIconUrl || DEFAULT_AO3_ICON,
			replies: [],
			source: "session",
			messageId: message.id,
			deliveryState: message.deliveryState,
			retryText: message.retryText,
		};
		attachComment(root, comment);
	}

	return root;
}

export function countAo3Comments(comments: Ao3RenderableComment[]): number {
	return comments.reduce((count, comment) => count + 1 + countAo3Comments(comment.replies), 0);
}
