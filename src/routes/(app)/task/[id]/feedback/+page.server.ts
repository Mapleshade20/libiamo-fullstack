import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { USER_LONG_TEXT_MAX_LENGTH, USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { requireUser } from "$lib/server/authz";
import { db } from "$lib/server/db";
import { practiceSession } from "$lib/server/db/schema";
import { buildFeedbackConversation, followUpOnFeedback, generateFeedback, getExistingFeedback } from "$lib/server/feedback";
import { createNotesBatch, createNotesFromSelectionBatch } from "$lib/server/note";
import { getSessionOrFail } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

function hasOversizedUserText(values: string[]) {
	return values.some((value) => value.length > USER_TEXT_MAX_LENGTH);
}

function hasOversizedUserLongText(values: string[]) {
	return values.some((value) => value.length > USER_LONG_TEXT_MAX_LENGTH);
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireUser({ locals });

	const taskIdStr = params.id;
	const taskId = Number.parseInt(taskIdStr, 10);
	if (Number.isNaN(taskId)) throw error(400, "Invalid task ID");

	// Get the current user's session. If it doesn't exist yet, send them to the session flow.
	const session = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.taskId, taskId), eq(practiceSession.userId, user.id)),
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

	if (!session) throw redirect(303, `/task/${taskId}/session`);

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
		const user = requireUser({ locals });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		try {
			// Get session
			const session = await db.query.practiceSession.findFirst({
				where: and(eq(practiceSession.taskId, taskId), eq(practiceSession.userId, user.id)),
				columns: { id: true, userId: true, status: true },
			});

			if (!session) return fail(400, { error: "Session not completed" });
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
		const user = requireUser({ locals });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const itemText = (formData.get("itemText") as string)?.trim();
		const category = (formData.get("category") as string)?.trim();
		const question = (formData.get("question") as string)?.trim();
		const currentContext = (formData.get("currentContext") as string | null)?.trim() ?? "";
		const previousContext = (formData.get("previousContext") as string | null)?.trim() ?? "";
		const explanationModeRaw = (formData.get("explanationMode") as string | null)?.trim();
		const explanationMode = explanationModeRaw === "good_expression" ? "good_expression" : "issue";

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!itemText || !category || !question) {
			return fail(400, { error: "Missing required fields" });
		}
		if (hasOversizedUserText([itemText, category, question]) || hasOversizedUserLongText([currentContext, previousContext])) {
			return fail(400, { error: "Text is too long" });
		}

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const result = await followUpOnFeedback({
				sessionId,
				userId: user.id,
				itemText,
				category: category as "grammar" | "vocabulary" | "coherence",
				question,
				currentContext,
				previousContext,
				explanationMode,
			});
			return { success: true, answer: result.answer };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to get follow-up answer" });
		}
	},

	saveNote: async ({ request, params, locals }) => {
		const user = requireUser({ locals });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const annotationText = (formData.get("annotationText") as string)?.trim();
		const annotationKind = (formData.get("annotationKind") as string)?.trim();
		const explanation = (formData.get("explanation") as string)?.trim();
		const currentContext = (formData.get("currentContext") as string | null)?.trim() ?? "";
		const previousContext = (formData.get("previousContext") as string | null)?.trim() ?? "";

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!annotationText || !annotationKind || !explanation) {
			return fail(400, { error: "Missing required fields" });
		}
		if (hasOversizedUserText([annotationText, annotationKind, explanation]) || hasOversizedUserLongText([currentContext, previousContext])) {
			return fail(400, { error: "Text is too long" });
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
			const categoryMap: Record<string, "grammar" | "vocabulary" | "coherence"> = {
				grammar: "grammar",
				vocab: "vocabulary",
				delete: "grammar",
			};
			const category = categoryMap[annotationKind] ?? "grammar";

			const tutorComment = `${annotationText}: ${explanation}`;
			const sourceContext = [
				previousContext ? `Previous message/context:\n${previousContext}` : "",
				currentContext ? `Current message/context:\n${currentContext}` : "",
			]
				.filter(Boolean)
				.join("\n\n");
			const notes = await createNotesBatch(user.id, sessionId, language, [{ tutorComment, category, sourceContext }], user.id);

			return { success: true, note: notes[0] };
		} catch (e) {
			console.error("Failed to save note:", e);
			return fail(500, { error: "Failed to save note" });
		}
	},

	saveSelectionNotes: async ({ request, params, locals }) => {
		const user = requireUser({ locals });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const selectedText = (formData.get("selectedText") as string | null)?.trim() ?? "";
		const currentContext = (formData.get("currentContext") as string | null)?.trim() ?? "";
		const previousContext = (formData.get("previousContext") as string | null)?.trim() ?? "";
		const sourceKind = (formData.get("sourceKind") as string | null)?.trim() ?? "feedback review";

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!selectedText) return fail(400, { error: "Missing selected text" });
		if (hasOversizedUserText([selectedText, sourceKind]) || hasOversizedUserLongText([currentContext, previousContext])) {
			return fail(400, { error: "Text is too long" });
		}

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const sessionData = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, sessionId),
				with: { task: { columns: { language: true } } },
			});
			const language = sessionData?.task?.language ?? "en";

			const result = await createNotesFromSelectionBatch({
				userId: user.id,
				sessionId,
				language,
				selectedText,
				currentContext,
				previousContext,
				sourceKind,
			});

			return { success: true, count: result.count, notes: result.notes, reason: result.reason };
		} catch (e) {
			console.error("Failed to save selected notes:", e);
			return fail(500, { error: "Failed to save selected notes" });
		}
	},
};
