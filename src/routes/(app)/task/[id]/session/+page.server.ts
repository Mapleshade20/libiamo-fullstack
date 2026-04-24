import crypto from "node:crypto";
import { error, fail } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { practiceSession, task } from "$lib/server/db/schema";
import { completeSession, sendMessage, startSession } from "$lib/server/session";
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

export const load: PageServerLoad = async ({ params, locals }) => {
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

	const email = user.email?.toLowerCase() || "";
	const hash = crypto.createHash("md5").update(email).digest("hex");
	const avatarUrl = `https://cn.cravatar.com/avatar/${hash}?d=identicon&s=192`;

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
};
