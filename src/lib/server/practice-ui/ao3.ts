import {
	type Ao3OpeningState,
	type Ao3Target,
	buildAo3UserPrompt,
	findAo3Target,
	findAo3TargetInMessages,
	getAo3AuthorName,
} from "$lib/components/practice-ui/ao3/helpers";
import { buildChatMessages } from "$lib/components/practice-ui/chatMessages";
import type { CommentThreadMetadata } from "$lib/components/practice-ui/commentThread";
import type { SendMessageOptions } from "$lib/server/session";

type PersistedSessionMessage = {
	id: number | string;
	role: string;
	content: string;
	createdAt: string | Date;
	llmMetadata?: unknown;
};

type Ao3PersistedMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	displayContent?: string;
	thread?: CommentThreadMetadata;
};

function getAo3PersistedMetadata(value: unknown): Ao3PersistedMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Ao3PersistedMetadata;
}

function buildAo3RetrySendOptions(params: {
	messages: PersistedSessionMessage[];
	openingState: Ao3OpeningState;
	clientMessageId: string;
}): SendMessageOptions | null {
	const originalUserMessage = params.messages.find((message) => {
		const metadata = getAo3PersistedMetadata(message.llmMetadata);
		return message.role === "user" && metadata.clientMessageId === params.clientMessageId && metadata.failed === true && metadata.thread;
	});
	if (!originalUserMessage) return null;

	const metadata = getAo3PersistedMetadata(originalUserMessage.llmMetadata);
	const thread = metadata.thread;
	if (!thread) return null;

	const responderName = thread.responderName || getAo3AuthorName(params.openingState);
	const userCommentId = thread.commentId || `ao3-user-${params.clientMessageId}`;
	return {
		userDisplayContent: metadata.displayContent,
		userMetadata: { thread },
		assistantAuthorName: responderName,
		assistantMetadata: {
			thread: {
				commentId: `ao3-agent-${params.clientMessageId}`,
				parentCommentId: userCommentId,
				responderName,
				mode: "reply",
			},
		},
	};
}

function buildAo3NewTurnSendOptions(params: {
	openingState: Ao3OpeningState;
	target: Ao3Target | null;
	message: string;
	clientMessageId: string;
}): SendMessageOptions {
	const responderName = params.target?.username || getAo3AuthorName(params.openingState);
	const userCommentId = `ao3-user-${params.clientMessageId}`;
	const agentCommentId = `ao3-agent-${params.clientMessageId}`;
	const mode = params.target ? "reply" : "work";
	return {
		promptContent: buildAo3UserPrompt({
			openingState: params.openingState,
			comment: params.message,
			target: params.target,
			responderName,
		}),
		userDisplayContent: params.message,
		userMetadata: {
			thread: {
				commentId: userCommentId,
				targetCommentId: params.target?.id ?? null,
				responderName,
				mode,
			},
		},
		assistantAuthorName: responderName,
		assistantMetadata: {
			thread: {
				commentId: agentCommentId,
				parentCommentId: userCommentId,
				responderName,
				mode: "reply",
			},
		},
	};
}

function findAo3TargetAcrossOpeningAndSession(params: {
	openingState: Ao3OpeningState;
	messages: PersistedSessionMessage[];
	targetCommentId: string | null;
	userName: string;
}): Ao3Target | null {
	let target = findAo3Target(params.openingState, params.targetCommentId);
	if (!params.targetCommentId || target) return target;

	const chatMessages = buildChatMessages({
		rawMessages: params.messages,
		formatTimestamp: () => "Earlier",
		userName: params.userName,
		agentName: getAo3AuthorName(params.openingState),
		labels: {
			retryFailedMessage: "Agent reply failed. Click Retry to try again.",
			stillProcessingMessage: "Agent is still processing. Retry in a moment.",
		},
	});
	target = findAo3TargetInMessages(chatMessages, params.targetCommentId);

	return target;
}

export function buildAo3SendOptions(params: {
	openingState: Ao3OpeningState;
	messages: PersistedSessionMessage[];
	targetCommentId: string | null;
	message: string;
	clientMessageId: string;
	userName: string;
}): SendMessageOptions | null {
	const retryOptions = buildAo3RetrySendOptions({
		messages: params.messages,
		openingState: params.openingState,
		clientMessageId: params.clientMessageId,
	});
	if (retryOptions) return retryOptions;

	const target = findAo3TargetAcrossOpeningAndSession({
		openingState: params.openingState,
		messages: params.messages,
		targetCommentId: params.targetCommentId,
		userName: params.userName,
	});
	if (params.targetCommentId && !target) return null;

	return buildAo3NewTurnSendOptions({
		openingState: params.openingState,
		target,
		message: params.message,
		clientMessageId: params.clientMessageId,
	});
}
