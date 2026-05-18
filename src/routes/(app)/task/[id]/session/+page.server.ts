import { error, fail } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import EmojiConverter from "emoji-js";
import {
	type Ao3OpeningState,
	type Ao3Target,
	buildAo3UserPrompt,
	findAo3Target,
	findAo3TargetInMessages,
	getAo3AuthorName,
} from "$lib/components/practice-ui/ao3/helpers";
import { buildChatMessages } from "$lib/components/practice-ui/chatMessages";
import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";
import { db } from "$lib/server/db";
import { practiceSession, task } from "$lib/server/db/schema";
import { completeSession, generateHint, getSessionOrFail, sendMessage, startSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

const emojiConverter = new EmojiConverter();
emojiConverter.colons_mode = true;

function isAgentStartTrigger(message: string, clientMessageId: string, sessionId: number) {
	return message.trim() === "*User joined the server*" && clientMessageId === `join-${sessionId}`;
}

function mapSendMessageError(e: unknown) {
	if (!(e instanceof Error)) return null;
	if (e.message === "userMessage is required") return fail(400, { error: e.message });
	if (e.message === "Session not found") return fail(404, { error: e.message });
	if (e.message === "Session not in progress") return fail(409, { error: e.message });
	if (e.message === "Maximum conversation turns reached") return fail(403, { error: e.message });
	return null;
}

function mapStartSessionError(e: unknown) {
	if (!(e instanceof Error)) return null;
	if (e.message === "Task not found") return fail(404, { error: e.message });
	return null;
}

function getFormString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === "string" ? value.trim() : "";
}

function buildAo3SendOptions(params: { openingState: Ao3OpeningState; target: Ao3Target | null; message: string; clientMessageId: string }) {
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
			ao3: {
				commentId: userCommentId,
				targetCommentId: params.target?.id ?? null,
				responderName,
				mode,
			},
		},
		assistantAuthorName: responderName,
		assistantMetadata: {
			ao3: {
				commentId: agentCommentId,
				parentCommentId: userCommentId,
				responderName,
				mode: "reply",
			},
		},
	};
}

function mapCompleteSessionError(e: unknown) {
	if (!(e instanceof Error)) return null;
	if (e.message === "Session not found") return fail(404, { error: e.message });
	if (e.message === "Task not found") return fail(404, { error: e.message });
	if (e.message === "Session not in progress or completed") return fail(409, { error: e.message });
	return null;
}

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const user = locals.user;
	if (!user) throw error(401, "Unauthorized");

	const taskIdStr = params.id;
	const taskId = Number.parseInt(taskIdStr, 10);
	if (Number.isNaN(taskId)) throw error(400, "Invalid task ID");

	const taskData = await db.query.task.findFirst({
		where: eq(task.id, taskId),
		with: {
			variant: true,
			template: true,
		},
	});

	if (!taskData) throw error(404, "Task not found");

	const existingSession = await db.query.practiceSession.findFirst({
		where: and(
			eq(practiceSession.taskId, taskId),
			eq(practiceSession.userId, user.id),
			inArray(practiceSession.status, ["in_progress", "completed", "evaluated"]),
		),
		orderBy: (sessions, { desc }) => [desc(sessions.startedAt)],
		with: {
			messages: true,
		},
	});

	if (!isPracticeUiImplemented(taskData.template.ui)) {
		throw error(501, `The ${taskData.template.ui} interface is not implemented yet.`);
	}

	const parentData = await parent();
	const avatarUrl = parentData.avatarUrl;
	const learningLanguage = taskData.language;

	return {
		task: taskData,
		existingSession,
		taskId: taskIdStr,
		agentPrompt: taskData.agentPrompt || "",
		maxTurns: taskData.template.maxTurns || 0,
		agentStartsFirst: taskData.template.agentStartsFirst,
		user: {
			name: user.name || "Learner",
			avatarUrl,
			learningLanguage,
		},
	};
};

export const actions: Actions = {
	start: async ({ params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		try {
			const result = await startSession(taskId, user.id);
			return { success: true, ...result };
		} catch (e) {
			const mappedError = mapStartSessionError(e);
			if (mappedError) return mappedError;

			console.error("Failed to start session:", e);
			return fail(500, { error: "Failed to start session" });
		}
	},

	send: async ({ request, params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const rawMessage = formData.get("message") as string;
		const clientMessageIdValue = formData.get("clientMessageId");
		const clientMessageId = typeof clientMessageIdValue === "string" ? clientMessageIdValue.trim() : "";

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!rawMessage?.trim()) return fail(400, { error: "Message is required" });

		try {
			const taskData = await db.query.task.findFirst({
				where: eq(task.id, taskId),
				with: { template: true, variant: true },
			});
			if (!taskData) {
				return fail(404, { error: "Task not found" });
			}

			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const formattedMessage = emojiConverter.replace_unified(rawMessage);
			const hiddenUserMessage = isAgentStartTrigger(rawMessage, clientMessageId, sessionId);
			const sendOptions: Parameters<typeof sendMessage>[4] = {
				hiddenUserMessage,
				maxTurns: taskData.template.maxTurns,
			};

			if (taskData.template.ui === "ao3" && !hiddenUserMessage) {
				if (!clientMessageId) return fail(400, { error: "clientMessageId is required for AO3 comments" });

				const openingState = (taskData.variant?.openingState ?? {}) as Ao3OpeningState;
				const targetCommentId = getFormString(formData, "ao3TargetCommentId") || null;
				let target = findAo3Target(openingState, targetCommentId);

				if (targetCommentId && !target) {
					const sessionWithMessages = await db.query.practiceSession.findFirst({
						where: eq(practiceSession.id, sessionId),
						with: { messages: true },
					});
					const chatMessages = buildChatMessages({
						rawMessages: sessionWithMessages?.messages ?? [],
						formatTimestamp: () => "Earlier",
						userName: user.name || "Learner",
						agentName: getAo3AuthorName(openingState),
						labels: {
							retryFailedMessage: "Agent reply failed. Click Retry to try again.",
							stillProcessingMessage: "Agent is still processing. Retry in a moment.",
						},
					});
					target = findAo3TargetInMessages(chatMessages, targetCommentId);
				}

				if (targetCommentId && !target) return fail(400, { error: "Invalid AO3 reply target" });

				Object.assign(
					sendOptions,
					buildAo3SendOptions({
						openingState,
						target,
						message: formattedMessage,
						clientMessageId,
					}),
				);
			}

			const result = await sendMessage(sessionId, formattedMessage, user.id, clientMessageId || undefined, sendOptions);
			return { success: true, ...result };
		} catch (e) {
			const mappedError = mapSendMessageError(e);
			if (mappedError) return mappedError;

			console.error("Failed to send message:", e);
			return fail(500, { error: "Failed to send message" });
		}
	},

	complete: async ({ request, params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });

		try {
			// Verify session belongs to this user and task
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const feedback = await completeSession(sessionId);
			return { success: true, feedback };
		} catch (e) {
			const mappedError = mapCompleteSessionError(e);
			if (mappedError) return mappedError;

			console.error("Failed to complete session:", e);
			return fail(500, { error: "Failed to complete session" });
		}
	},

	hint: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await event.request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session" });

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const result = await generateHint(sessionId);
			return { success: true, ...result };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to generate hints" });
		}
	},
};
