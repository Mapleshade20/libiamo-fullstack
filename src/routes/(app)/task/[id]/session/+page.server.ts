import { error, fail } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import EmojiConverter from "emoji-js";
import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";
import { MAIL_AGENT_OPENING_MESSAGE } from "$lib/components/practice-ui/mail/constants";
import { summarizeMailBodyLayout } from "$lib/components/practice-ui/mail/mailUtils";
import { MAIL_TEXT_MAX_LENGTH, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { practiceSession, task } from "$lib/server/db/schema";
import { buildPracticeUiSendOptions } from "$lib/server/practice-ui/send-options";
import {
	completeSession,
	generateHint,
	getSessionOrFail,
	requestAgentOpening,
	type SendMessageOptions,
	sendMessage,
	startSession,
} from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

const emojiConverter = new EmojiConverter();
emojiConverter.colons_mode = true;

function isMailAgentStartTrigger(message: string, clientMessageId: string, sessionId: number) {
	return message.trim() === MAIL_AGENT_OPENING_MESSAGE && clientMessageId === `join-${sessionId}`;
}

function getMessageMaxLength(ui: string) {
	return ui === "apple_mail" ? MAIL_TEXT_MAX_LENGTH : PRACTICE_UI_TEXT_MAX_LENGTH;
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
			if (rawMessage.length > getMessageMaxLength(taskData.template.ui)) return fail(400, { error: "Message is too long" });

			const session = await getSessionOrFail(sessionId, user.id, taskId);
			if (!session) return fail(403, { error: "Access denied" });

			const formattedMessage = emojiConverter.replace_unified(rawMessage);
			const hiddenUserMessage = isMailAgentStartTrigger(rawMessage, clientMessageId, sessionId);

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

	agentOpening: async ({ request, params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const taskId = Number.parseInt(params.id, 10);
		if (Number.isNaN(taskId)) return fail(400, { error: "Invalid task ID" });

		const formData = await request.formData();
		const sessionId = Number.parseInt(formData.get("sessionId") as string, 10);
		const clientMessageIdValue = formData.get("clientMessageId");
		const clientMessageId = typeof clientMessageIdValue === "string" ? clientMessageIdValue.trim() : "";

		if (Number.isNaN(sessionId)) return fail(400, { error: "Invalid session ID" });

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

			const result = await requestAgentOpening(sessionId, user.id, clientMessageId || undefined, {
				maxTurns: taskData.template.maxTurns,
			});
			return { success: true, ...result };
		} catch (e) {
			const mappedError = mapSendMessageError(e);
			if (mappedError) return mappedError;

			console.error("Failed to request agent opening:", e);
			return fail(500, { error: "Failed to request agent opening" });
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
};
