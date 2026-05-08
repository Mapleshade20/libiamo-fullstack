import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { UiVariant } from "$lib/constants";
import { type TutorFeedback, tutorFeedbackSchema } from "$lib/schemas";

import { type ChatMessage, createStructuredOutput } from "./client";
import { db } from "./db";
import { practiceSession, sessionMessage, task } from "./db/schema";
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

export async function startSession(taskId: number, userId: string, learningLanguage: string): Promise<StartSessionResult> {
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

	const mbti = getRandomMbti();
	const mbtiPrefix = getMbtiPrompt(mbti);
	const agentPrompt = taskData.agentPrompt ? `${mbtiPrefix}\n\n${taskData.agentPrompt}` : mbtiPrefix;
	const ui = taskData.template.ui;
	const openingState = taskData.variant.openingState as Record<string, unknown>;
	const scenarioContext = buildScenarioContext(ui, openingState);
	const languageConstraint = `IMPORTANT: You MUST generate all your conversational replies in ${learningLanguage.toUpperCase()}. Do not use English unless the user explicitly asks for a translation or the specific scenario demands it.`;

	const baseSystemPrompt = buildSystemPrompt(agentPrompt, scenarioContext);
	const systemPrompt = `${languageConstraint}\n\n${baseSystemPrompt}`;

	const snapshot = { systemPrompt, mbti, ui, scenarioContext };

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
	model?: string;
	raw?: unknown;
};

function getMessageMetadata(value: unknown): SessionMessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as SessionMessageMetadata;
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
	terminate: z
		.boolean()
		.describe("Set to true ONLY IF the conversation has naturally concluded, objectives are fully met, or the user explicitly says goodbye."),
});

export async function sendMessage(sessionId: number, userMessage: string, clientMessageId?: string): Promise<SendMessageResult> {
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
				turnCount: session.messages.filter((m) => m.role === "user").length,
				terminated: getMessageMetadata(existingState.assistantReply.llmMetadata).raw
					? ((getMessageMetadata(existingState.assistantReply.llmMetadata).raw as { terminate?: boolean }).terminate ?? false)
					: false,
			};
		}

		if (existingState && !existingState.failed) {
			return {
				reply: "",
				turnCount: session.messages.filter((m) => m.role === "user").length,
				pending: true,
			};
		}

		existingUserMessage = existingState?.userMessage ?? null;
		reusedExistingUserMessage = existingUserMessage !== null;
	}

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string };

	// Inject exact JSON schema format to bypass provider compatibility issues
	const systemPromptWithJson = `${snapshot.systemPrompt}\n\nYou MUST respond ONLY in valid JSON format using exactly this schema:\n{\n  "reply": "string (your conversational reply to the user)",\n  "terminate": boolean (true ONLY IF the conversation has naturally concluded or the user explicitly says goodbye)\n}`;

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
				llmMetadata: clientMessageId ? { clientMessageId, failed: false } : undefined,
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
			.set({ llmMetadata: { ...getMessageMetadata(existingUserMessage.llmMetadata), clientMessageId, failed: false } })
			.where(eq(sessionMessage.id, existingUserMessage.id));

		activeMessages = activeMessages.map((message) =>
			message === existingUserMessage
				? {
						...message,
						llmMetadata: { ...getMessageMetadata(message.llmMetadata), clientMessageId, failed: false },
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
				.set({ llmMetadata: { ...getMessageMetadata(existingUserMessage.llmMetadata), clientMessageId, failed: true } })
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

	const turnCount = session.messages.filter((m) => m.role === "user").length + (reusedExistingUserMessage ? 0 : 1);

	return { reply: output.reply, turnCount, terminated: output.terminate === true };
}

function buildTutorPrompt(
	objectives: string[],
	scenarioContext: string,
	messages: { role: string; content: string }[],
	learningLanguage: string,
): string {
	const conversationHistory = messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
	const userMessages = messages.filter((m) => m.role === "user");
	const studentMessages = userMessages.map((m, i) => `${i + 1}. ${m.content}`).join("\n");

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

	## Evaluation Instructions
	Evaluate how well the student achieved the objectives (or general fluency if none) considering:
	- The scenario context they were responding to
	- The full conversation flow (how they adapted to the AI's responses)
	- The quality and appropriateness of their messages

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

	const languageMap: Record<string, string> = {
		en: "English",
		es: "Spanish",
		fr: "French",
		ja: "Japanese",
	};
	const learningLanguageName = languageMap[session.task.language] || session.task.language;

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; mbti: string; ui: string; scenarioContext: string };
	const scenarioContext = snapshot.scenarioContext ?? "";

	const prompt = buildTutorPrompt(
		objectives,
		scenarioContext,
		session.messages.map((m) => ({ role: m.role, content: m.content })),
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

	const languageMap: Record<string, string> = {
		en: "English",
		es: "Spanish",
		fr: "French",
		ja: "Japanese",
	};
	const learningLanguageName = languageMap[session.task.language] || session.task.language;

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string };
	const history = session.messages.map((m) => `[${m.role}] ${m.content}`).join("\n");

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

export async function getSessionOrFail(sessionId: number, userId: string, taskId: number) {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
	});
	if (!session || session.userId !== userId || session.taskId !== taskId) {
		return null;
	}
	return session;
}
