/**
 * Practice session management
 * Handles session lifecycle and message interactions
 */

import { asc, eq } from "drizzle-orm";
import type { UiVariant } from "$lib/constants";
import { type TutorFeedback, tutorFeedbackSchema } from "$lib/schemas";

export type { TutorFeedback } from "$lib/schemas";

import { type ChatMessage, createMultiTurnChat, createStructuredOutput } from "./client";
import { db } from "./db";
import { practiceSession, sessionMessage, task } from "./db/schema";
import { getMbtiPrompt, getRandomMbti } from "./mbti";

/**
 * Append a list of labelled messages to a context string.
 */
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
	const emails = openingState.emails as Array<{ from?: string; subject?: string; body?: string }> | undefined;
	if (!emails?.length) return "Scenario: Mail app";
	const e = emails[0];
	return `Scenario: Received email\nFrom: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}`;
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

/**
 * Build scenario context based on UI type and openingState
 */
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

/**
 * Build complete system prompt from scenario context and agent instructions.
 */
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

/**
 * Start a new practice session
 */
export async function startSession(taskId: number, userId: string): Promise<StartSessionResult> {
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
	const systemPrompt = buildSystemPrompt(agentPrompt, scenarioContext);

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
};

/**
 * Send message and get AI reply
 */
export async function sendMessage(sessionId: number, userMessage: string): Promise<SendMessageResult> {
	if (!userMessage.trim()) {
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

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string };

	// Build message history
	const history: ChatMessage[] = [{ role: "system", content: snapshot.systemPrompt }];
	for (const m of session.messages) {
		history.push({ role: m.role, content: m.content });
	}

	// Call LLM
	const result = await createMultiTurnChat({
		history,
		userMessage: userMessage.trim(),
	});

	// Save messages
	await db.insert(sessionMessage).values([
		{ sessionId, role: "user", content: userMessage.trim() },
		{
			sessionId,
			role: "assistant",
			content: result.reply.content,
			llmMetadata: { model: result.reply.model, raw: result.reply.raw },
		},
	]);

	const turnCount = session.messages.filter((m) => m.role === "user").length + 1;

	return { reply: result.reply.content, turnCount };
}

/**
 * Build tutor evaluation prompt
 */
function buildTutorPrompt(objectives: string[], scenarioContext: string, messages: { role: string; content: string }[]): string {
	// Build full conversation history for context
	const conversationHistory = messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");

	// Extract user messages for explicit evaluation
	const userMessages = messages.filter((m) => m.role === "user");
	const studentMessages = userMessages.map((m, i) => `${i + 1}. ${m.content}`).join("\n");

	return `You are a language tutor evaluating a student's conversation practice.

	## Scenario Context
	${scenarioContext || "General conversation practice"}

	## Full Conversation History
	${conversationHistory || "(No conversation yet)"}

	## Task Objectives
	${objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

	## Student's Messages (evaluate these specifically)
	${studentMessages || "(No messages from student)"}

	## Evaluation Instructions
	Evaluate how well the student achieved each objective considering:
	- The scenario context they were responding to
	- The full conversation flow (how they adapted to the AI's responses)
	- The quality and appropriateness of their messages

	Grade each objective as:
	- A: Excellent - fully achieved
	- B: Good - mostly achieved with minor issues
	- C: Needs improvement - significant gaps

	Provide brief, constructive feedback (2-3 sentences).

	Respond in JSON format:
	{
	"objectiveResults": [
		{ "text": "objective description", "grade": "A|B|C" }
	],
	"content": "overall feedback on student's performance"
	}`;
}

/**
 * Evaluate session and generate tutor feedback
 */
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
	if (objectives.length === 0) {
		// No objectives to evaluate
		const feedback: TutorFeedback = {
			content: "No specific objectives were set for this task.",
			objectiveResults: [],
		};
		await db.update(practiceSession).set({ status: "evaluated", tutorFeedback: feedback }).where(eq(practiceSession.id, sessionId));
		return feedback;
	}

	// Extract scenario context from snapshot (stored at session start)
	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; mbti: string; ui: string; scenarioContext: string };
	const scenarioContext = snapshot.scenarioContext ?? "";

	const prompt = buildTutorPrompt(
		objectives,
		scenarioContext,
		session.messages.map((m) => ({ role: m.role, content: m.content })),
	);

	// Call LLM for evaluation using AI SDK generateObject with Zod schema
	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: "Please evaluate this conversation." },
	];

	const feedback = await createStructuredOutput(tutorFeedbackSchema, messages);

	await db.update(practiceSession).set({ status: "evaluated", tutorFeedback: feedback }).where(eq(practiceSession.id, sessionId));

	return feedback;
}

/**
 * Complete the session and trigger evaluation
 */
export async function completeSession(sessionId: number): Promise<TutorFeedback> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
	});

	if (!session) throw new Error("Session not found");
	if (session.status !== "in_progress") throw new Error("Session not in progress");

	// Mark as completed first
	await db.update(practiceSession).set({ status: "completed", completedAt: new Date() }).where(eq(practiceSession.id, sessionId));

	// Trigger evaluation automatically
	return evaluateSession(sessionId);
}
