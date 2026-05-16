import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName, type UiVariant } from "$lib/constants";
import { type TutorFeedback, tutorFeedbackSchema } from "$lib/schemas";
import { db } from "./db";
import { practiceSession, sessionMessage, task } from "./db/schema";
import { type ChatMessage, createStructuredOutput } from "./llm";
import { getMbtiPrompt, getRandomMbti } from "./mbti";

function appendMessages(ctx: string, label: string, items: Array<Record<string, string | undefined>>): string {
	if (!items.length) return ctx;
	const lines = items.map((c) => `- ${Object.values(c).filter(Boolean).join(": ")}`);
	return `${ctx}\n${label}:\n${lines.join("\n")}`;
}

function buildRedditContext(openingState: Record<string, unknown>): string {
	const post = openingState.post as { title?: string; body?: string } | undefined;
	const comments = openingState.previousComments as Array<{ author?: string; text?: string }> | undefined;
	let ctx = "Scenario: Reddit post";
	if (post?.title) ctx += `\nTitle: ${post.title}`;
	if (post?.body) ctx += `\nContent: ${post.body}`;
	if (comments?.length) ctx = appendMessages(ctx, "Existing comments", comments as Array<Record<string, string | undefined>>);
	return ctx;
}

function buildMailContext(openingState: Record<string, unknown>): string {
	const emails = openingState.emails as Array<{ from?: string; to?: string; subject?: string; body?: string; time?: string }> | undefined;
	if (!emails?.length) return "Scenario: Mail app";

	const emailLines = emails.map((e, i) => {
		const parts = [
			`Email ${i + 1}:`,
			`  From: ${e.from}`,
			`  To: ${e.to}`,
			`  Subject: ${e.subject}`,
			...(e.time ? [`  Time: ${e.time}`] : []),
			`  Body: ${e.body}`,
		];
		return parts.join("\n");
	});

	return `Scenario: Received email${emails.length > 1 ? "s" : ""}\n${emailLines.join("\n\n")}`;
}

function buildDiscordContext(openingState: Record<string, unknown>): string {
	const server = openingState.serverName as string | undefined;
	const channel = openingState.channelName as string | undefined;
	const msgs = openingState.previousMessages as Array<{ sender?: string; text?: string }> | undefined;
	let ctx = "Scenario: Discord";
	if (server) ctx += `\nServer: ${server}`;
	if (channel) ctx += `\nChannel: ${channel}`;
	if (msgs?.length) ctx = appendMessages(ctx, "History", msgs as Array<Record<string, string | undefined>>);
	return ctx;
}

function buildIMessageContext(openingState: Record<string, unknown>): string {
	const prev = openingState.previousMessages as Array<{ sender?: string; text?: string }> | undefined;
	let ctx = "Scenario: iMessage conversation";
	if (prev?.length) ctx = appendMessages(ctx, "Previous", prev as Array<Record<string, string | undefined>>);
	return ctx;
}

function buildAo3Context(openingState: Record<string, unknown>): string {
	const work = openingState.workTitle as string | undefined;
	const excerpt = openingState.bodyExcerpt as string | undefined;
	const comments = openingState.previousComments as Array<{ username?: string; comment?: string }> | undefined;
	let ctx = "Scenario: AO3 work page";
	if (work) ctx += `\nWork: ${work}`;
	if (excerpt) ctx += `\nExcerpt: ${excerpt}`;
	if (comments?.length) ctx = appendMessages(ctx, "Existing comments", comments as Array<Record<string, string | undefined>>);
	return ctx;
}

function buildTranslatorContext(openingState: Record<string, unknown>): string {
	const text = openingState.sourceText as string | undefined;
	return text ? `Text to translate: ${text}` : "Translation task";
}

function buildScenarioContext(ui: UiVariant, openingState: Record<string, unknown>): string {
	const builders: Record<UiVariant, (s: Record<string, unknown>) => string> = {
		reddit: buildRedditContext,
		apple_mail: buildMailContext,
		discord: buildDiscordContext,
		imessage: buildIMessageContext,
		ao3: buildAo3Context,
		translator: buildTranslatorContext,
	};
	return builders[ui]?.(openingState) ?? "";
}

function buildSystemPrompt(agentPrompt: string | null, scenarioContext: string): string {
	const parts: string[] = [];

	if (scenarioContext) parts.push(scenarioContext);
	if (agentPrompt) parts.push(agentPrompt);

	return parts.join("\n\n");
}

export type StartSessionResult = {
	sessionId: number;
	systemPrompt: string;
	mbti: string;
};

export async function startSession(taskId: number, userId: string, _learningLanguage?: string): Promise<StartSessionResult> {
	const taskData = await db.query.task.findFirst({
		where: eq(task.id, taskId),
		with: {
			variant: true,
			template: true,
		},
	});

	if (!taskData?.variant || !taskData.template) {
		throw new Error("Task not found");
	}

	const existingSession = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.userId, userId), eq(practiceSession.taskId, taskId)),
		columns: {
			id: true,
			agentPromptSnapshot: true,
		},
	});
	if (existingSession) {
		const snapshot = existingSession.agentPromptSnapshot as { systemPrompt?: string; mbti?: string };
		return {
			sessionId: existingSession.id,
			systemPrompt: snapshot.systemPrompt ?? "",
			mbti: snapshot.mbti ?? "",
		};
	}

	const mbti = getRandomMbti();
	const mbtiPrefix = getMbtiPrompt(mbti);
	const agentPrompt = taskData.agentPrompt ? `${mbtiPrefix}\n\n${taskData.agentPrompt}` : mbtiPrefix;
	const ui = taskData.template.ui;
	const openingState = taskData.variant.openingState as Record<string, unknown>;
	const scenarioContext = buildScenarioContext(ui, openingState);
	const learningLanguage = getLanguageEnglishName(taskData.language);
	const languageConstraint = `IMPORTANT: You MUST give all your conversational replies in ${learningLanguage.toUpperCase()}.`;

	const baseSystemPrompt = buildSystemPrompt(agentPrompt, scenarioContext);
	const systemPrompt = `${languageConstraint}\n\n${baseSystemPrompt}`;

	const snapshot = { systemPrompt, mbti, ui, scenarioContext };

	try {
		const [session] = await db
			.insert(practiceSession)
			.values({
				userId,
				taskId,
				agentPromptSnapshot: snapshot,
				status: "in_progress",
			})
			.returning();

		if (!session) throw new Error("Failed to create session");
		return { sessionId: session.id, systemPrompt, mbti };
	} catch (error) {
		const racedSession = await db.query.practiceSession.findFirst({
			where: and(eq(practiceSession.userId, userId), eq(practiceSession.taskId, taskId)),
			columns: {
				id: true,
				agentPromptSnapshot: true,
			},
		});
		if (!racedSession) {
			if (error instanceof Error && error.message === "Failed to create session") throw error;
			throw new Error("Failed to create session");
		}

		const racedSnapshot = racedSession.agentPromptSnapshot as { systemPrompt?: string; mbti?: string };
		return {
			sessionId: racedSession.id,
			systemPrompt: racedSnapshot.systemPrompt ?? "",
			mbti: racedSnapshot.mbti ?? "",
		};
	}
}

export type SendMessageResult = {
	reply: string;
	turnCount: number;
	terminated?: boolean;
	pending?: boolean;
};

type SessionMessageMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	hidden?: boolean;
	model?: string;
	raw?: unknown;
};

function getMessageMetadata(value: unknown): SessionMessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as SessionMessageMetadata;
}

function isHiddenUserMessage(message: { role: string; llmMetadata?: unknown }): boolean {
	return message.role === "user" && getMessageMetadata(message.llmMetadata).hidden === true;
}

function countVisibleUserTurns(messages: Array<{ role: string; llmMetadata?: unknown }>): number {
	return messages.filter((message) => message.role === "user" && !isHiddenUserMessage(message)).length;
}

function getExistingUserMessageState<T extends { id?: number; role: string; content: string; llmMetadata?: unknown }>(
	messages: T[],
	clientMessageId: string,
) {
	const userIndex = messages.findIndex(
		(message) => message.role === "user" && getMessageMetadata(message.llmMetadata).clientMessageId === clientMessageId,
	);

	if (userIndex === -1) return null;

	const userMessage = messages[userIndex];
	const messagesAfterUser = messages.slice(userIndex + 1);
	const nextUserMessageIndex = messagesAfterUser.findIndex((message) => message.role === "user");
	const messagesInSameTurn = nextUserMessageIndex === -1 ? messagesAfterUser : messagesAfterUser.slice(0, nextUserMessageIndex);
	const assistantReply = messagesInSameTurn.find((message) => message.role === "assistant");
	const metadata = getMessageMetadata(userMessage.llmMetadata);

	return {
		userMessage,
		assistantReply,
		failed: metadata.failed === true,
	};
}

const AgentReplySchema = z.object({
	reply: z.string().describe("Your conversational reply to the user."),
	terminate: z.boolean().describe("true ONLY IF you are severely offended or the user explicitly says goodbye"),
});

export type SendMessageOptions = {
	hiddenUserMessage?: boolean;
	maxTurns?: number | null;
};

export type SubmitOneShotResult = {
	turnCount: number;
};

export async function sendMessage(
	sessionId: number,
	userMessage: string,
	clientMessageId?: string,
	options: SendMessageOptions = {},
): Promise<SendMessageResult> {
	const trimmedUserMessage = userMessage.trim();
	if (!trimmedUserMessage) {
		throw new Error("userMessage is required");
	}

	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
		with: {
			messages: { orderBy: asc(sessionMessage.createdAt) },
		},
	});

	if (!session) throw new Error("Session not found");
	if (session.status !== "in_progress") throw new Error("Session not in progress");

	let activeMessages = session.messages;
	let existingUserMessage: (typeof session.messages)[number] | null = null;
	let reusedExistingUserMessage = false;

	if (clientMessageId) {
		const existingState = getExistingUserMessageState(session.messages, clientMessageId);
		if (existingState?.assistantReply) {
			return {
				reply: existingState.assistantReply.content,
				turnCount: countVisibleUserTurns(session.messages),
				terminated: getMessageMetadata(existingState.assistantReply.llmMetadata).raw
					? ((getMessageMetadata(existingState.assistantReply.llmMetadata).raw as { terminate?: boolean }).terminate ?? false)
					: false,
			};
		}

		if (existingState && !existingState.failed) {
			return {
				reply: "",
				turnCount: countVisibleUserTurns(session.messages),
				pending: true,
			};
		}

		existingUserMessage = existingState?.userMessage ?? null;
		reusedExistingUserMessage = existingUserMessage !== null;
	}

	const maxTurns = options.maxTurns ?? 0;
	if (!existingUserMessage && !options.hiddenUserMessage && maxTurns > 0 && countVisibleUserTurns(activeMessages) >= maxTurns) {
		throw new Error("Maximum conversation turns reached");
	}

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string };

	// Inject exact JSON schema format to bypass provider compatibility issues
	const systemPromptWithJson = `${snapshot.systemPrompt}\n\nYou MUST respond ONLY in valid JSON format using exactly this schema: { "reply": "string (your conversational reply to the user)", "terminate": boolean (true ONLY IF you are severely offended or the user explicitly says goodbye) }`;

	const history: ChatMessage[] = [{ role: "system", content: systemPromptWithJson }];
	for (const m of activeMessages) {
		history.push({ role: m.role, content: m.content });
	}
	if (!existingUserMessage) {
		history.push({ role: "user", content: trimmedUserMessage });
	}

	// Persist the learner's message before calling the LLM so it is never lost on generation failure.
	if (!existingUserMessage) {
		const insertedMessages = await db
			.insert(sessionMessage)
			.values({
				sessionId,
				role: "user",
				content: trimmedUserMessage,
				llmMetadata:
					clientMessageId || options.hiddenUserMessage ? { clientMessageId, failed: false, hidden: options.hiddenUserMessage === true } : undefined,
			})
			.returning();
		const insertedUserMessage = insertedMessages[0];
		if (insertedUserMessage) {
			existingUserMessage = insertedUserMessage;
			activeMessages = [...activeMessages, insertedUserMessage];
		}
	} else if (existingUserMessage.id) {
		await db
			.update(sessionMessage)
			.set({
				llmMetadata: {
					...getMessageMetadata(existingUserMessage.llmMetadata),
					clientMessageId,
					failed: false,
					hidden: getMessageMetadata(existingUserMessage.llmMetadata).hidden === true || options.hiddenUserMessage === true,
				},
			})
			.where(eq(sessionMessage.id, existingUserMessage.id));

		activeMessages = activeMessages.map((message) =>
			message === existingUserMessage
				? {
						...message,
						llmMetadata: {
							...getMessageMetadata(message.llmMetadata),
							clientMessageId,
							failed: false,
							hidden: getMessageMetadata(message.llmMetadata).hidden === true || options.hiddenUserMessage === true,
						},
					}
				: message,
		);
	}

	let output: z.infer<typeof AgentReplySchema>;
	try {
		output = await createStructuredOutput(AgentReplySchema, history);
	} catch (error) {
		if (existingUserMessage?.id) {
			await db
				.update(sessionMessage)
				.set({
					llmMetadata: {
						...getMessageMetadata(existingUserMessage.llmMetadata),
						clientMessageId,
						failed: true,
						hidden: getMessageMetadata(existingUserMessage.llmMetadata).hidden === true || options.hiddenUserMessage === true,
					},
				})
				.where(eq(sessionMessage.id, existingUserMessage.id));
		}
		throw error;
	}

	await db.insert(sessionMessage).values({
		sessionId,
		role: "assistant",
		content: output.reply,
		llmMetadata: { model: "structured-output", raw: output },
	});

	const turnCount = countVisibleUserTurns(session.messages) + (reusedExistingUserMessage || options.hiddenUserMessage ? 0 : 1);

	return { reply: output.reply, turnCount, terminated: output.terminate === true };
}

export async function submitOneShotMessage(
	sessionId: number,
	userMessage: string,
	clientMessageId?: string,
	options: { maxTurns?: number | null; presentationReport?: string } = {},
): Promise<SubmitOneShotResult> {
	const trimmedUserMessage = userMessage.trim();
	if (!trimmedUserMessage) {
		throw new Error("userMessage is required");
	}

	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
		with: {
			messages: { orderBy: asc(sessionMessage.createdAt) },
		},
	});

	if (!session) throw new Error("Session not found");
	if (session.status !== "in_progress") throw new Error("Session not in progress");

	if (clientMessageId) {
		const existingState = getExistingUserMessageState(session.messages, clientMessageId);
		if (existingState?.userMessage) {
			return { turnCount: countVisibleUserTurns(session.messages) };
		}
	}

	const maxTurns = options.maxTurns ?? 0;
	if (maxTurns > 0 && countVisibleUserTurns(session.messages) >= maxTurns) {
		throw new Error("Maximum conversation turns reached");
	}

	await db.insert(sessionMessage).values({
		sessionId,
		role: "user",
		content: trimmedUserMessage,
		llmMetadata:
			clientMessageId || options.presentationReport
				? {
						clientMessageId,
						failed: false,
						presentationReport: options.presentationReport?.trim() || undefined,
					}
				: undefined,
	});

	return { turnCount: countVisibleUserTurns(session.messages) + 1 };
}

function buildTutorPrompt(
	objectives: string[],
	scenarioContext: string,
	messages: { role: string; content: string; llmMetadata?: unknown }[],
	learningLanguage: string,
): string {
	const conversationHistory = messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
	const userMessages = messages.filter((m) => m.role === "user");
	const studentMessages = userMessages.map((m, i) => `${i + 1}. ${m.content}`).join("\n");
	const presentationReports = userMessages
		.map((message, index) => {
			const metadata = message.llmMetadata as { presentationReport?: unknown } | null;
			const report = typeof metadata?.presentationReport === "string" ? metadata.presentationReport.trim() : "";
			return report ? `${index + 1}. ${report}` : "";
		})
		.filter(Boolean)
		.join("\n");

	const objectivesSection =
		objectives.length > 0
			? objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")
			: "No specific task objectives. Please evaluate general conversational fluency, grammar, and appropriateness for the scenario.";

	return `You are a language tutor evaluating a student's conversation practice.

	## Scenario Context
	${scenarioContext || "General conversation practice"}

	## Full Conversation History
	${conversationHistory || "(No conversation yet)"}

	## Task Objectives
	${objectivesSection}

	## Student's Messages (evaluate these specifically)
	${studentMessages || "(No messages from student)"}

	## Email Presentation Notes
	${presentationReports || "(No separate presentation notes)"}

	## Evaluation Instructions
	Evaluate how well the student achieved the objectives (or general fluency if none) considering:
	- The scenario context they were responding to
	- The full conversation flow (how they adapted to the AI's responses)
	- The quality and appropriateness of their messages
	- For email-style tasks, whether the message presentation is visually reasonable and appropriate. Do not treat presentation notes as student-written message text.

	Grade each objective (or general fluency) as:
	- A: Excellent - fully achieved
	- B: Good - mostly achieved with minor issues
	- C: Needs improvement - significant gaps

	Provide brief, constructive feedback (2-3 sentences).
	IMPORTANT: You MUST write the "content" (overall feedback on student's performance) in ${learningLanguage.toUpperCase()}. Do NOT write the feedback in English. The "text" field of objectiveResults should remain in the original language of the objectives.

	Respond in JSON format:
	{
	"objectiveResults": [
		{ "text": "objective description", "grade": "A|B|C" }
	],
	"content": "overall feedback on student's performance"
	}`;
}

export async function evaluateSession(sessionId: number): Promise<TutorFeedback> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
		with: {
			messages: { orderBy: asc(sessionMessage.createdAt) },
			task: true,
		},
	});

	if (!session) throw new Error("Session not found");
	if (!session.task) throw new Error("Task not found");

	const objectives = session.task.objectives ?? [];

	const learningLanguageName = getLanguageEnglishName(session.task.language);

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; mbti: string; ui: string; scenarioContext: string };
	const scenarioContext = snapshot.scenarioContext ?? "";

	const prompt = buildTutorPrompt(
		objectives,
		scenarioContext,
		session.messages.filter((m) => !isHiddenUserMessage(m)).map((m) => ({ role: m.role, content: m.content, llmMetadata: m.llmMetadata })),
		learningLanguageName,
	);

	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: "Please evaluate this conversation." },
	];

	const feedback = await createStructuredOutput(tutorFeedbackSchema, messages);

	await db.update(practiceSession).set({ status: "evaluated", tutorFeedback: feedback }).where(eq(practiceSession.id, sessionId));

	return feedback;
}

export async function completeSession(sessionId: number): Promise<TutorFeedback> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
	});

	if (!session) throw new Error("Session not found");
	if (session.status !== "in_progress" && session.status !== "completed") {
		throw new Error("Session not in progress or completed");
	}

	if (session.status === "in_progress") {
		await db.update(practiceSession).set({ status: "completed", completedAt: new Date() }).where(eq(practiceSession.id, sessionId));
	}

	return evaluateSession(sessionId);
}

export type HintResult = {
	hints: Array<{ text: string; translation: string }>;
};

export type MailHintResult = {
	mailHint: {
		subjectSuggestion: {
			text: string;
		};
		nextSection: {
			title: string;
			text: string;
		} | null;
		nextSentence: {
			title: string;
			text: string;
		} | null;
		checklist: Array<{
			text: string;
			done: boolean;
			note: string;
		}>;
	};
};

const HintSchema = z.object({
	hints: z
		.array(
			z.object({
				text: z.string().describe("The suggested reply in the learning language."),
				translation: z.string().describe("English translation of the suggestion."),
			}),
		)
		.min(1)
		.max(3),
});

const emptyMailHint = {
	subjectSuggestion: { text: "" },
	nextSection: null,
	nextSentence: null,
	checklist: [],
};

const MailHintSectionSchema = z
	.object({
		title: z.string().catch("").default("").describe("A short label for this suggestion."),
		text: z.string().catch("").default("").describe("Suggested email body text. Never include a subject line."),
	})
	.catch({ title: "", text: "" });

const OptionalMailHintSectionSchema = MailHintSectionSchema.nullish().transform((section) => {
	if (!section?.text?.trim()) return null;
	return section;
});

const MailHintChecklistItemSchema = z
	.object({
		text: z.string().catch("").default("").describe("A concise checklist item for a good email response."),
		done: z.boolean().catch(false).default(false).describe("Whether the current draft already satisfies this item."),
		note: z.string().catch("").default("").describe("A brief explanation or reminder for the student."),
	})
	.catch({ text: "", done: false, note: "" });

const MailHintSchema = z.object({
	mailHint: z
		.object({
			subjectSuggestion: z
				.object({
					text: z.string().catch("").default("").describe("A concise email subject line suggestion. Do not include the literal prefix 'Subject:'."),
				})
				.catch({ text: "" })
				.nullish()
				.transform((suggestion) => suggestion ?? { text: "" }),
			nextSection: OptionalMailHintSectionSchema.default(null),
			nextSentence: OptionalMailHintSectionSchema.default(null),
			checklist: z
				.array(MailHintChecklistItemSchema)
				.nullish()
				.transform((items) => (items ?? []).filter((item) => item.text.trim() || item.note.trim()).slice(0, 6)),
		})
		.catch(emptyMailHint)
		.default(emptyMailHint),
});

export async function generateHint(sessionId: number): Promise<HintResult> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
		with: {
			messages: { orderBy: asc(sessionMessage.createdAt) },
			task: true,
		},
	});

	if (!session) throw new Error("Session not found");
	if (!session.task) throw new Error("Task not found");

	const learningLanguageName = getLanguageEnglishName(session.task.language);

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string };
	const history = session.messages
		.filter((m) => !isHiddenUserMessage(m))
		.map((m) => `[${m.role}] ${m.content}`)
		.join("\n");

	const prompt = `You are an expert language tutor. A student is practicing ${learningLanguageName} in a roleplay.

    ## Roleplay Rules & Context
    ${snapshot.systemPrompt}

    ## Conversation History
    ${history || "(No messages yet)"}

    ## Critical Instructions
    Suggest 3 natural ways for the student to reply.
    1. The "text" field MUST be written in ${learningLanguageName.toUpperCase()} ONLY.
    2. The suggestions must be consistent with the persona and context provided above.
    3. The "translation" field should provide an English translation of that suggestion.

    Respond in JSON format:
    {
      "hints": [
        { "text": "suggested reply in ${learningLanguageName}", "translation": "English translation" }
      ]
    }`;

	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: `Give me hints for my next reply in ${learningLanguageName}.` },
	];

	return await createStructuredOutput(HintSchema, messages);
}

export async function generateMailHint(sessionId: number, draft: { to?: string; subject?: string; body?: string }): Promise<MailHintResult> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
		with: {
			messages: { orderBy: asc(sessionMessage.createdAt) },
			task: true,
		},
	});

	if (!session) throw new Error("Session not found");
	if (!session.task) throw new Error("Task not found");

	const learningLanguageName = getLanguageEnglishName(session.task.language);
	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; scenarioContext?: string };
	const existingMessages = session.messages
		.filter((m) => !isHiddenUserMessage(m))
		.map((m) => `[${m.role}] ${m.content}`)
		.join("\n");

	const prompt = `You are an expert language tutor helping a student write a one-shot email in ${learningLanguageName}.

	## Mail Task Context
	${snapshot.systemPrompt}

	## Already Submitted Messages
	${existingMessages || "(No submitted email yet)"}

	## Current Unsaved Draft
	To: ${draft.to || "(empty)"}
	Subject: ${draft.subject || "(empty)"}
	Body:
	${draft.body || "(empty)"}

	## Instructions
	Provide practical writing help for the student's current email draft. Keep the JSON compact.
	1. The nextSection.text and nextSentence.text MUST be written in ${learningLanguageName.toUpperCase()} ONLY when those objects are present.
	2. The checklist text and notes should be concise and written in ${learningLanguageName.toUpperCase()} where possible.
	3. Do not write a full replacement email unless the draft is empty; prefer the next useful section.
	4. Respect email conventions: greeting, purpose, response to the prompt, appropriate tone, clear closing.
	5. Mark checklist items done only when the current draft clearly satisfies them.
	6. Put any subject-line idea ONLY in subjectSuggestion.text. Do NOT include "Subject:" or a subject line inside nextSection.text or nextSentence.text.
	7. nextSection.text and nextSentence.text must be body text only, ready to insert into the message body.
	8. Return nextSection or nextSentence as null only if no useful suggestion is needed. Otherwise return a complete section object.
	9. Return up to 6 checklist items, each with concise text and a short note.
	10. Return ONLY JSON. Do not use Markdown code fences.

	Respond in JSON format:
	{
		"mailHint": {
			"subjectSuggestion": { "text": "subject line without Subject prefix" },
			"nextSection": { "title": "string", "text": "paragraph to append" },
			"nextSentence": { "title": "string", "text": "one next sentence" },
			"checklist": [
				{ "text": "checklist item", "done": true, "note": "brief note" }
			]
		}
	}`;

	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: `Help me improve and continue this one-shot email in ${learningLanguageName}.` },
	];

	return await createStructuredOutput(MailHintSchema, messages, { temperature: 0.2, maxTokens: 1600 });
}

export async function getSessionOrFail(sessionId: number, userId: string, taskId: number) {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
	});
	if (!session || session.userId !== userId || session.taskId !== taskId) {
		return null;
	}
	return session;
}
