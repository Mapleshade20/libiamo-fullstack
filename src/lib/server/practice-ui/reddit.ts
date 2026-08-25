import { buildChatMessages } from "$lib/components/practice-ui/chatMessages";
import {
	buildRedditUserPrompt,
	findRedditTarget,
	findRedditTargetInMessages,
	getRedditPostAuthor,
	type RedditMessageMetadata,
	type RedditTarget,
} from "$lib/components/practice-ui/reddit/helpers";
import type { RedditOpeningState } from "$lib/components/practice-ui/reddit/types";
import type { SubmitMessageOptions } from "$lib/server/session";

type PersistedSessionMessage = {
	id: number | string;
	role: string;
	content: string;
	createdAt: string | Date;
	llmMetadata?: unknown;
};

type RedditPersistedMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	displayContent?: string;
	thread?: RedditMessageMetadata;
};

function getRedditPersistedMetadata(value: unknown): RedditPersistedMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as RedditPersistedMetadata;
}

function buildRedditRetrySendOptions(params: {
	messages: PersistedSessionMessage[];
	openingState: RedditOpeningState;
	clientMessageId: string;
}): SubmitMessageOptions | null {
	const originalUserMessage = params.messages.find((message) => {
		const metadata = getRedditPersistedMetadata(message.llmMetadata);
		return message.role === "user" && metadata.clientMessageId === params.clientMessageId && metadata.failed === true && metadata.thread;
	});
	if (!originalUserMessage) return null;

	const metadata = getRedditPersistedMetadata(originalUserMessage.llmMetadata);
	const thread = metadata.thread;
	if (!thread) return null;

	return {
		userDisplayContent: metadata.displayContent,
		userMetadata: { thread },
	};
}

function buildRedditNewTurnSendOptions(params: {
	openingState: RedditOpeningState;
	target: RedditTarget | null;
	message: string;
	clientMessageId: string;
}): SubmitMessageOptions {
	const responderName = params.target?.username || getRedditPostAuthor(params.openingState);
	const userCommentId = `reddit-user-${params.clientMessageId}`;
	const mode = params.target ? "reply" : "post";
	return {
		promptContent: buildRedditUserPrompt({
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
	};
}

function findRedditTargetAcrossOpeningAndSession(params: {
	openingState: RedditOpeningState;
	messages: PersistedSessionMessage[];
	targetCommentId: string | null;
	userName: string;
}): RedditTarget | null {
	let target = findRedditTarget(params.openingState, params.targetCommentId);
	if (!params.targetCommentId || target) return target;

	const chatMessages = buildChatMessages({
		rawMessages: params.messages,
		formatTimestamp: () => "Earlier",
		userName: params.userName,
		agentName: getRedditPostAuthor(params.openingState),
		labels: {
			retryFailedMessage: "Agent reply failed. Click Retry to try again.",
			stillProcessingMessage: "Agent is still processing. Retry in a moment.",
		},
	});
	target = findRedditTargetInMessages(chatMessages, params.targetCommentId);

	return target;
}

export function buildRedditSendOptions(params: {
	openingState: RedditOpeningState;
	messages: PersistedSessionMessage[];
	targetCommentId: string | null;
	message: string;
	clientMessageId: string;
	userName: string;
}): SubmitMessageOptions | null {
	const retryOptions = buildRedditRetrySendOptions({
		messages: params.messages,
		openingState: params.openingState,
		clientMessageId: params.clientMessageId,
	});
	if (retryOptions) return retryOptions;

	const target = findRedditTargetAcrossOpeningAndSession({
		openingState: params.openingState,
		messages: params.messages,
		targetCommentId: params.targetCommentId,
		userName: params.userName,
	});
	if (params.targetCommentId && !target) return null;

	return buildRedditNewTurnSendOptions({
		openingState: params.openingState,
		target,
		message: params.message,
		clientMessageId: params.clientMessageId,
	});
}
