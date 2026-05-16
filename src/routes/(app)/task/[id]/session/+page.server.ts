import { error, fail } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import EmojiConverter from "emoji-js";
import { db } from "$lib/server/db";
import { practiceSession, task } from "$lib/server/db/schema";
import {
	completeSession,
	generateHint,
	generateMailHint,
	getSessionOrFail,
	sendMessage,
	startSession,
	submitOneShotMessage,
} from "$lib/server/session";
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

	const IMPLEMENTED_UIS = ["discord", "apple_mail"];
	if (!IMPLEMENTED_UIS.includes(taskData.template.ui)) {
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
				with: { template: true },
			});
			if (!taskData) {
				return fail(404, { error: "Task not found" });
			}

			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const formattedMessage = emojiConverter.replace_unified(rawMessage);
			const hiddenUserMessage = isAgentStartTrigger(rawMessage, clientMessageId, sessionId);

			const result = await sendMessage(sessionId, formattedMessage, clientMessageId || undefined, {
				hiddenUserMessage,
				maxTurns: taskData.template.maxTurns,
			});
			return { success: true, ...result };
		} catch (e) {
			const mappedError = mapSendMessageError(e);
			if (mappedError) return mappedError;

			console.error("Failed to send message:", e);
			return fail(500, { error: "Failed to send message" });
		}
	},

	submit: async ({ request, params, locals }) => {
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
				with: { template: true },
			});
			if (!taskData) return fail(404, { error: "Task not found" });
			if (taskData.template.interactionType !== "oneshot") {
				return fail(400, { error: "Submit is only available for one-shot tasks" });
			}

			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const formattedMessage = emojiConverter.replace_unified(rawMessage);
			const submitResult = await submitOneShotMessage(sessionId, formattedMessage, clientMessageId || undefined, {
				maxTurns: taskData.template.maxTurns,
			});
			const feedback = await completeSession(sessionId);

			return { success: true, ...submitResult, feedback };
		} catch (e) {
			const mappedSendError = mapSendMessageError(e);
			if (mappedSendError) return mappedSendError;

			const mappedCompleteError = mapCompleteSessionError(e);
			if (mappedCompleteError) return mappedCompleteError;

			console.error("Failed to submit one-shot session:", e);
			return fail(500, { error: "Failed to submit session" });
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

			const taskData = await db.query.task.findFirst({
				where: eq(task.id, taskId),
				with: { template: true },
			});
			if (!taskData) return fail(404, { error: "Task not found" });

			if (taskData.template.ui === "apple_mail") {
				const result = await generateMailHint(sessionId, {
					to: formData.get("to")?.toString() ?? "",
					subject: formData.get("subject")?.toString() ?? "",
					body: formData.get("body")?.toString() ?? "",
				});
				return { success: true, ...result };
			}

			const result = await generateHint(sessionId);
			return { success: true, ...result };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to generate hints" });
		}
	},
};
