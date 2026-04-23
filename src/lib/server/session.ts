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
	terminated?: boolean;
};

const AgentReplySchema = z.object({
	reply: z.string().describe("Your conversational reply to the user."),
	terminate: z
		.boolean()
		.describe("Set to true ONLY IF the conversation has naturally concluded, objectives are fully met, or the user explicitly says goodbye."),
});

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

	// Inject exact JSON schema format to bypass provider compatibility issues
	const systemPromptWithJson = `${snapshot.systemPrompt}\n\nYou MUST respond ONLY in valid JSON format using exactly this schema:\n{\n  "reply": "string (your conversational reply to the user)",\n  "terminate": boolean (true ONLY IF the conversation has naturally concluded or the user explicitly says goodbye)\n}`;

	const history: ChatMessage[] = [{ role: "system", content: systemPromptWithJson }];
	for (const m of session.messages) {
		history.push({ role: m.role, content: m.content });
	}
	history.push({ role: "user", content: userMessage.trim() });

	const output = await createStructuredOutput(AgentReplySchema, history);

	await db.insert(sessionMessage).values([
		{ sessionId, role: "user", content: userMessage.trim() },
		{
			sessionId,
			role: "assistant",
			content: output.reply,
			llmMetadata: { model: "structured-output", raw: output },
		},
	]);

	const turnCount = session.messages.filter((m) => m.role === "user").length + 1;

	return { reply: output.reply, turnCount, terminated: output.terminate === true };
}

function buildTutorPrompt(objectives: string[], scenarioContext: string, messages: { role: string; content: string }[]): string {
	const conversationHistory = messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
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
		const feedback: TutorFeedback = {
			content: "No specific objectives were set for this task.",
			objectiveResults: [],
		};
		await db.update(practiceSession).set({ status: "evaluated", tutorFeedback: feedback }).where(eq(practiceSession.id, sessionId));
		return feedback;
	}

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; mbti: string; ui: string; scenarioContext: string };
	const scenarioContext = snapshot.scenarioContext ?? "";

	const prompt = buildTutorPrompt(
		objectives,
		scenarioContext,
		session.messages.map((m) => ({ role: m.role, content: m.content })),
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
