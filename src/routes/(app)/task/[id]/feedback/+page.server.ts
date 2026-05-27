import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { practiceSession } from "$lib/server/db/schema";
import { buildFeedbackConversation, generateFeedback, getExistingFeedback } from "$lib/server/feedback";
import { getSessionOrFail } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, "Unauthorized");

	const taskIdStr = params.id;
	const taskId = Number.parseInt(taskIdStr, 10);
	if (Number.isNaN(taskId)) throw error(400, "Invalid task ID");

	// Get the session
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.taskId, taskId),
		with: {
			messages: { orderBy: (messages, { asc }) => [asc(messages.createdAt)] },
			task: {
				with: {
					variant: true,
					template: true,
				},
			},
		},
	});

	if (!session) throw error(404, "Session not found");
	if (session.userId !== user.id) throw error(403, "Access denied");

	// Redirect if not completed
	if (session.status !== "completed" && session.status !== "evaluated") {
		throw redirect(303, `/task/${taskId}/session`);
	}

	// Get task data
	const taskData = session.task;
	if (!taskData) throw error(404, "Task not found");

	// Build conversation structure
	const snapshot = session.agentPromptSnapshot as { ui?: string; scenarioContext?: string };
	const ui = (snapshot.ui ?? taskData.template?.ui ?? "discord") as string;
	const openingState = (taskData.variant?.openingState as Record<string, unknown>) ?? {};

	const visibleMessages = session.messages.filter((m) => {
		const metadata = m.llmMetadata as { hidden?: boolean } | null;
		return !metadata?.hidden;
	});

	const conversation = buildFeedbackConversation(
		visibleMessages.map((m) => ({
			id: m.id,
			role: m.role,
			content: m.content,
			createdAt: m.createdAt,
			llmMetadata: m.llmMetadata,
		})),
		openingState,
		ui as any,
	);

	// Check if feedback already exists
	const existingFeedback = await getExistingFeedback(session.id);

	return {
		sessionId: session.id,
		taskId: taskIdStr,
		taskTitle: taskData.title,
		conversation,
		existingFeedback,
		language: taskData.language,
	};
};

export const actions: Actions = {
	generateFeedback: async ({ params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		try {
			// Get session
			const session = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.taskId, taskId),
				columns: { id: true, userId: true, status: true },
			});

			if (!session) return fail(404, { error: "Session not found" });
			if (session.userId !== user.id) return fail(403, { error: "Access denied" });
			if (session.status !== "completed" && session.status !== "evaluated") {
				return fail(400, { error: "Session not completed" });
			}

			const feedback = await generateFeedback(session.id);

			return {
				success: true,
				feedback,
			};
		} catch (e) {
			console.error("Failed to generate feedback:", e);
			return fail(500, { error: "Failed to generate feedback" });
		}
	},

	followUp: async ({ request, params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const itemText = (formData.get("itemText") as string)?.trim();
		const category = (formData.get("category") as string)?.trim();
		const question = (formData.get("question") as string)?.trim();

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!itemText || !category || !question) {
			return fail(400, { error: "Missing required fields" });
		}

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const { followUpOnFeedback } = await import("$lib/server/session");
			const result = await followUpOnFeedback({
				sessionId,
				userId: user.id,
				itemText,
				category: category as "grammar" | "vocabulary" | "coherence",
				question,
			});
			return { success: true, answer: result.answer };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to get follow-up answer" });
		}
	},

	saveNote: async ({ request, params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const annotationText = (formData.get("annotationText") as string)?.trim();
		const annotationKind = (formData.get("annotationKind") as string)?.trim();
		const explanation = (formData.get("explanation") as string)?.trim();

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!annotationText || !annotationKind || !explanation) {
			return fail(400, { error: "Missing required fields" });
		}

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			// Get task language
			const sessionData = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, sessionId),
				with: { task: { columns: { language: true } } },
			});

			const language = sessionData?.task?.language ?? "en";

			// Create note using existing infrastructure
			const { createNotesBatch } = await import("$lib/server/note");
			const categoryMap: Record<string, "grammar" | "vocabulary" | "coherence"> = {
				grammar: "grammar",
				vocab: "vocabulary",
				delete: "grammar",
			};
			const category = categoryMap[annotationKind] ?? "grammar";

			const tutorComment = `${annotationText}: ${explanation}`;
			const notes = await createNotesBatch(user.id, sessionId, language, [{ tutorComment, category }], user.id);

			return { success: true, note: notes[0] };
		} catch (e) {
			console.error("Failed to save note:", e);
			return fail(500, { error: "Failed to save note" });
		}
	},
};
