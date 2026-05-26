import { error, fail } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import EmojiConverter from "emoji-js";
import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";
import { MAIL_AGENT_OPENING_MESSAGE } from "$lib/components/practice-ui/mail/constants";
import { summarizeMailBodyLayout } from "$lib/components/practice-ui/mail/mailUtils";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { practiceSession, task } from "$lib/server/db/schema";
import { createNoteFromSelectionQA, createNotesBatch, validateAndCreateNoteFromSelection } from "$lib/server/note";
import { buildPracticeUiSendOptions } from "$lib/server/practice-ui/send-options";
import {
	completeSession,
	followUpOnFeedback,
	generateHint,
	getSessionOrFail,
	type SendMessageOptions,
	sendMessage,
	startSession,
} from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

const emojiConverter = new EmojiConverter();
emojiConverter.colons_mode = true;

function isAgentStartTrigger(message: string, clientMessageId: string, sessionId: number) {
	return (message.trim() === "*User joined the server*" || message.trim() === MAIL_AGENT_OPENING_MESSAGE) && clientMessageId === `join-${sessionId}`;
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

async function getLearnerProfileName(user: { id: string; name?: string | null }) {
	const userProfile = await db.query.user.findFirst({
		where: eq(authUser.id, user.id),
		columns: { name: true },
	});
	return userProfile?.name || user.name || "Learner";
}

function parseHintContextPath(value: FormDataEntryValue | null): Array<{ author: string; text: string }> | undefined {
	if (typeof value !== "string" || !value.trim()) return undefined;

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return undefined;
		const contextPath = parsed.filter(
			(item): item is { author: string; text: string } =>
				Boolean(item) && typeof item === "object" && !Array.isArray(item) && typeof item.author === "string" && typeof item.text === "string",
		);
		return contextPath.length ? contextPath : undefined;
	} catch {
		return undefined;
	}
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

	const userProfile = await db.query.user.findFirst({
		where: eq(authUser.id, user.id),
		columns: {
			name: true,
			timezone: true,
		},
	});

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
			name: userProfile?.name || user.name || "Learner",
			avatarUrl,
			learningLanguage,
			timezone: userProfile?.timezone || user.timezone || "UTC",
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

			const sendOptions: SendMessageOptions = {
				hiddenUserMessage,
				maxTurns: taskData.template.maxTurns,
			};
			const learnerProfileName = taskData.template.ui === "apple_mail" ? await getLearnerProfileName(user) : user.name || "Learner";
			const mailNameInstruction = [
				`Learner profile display name: ${learnerProfileName}.`,
				"Use this profile name for the first direct greeting if the learner has not clearly introduced another preferred name.",
				"After the learner self-identifies in the email thread, use the learner's own stated name instead.",
			].join("\n");
			if (hiddenUserMessage && taskData.template.ui === "apple_mail") {
				sendOptions.promptContent = [
					"This is an internal Apple Mail practice trigger, not a learner-authored email.",
					"Use the task template, agent prompt, and scenario/opening-state context already provided in the system prompt to write the first visible email.",
					"If that context describes a specific incoming message or situation, follow it closely. Only invent a concise plausible initiating email when the template does not provide one.",
					"Do not welcome the learner to the app, do not say you will help draft the email, and do not speak as a tutor or assistant.",
					mailNameInstruction,
				].join("\n");
			}

			if (!hiddenUserMessage) {
				const uiOptions = await buildPracticeUiSendOptions({
					ui: taskData.template.ui,
					formData,
					openingState: taskData.variant?.openingState,
					sessionId,
					message: formattedMessage,
					clientMessageId,
					userName: user.name || "Learner",
				});

				if (!uiOptions.ok) return fail(uiOptions.status, { error: uiOptions.error });
				Object.assign(sendOptions, uiOptions.options);
				if (taskData.template.ui === "apple_mail") {
					const mailBodyHtml =
						sendOptions.userMetadata && typeof sendOptions.userMetadata.mailBodyHtml === "string" ? sendOptions.userMetadata.mailBodyHtml : "";
					const mailBodyLayout = summarizeMailBodyLayout(mailBodyHtml);
					const mailFormatInstruction = [
						mailBodyLayout
							? `Learner email body layout:\n${mailBodyLayout}`
							: "Learner email body layout: plain text or no special formatting detected.",
						"Use this layout context when interpreting the learner's message. If your email reply benefits from structure, use clear plain-text paragraphs, indentation, or list markers that preserve the intended email formatting.",
					].join("\n");
					sendOptions.promptContent = [formattedMessage, mailNameInstruction, mailFormatInstruction].join("\n\n");
					sendOptions.userDisplayContent = formattedMessage;
				}
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

			return {
				success: true,
				feedback,
			};
		} catch (e) {
			const mappedError = mapCompleteSessionError(e);
			if (mappedError) return mappedError;

			console.error("Failed to complete session:", e);
			return fail(500, { error: "Failed to complete session" });
		}
	},

	saveNotes: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });

		const checkedItemsRaw = formData.getAll("checkedItems");
		if (checkedItemsRaw.length === 0) return fail(400, { error: "No items selected" });

		const ALLOWED_CATEGORIES = ["grammar", "vocabulary", "coherence"] as const;
		type Category = (typeof ALLOWED_CATEGORIES)[number];

		// Validate each checked item: must be a non-empty string with a valid category prefix
		const parsed: { tutorComment: string; category: Category }[] = [];
		for (const raw of checkedItemsRaw) {
			if (typeof raw !== "string") return fail(400, { error: "Invalid checked item" });
			const pipeIdx = raw.indexOf("|");
			if (pipeIdx === -1) return fail(400, { error: "Invalid checked item format" });
			const category = raw.slice(0, pipeIdx);
			if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
				return fail(400, { error: "Invalid category" });
			}
			const tutorComment = raw.slice(pipeIdx + 1).trim();
			if (!tutorComment) return fail(400, { error: "Empty feedback item text" });
			parsed.push({ tutorComment, category: category as Category });
		}

		try {
			// Fetch the task language from the session
			const session = await db.query.practiceSession.findFirst({
				where: and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, user.id)),
				with: { task: { columns: { language: true } } },
			});
			if (!session) return fail(403, { error: "Session not found" });

			const notes = await createNotesBatch(user.id, sessionId, session.task?.language ?? "en", parsed, user.id);
			return { success: true, count: notes.length };
		} catch (e) {
			console.error("Failed to save notes:", e);
			return fail(500, { error: "Failed to generate notes" });
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

		const contextPath = parseHintContextPath(formData.get("contextPath"));

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const result = await generateHint(sessionId, contextPath);
			return { success: true, ...result };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to generate hints" });
		}
	},

	followUp: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await event.request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const itemText = (formData.get("itemText") as string)?.trim();
		const category = (formData.get("category") as string)?.trim();
		const question = (formData.get("question") as string)?.trim();

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!itemText) return fail(400, { error: "Feedback item text is required" });
		if (!category || !["grammar", "vocabulary", "coherence"].includes(category)) {
			return fail(400, { error: "Valid category is required" });
		}
		if (!question) return fail(400, { error: "Question is required" });

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

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

	createNoteFromSelection: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await event.request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const selectedText = (formData.get("selectedText") as string)?.trim();
		const surroundingContext = (formData.get("surroundingContext") as string)?.trim();

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!selectedText) return fail(400, { error: "No text selected" });
		if (!surroundingContext) return fail(400, { error: "Surrounding context is required" });

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const sessionData = await db.query.practiceSession.findFirst({
				where: and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, user.id)),
				with: { task: { columns: { language: true } } },
			});
			const language = sessionData?.task?.language ?? "en";

			const result = await validateAndCreateNoteFromSelection({
				userId: user.id,
				sessionId,
				selectedText,
				surroundingContext,
				language,
			});

			if (result.success) {
				return { success: true, note: result.note };
			}
			return { success: false, reason: result.reason };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to create note from selection" });
		}
	},

	followUpOnSelection: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await event.request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const selectedText = (formData.get("selectedText") as string)?.trim();
		const surroundingContext = (formData.get("surroundingContext") as string)?.trim();
		const question = (formData.get("question") as string)?.trim();

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!selectedText) return fail(400, { error: "No text selected" });
		if (!surroundingContext) return fail(400, { error: "Surrounding context is required" });
		if (!question) return fail(400, { error: "Question is required" });

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const fullQuestion = [`Selected text: "${selectedText}"`, `Surrounding context: "${surroundingContext}"`, `Question: ${question}`].join("\n\n");

			const result = await followUpOnFeedback({
				sessionId,
				userId: user.id,
				itemText: selectedText,
				category: "grammar",
				question: fullQuestion,
			});
			return { success: true, answer: result.answer };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to get follow-up answer" });
		}
	},

	saveNoteFromSelection: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await event.request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const selectedText = (formData.get("selectedText") as string)?.trim();
		const surroundingContext = (formData.get("surroundingContext") as string)?.trim();
		const question = (formData.get("question") as string)?.trim();
		const answer = (formData.get("answer") as string)?.trim();

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!selectedText || !surroundingContext || !question || !answer) {
			return fail(400, { error: "Missing required fields" });
		}

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const sessionData = await db.query.practiceSession.findFirst({
				where: and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, user.id)),
				with: { task: { columns: { language: true } } },
			});
			const language = sessionData?.task?.language ?? "en";

			const result = await createNoteFromSelectionQA({
				userId: user.id,
				sessionId,
				selectedText,
				surroundingContext,
				question,
				answer,
				language,
			});

			return { success: true, note: result.note };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to save note from selection" });
		}
	},
};
