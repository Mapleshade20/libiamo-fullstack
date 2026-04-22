import { error, fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { practiceSession, task } from "$lib/server/db/schema";
import { completeSession, sendMessage, startSession } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, "Unauthorized");

	const taskId = Number.parseInt(params.id, 10);
	if (Number.isNaN(taskId)) throw error(400, "Invalid task ID");

	// Check if there's an existing in-progress session for this user+task
	const existingSession = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.taskId, taskId),
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

	return {
		task: taskData,
		existingSession: existingSession?.status === "in_progress" ? existingSession : null,
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
			// Verify session belongs to this user
			const session = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, sessionId),
			});

			if (!session || session.userId !== user.id) {
				return fail(403, { error: "Access denied" });
			}

			const result = await sendMessage(sessionId, message);
			return { success: true, ...result };
		} catch (e) {
			console.error("Failed to send message:", e);
			return fail(500, { error: "Failed to send message" });
		}
	},

	complete: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });

		try {
			// Verify session belongs to this user
			const session = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, sessionId),
			});

			if (!session || session.userId !== user.id) {
				return fail(403, { error: "Access denied" });
			}

			await completeSession(sessionId);
			return { success: true };
		} catch (e) {
			console.error("Failed to complete session:", e);
			return fail(500, { error: "Failed to complete session" });
		}
	},
};
