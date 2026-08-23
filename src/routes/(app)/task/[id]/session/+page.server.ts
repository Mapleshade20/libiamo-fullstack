import { error, fail } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import EmojiConverter from "emoji-js";
import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";
import { parseDraftFromMessage, summarizeMailBodyLayout } from "$lib/components/practice-ui/mail/mailUtils";
import {
	CLIENT_MESSAGE_ID_MAX_LENGTH,
	MAIL_TEXT_MAX_LENGTH,
	PRACTICE_UI_TEXT_MAX_LENGTH,
	USER_LONG_TEXT_MAX_LENGTH,
	USER_TEXT_MAX_LENGTH,
} from "$lib/constants";
import { PRACTICE_SESSION_DEPENDENCY } from "$lib/load-dependencies";
import { requireUser } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { agentResponseBatch, practiceSession, task } from "$lib/server/db/schema";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { buildPracticeUiSendOptions } from "$lib/server/practice-ui/send-options";
import {
	completeSession,
	generateHint,
	getSessionOrFail,
	orderSessionMessagesChronologically,
	type SubmitMessageOptions,
	startSession,
	submitMessage,
} from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

const emojiConverter = new EmojiConverter();
emojiConverter.colons_mode = true;

function isOverlongMessage(ui: string, rawMessage: string) {
	if (ui === "apple_mail") {
		return parseDraftFromMessage(rawMessage, "").body.length > MAIL_TEXT_MAX_LENGTH;
	}
	return rawMessage.length > PRACTICE_UI_TEXT_MAX_LENGTH;
}

function isOversizedMetadataId(value: string) {
	return value.length > CLIENT_MESSAGE_ID_MAX_LENGTH;
}

function getConversationContextMaxLength(maxTurns?: number | null) {
	return (maxTurns && maxTurns > 0 ? PRACTICE_UI_TEXT_MAX_LENGTH * 2 * maxTurns : 0) + USER_LONG_TEXT_MAX_LENGTH;
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
	if (e.message === "Session not in progress or completed" || e.message === "Session not in progress") return fail(409, { error: e.message });
	return null;
}

async function getLearnerProfileName(user: { id: string; name?: string | null }) {
	const userProfile = await db.query.user.findFirst({
		where: eq(authUser.id, user.id),
		columns: { name: true },
	});
	return userProfile?.name || user.name || "Learner";
}

function parseHintContextPath(value: FormDataEntryValue | null, maxLength: number): Array<{ author: string; text: string }> | undefined {
	if (typeof value !== "string" || !value.trim()) return undefined;
	if (value.length > maxLength) return undefined;

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return undefined;
		const contextPath = parsed.filter(
			(item): item is { author: string; text: string } =>
				Boolean(item) && typeof item === "object" && !Array.isArray(item) && typeof item.author === "string" && typeof item.text === "string",
		);
		if (contextPath.some((item) => item.author.length > USER_TEXT_MAX_LENGTH || item.text.length > USER_LONG_TEXT_MAX_LENGTH)) return undefined;
		if (contextPath.reduce((total, item) => total + item.text.length, 0) > maxLength) return undefined;
		return contextPath.length ? contextPath : undefined;
	} catch {
		return undefined;
	}
}

export const load: PageServerLoad = async ({ params, locals, depends }) => {
	depends?.(PRACTICE_SESSION_DEPENDENCY);
	const user = requireUser({ locals });

	const taskIdStr = params.id;
	const taskId = Number.parseInt(taskIdStr, 10);
	if (Number.isNaN(taskId)) throw error(400, "Invalid task ID");

	const taskData = await db.query.task.findFirst({
		where: eq(task.id, taskId),
		columns: {
			id: true,
			title: true,
			language: true,
		},
		with: {
			variant: { columns: { openingState: true } },
			template: { columns: { ui: true, maxTurns: true } },
		},
	});

	if (!taskData) throw error(404, "Task not found");

	const existingSession = await db.query.practiceSession.findFirst({
		where: and(
			eq(practiceSession.taskId, taskId),
			eq(practiceSession.userId, user.id),
			inArray(practiceSession.status, ["in_progress", "completed", "evaluated"]),
		),
		columns: {
			id: true,
			status: true,
			tutorFeedback: true,
			agentReadUpToMessageId: true,
			maxTurnsSnapshot: true,
		},
		orderBy: (sessions, { desc }) => [desc(sessions.startedAt), desc(sessions.id)],
		with: {
			messages: {
				columns: {
					id: true,
					role: true,
					content: true,
					createdAt: true,
					llmMetadata: true,
				},
				orderBy: orderSessionMessagesChronologically,
			},
		},
	});

	if (!isPracticeUiImplemented(taskData.template.ui)) {
		throw error(501, `The ${taskData.template.ui} interface is not implemented yet.`);
	}

	const latestAssistantMessageId = existingSession?.messages.reduce(
		(latest, message) => (message.role === "assistant" ? Math.max(latest, message.id) : latest),
		0,
	);
	if (existingSession && latestAssistantMessageId) {
		await db
			.update(practiceSession)
			.set({ lastSeenAssistantMessageId: latestAssistantMessageId })
			.where(and(eq(practiceSession.id, existingSession.id), eq(practiceSession.userId, user.id)));
	}

	// Earliest outstanding agent work for this session (batches still composing or
	// pacing out deliveries). The client keeps polling while work is due soon and
	// wakes once when the next item falls due, so later burst deliveries are never
	// stranded after the pending placeholder clears.
	const outstandingAgentWork = existingSession
		? await db.query.agentResponseBatch.findFirst({
				where: and(
					eq(agentResponseBatch.sessionId, existingSession.id),
					inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
				),
				columns: { dueAt: true },
				orderBy: (batches, { asc }) => [asc(batches.dueAt)],
			})
		: null;

	return {
		task: taskData,
		existingSession: existingSession ? { ...existingSession, nextAgentWorkDueAt: outstandingAgentWork?.dueAt ?? null } : null,
		taskId: taskIdStr,
		// Frozen at session start; legacy sessions without a snapshot fall back to the live template value.
		maxTurns: existingSession?.maxTurnsSnapshot ?? taskData.template.maxTurns ?? 0,
	};
};

export const actions: Actions = {
	start: async ({ params, locals }) => {
		const user = requireUser({ locals });

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
		const user = requireUser({ locals });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const rawMessage = formData.get("message") as string;
		const clientMessageIdValue = formData.get("clientMessageId");
		const clientMessageId = typeof clientMessageIdValue === "string" ? clientMessageIdValue.trim() : "";

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });
		if (!rawMessage?.trim()) return fail(400, { error: "Message is required" });
		if (clientMessageId && isOversizedMetadataId(clientMessageId)) return fail(400, { error: "Client message ID is too long" });

		try {
			const taskData = await db.query.task.findFirst({
				where: eq(task.id, taskId),
				with: { template: true, variant: true },
			});
			if (!taskData) {
				return fail(404, { error: "Task not found" });
			}

			if (isOverlongMessage(taskData.template.ui, rawMessage)) {
				return fail(400, { error: "Message is too long" });
			}

			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const formattedMessage = emojiConverter.replace_unified(rawMessage);

			const sendOptions: SubmitMessageOptions = {
				// Prefer the turn limit frozen at session start so admin template edits never
				// change the rules (or the displayed remaining turns) mid-session.
				maxTurns: session.maxTurnsSnapshot ?? taskData.template.maxTurns,
			};
			let mailNameInstruction = "";
			if (taskData.template.ui === "apple_mail") {
				const learnerProfileName = await getLearnerProfileName(user);
				mailNameInstruction = [
					`Learner profile display name: ${learnerProfileName}.`,
					"Use this profile name for the first direct greeting if the learner has not clearly introduced another preferred name.",
					"After the learner self-identifies in the email thread, use the learner's own stated name instead.",
				].join("\n");
			}

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

			const result = await submitMessage(sessionId, formattedMessage, user.id, clientMessageId || undefined, sendOptions);
			return { success: true, ...result };
		} catch (e) {
			const mappedError = mapSendMessageError(e);
			if (mappedError) return mappedError;

			return fail(llmErrorStatus(e), { error: llmErrorMessage(e) });
		}
	},

	complete: async ({ request, params, locals }) => {
		const user = requireUser({ locals });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });

		try {
			// Verify session belongs to this user and task
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			await completeSession(sessionId);

			return {
				success: true,
			};
		} catch (e) {
			const mappedError = mapCompleteSessionError(e);
			if (mappedError) return mappedError;

			console.error("Failed to complete session:", e);
			return fail(500, { error: "Failed to complete session" });
		}
	},

	hint: async (event) => {
		const user = requireUser(event);

		const taskId = Number.parseInt(event.params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await event.request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const modeValue = formData.get("mode");
		const mode = modeValue ?? "content";
		const draftValue = formData.get("draft");
		const expressionValue = formData.get("expression");
		const contextPathRaw = formData.get("contextPath");

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session" });
		if (mode !== "content" && mode !== "expression") return fail(400, { error: "Invalid hint mode" });
		const draft = typeof draftValue === "string" ? draftValue.trim() : "";
		const expression = typeof expressionValue === "string" ? expressionValue.trim() : "";
		if (draft.length > USER_LONG_TEXT_MAX_LENGTH) return fail(400, { error: "Draft is too long" });
		if (expression.length > USER_TEXT_MAX_LENGTH) return fail(400, { error: "Expression is too long" });
		if (mode === "expression" && !expression) return fail(400, { error: "Expression is required" });

		try {
			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const taskData = await db.query.task.findFirst({
				where: eq(task.id, taskId),
				with: { template: true },
			});
			if (!taskData) return fail(404, { error: "Task not found" });

			const contextPath = parseHintContextPath(contextPathRaw, getConversationContextMaxLength(taskData.template.maxTurns));
			const result = await generateHint(sessionId, {
				mode,
				draft,
				expression,
				nativeLanguage: user.nativeLanguage,
				contextPath,
			});
			return { success: true, ...result };
		} catch (e) {
			return fail(llmErrorStatus(e), { error: llmErrorMessage(e) });
		}
	},
};
