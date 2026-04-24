import { error, fail } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { practiceSession, task } from "$lib/server/db/schema";
import { completeSession, generateHint, sendMessage, startSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

function mapSendMessageError(e: unknown) {
	if (!(e instanceof Error)) return null;
	if (e.message === "userMessage is required") return fail(400, { error: e.message });
	if (e.message === "Session not found") return fail(404, { error: e.message });
	if (e.message === "Session not in progress") return fail(409, { error: e.message });
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

	const taskData = await db.query.task.findFirst({
		where: eq(task.id, taskId),
		with: {
			variant: true,
			template: true,
		},
	});

	if (!taskData) throw error(404, "Task not found");
	const IMPLEMENTED_UIS = ["discord"];

	if (!IMPLEMENTED_UIS.includes(taskData.template.ui)) {
		throw error(501, `The ${taskData.template.ui} interface is not implemented yet.`);
	}

	const parentData = await parent();
	const avatarUrl = parentData.avatarUrl;
	const learningLanguage = user.activeLanguage || "en";

	return {
		task: taskData,
		existingSession,
		taskId: taskIdStr,
		agentPrompt: taskData.agentPrompt || "",
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
			const langCode = user.activeLanguage || "en";
			const languageMap: Record<string, string> = {
				en: "English",
				es: "Spanish",
				fr: "French",
				ja: "Japanese",
			};
			const learningLanguageName = languageMap[langCode] || langCode;

			const result = await startSession(taskId, user.id, learningLanguageName);
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
		const message = formData.get("message") as string;

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!message?.trim()) return fail(400, { error: "Message is required" });

		try {
			// Verify session belongs to this user and task
			const session = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, sessionId),
			});

			if (!session || session.userId !== user.id || session.taskId !== taskId) {
				return fail(403, { error: "Access denied" });
			}

			const result = await sendMessage(sessionId, message);
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
			const session = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, sessionId),
			});

			if (!session || session.userId !== user.id || session.taskId !== taskId) {
				return fail(403, { error: "Access denied" });
			}

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

		const formData = await event.request.formData();
		const sessionId = Number(formData.get("sessionId"));

		if (!sessionId) return fail(400, { error: "Invalid session" });

		try {
			const result = await generateHint(sessionId);
			return { success: true, ...result };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to generate hints" });
		}
	},
};
