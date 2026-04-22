/**
 * Practice session management
 * Handles session lifecycle and message interactions
 */

import { asc, eq } from "drizzle-orm";
import type { UiVariant } from "$lib/constants";
import { type ChatMessage, createMultiTurnChat } from "./client";
import { db } from "./db";
import { practiceSession, sessionMessage, task } from "./db/schema";
import { getRandomMbti, type MbtiType } from "./mbti";

/**
 * Build scenario context based on UI type and openingState
 */
function buildScenarioContext(ui: UiVariant, openingState: Record<string, unknown>): string {
	switch (ui) {
		case "reddit": {
			const post = openingState.post as { title?: string; body?: string; subreddit?: string } | undefined;
			const comments = openingState.previousComments as Array<{ author?: string; text?: string }> | undefined;
			let ctx = "Scenario: Reddit post";
			if (post?.title) ctx += `\nTitle: ${post.title}`;
			if (post?.body) ctx += `\nContent: ${post.body}`;
			if (comments?.length) {
				ctx += "\nExisting comments:";
				for (const c of comments) ctx += `\n- ${c.author}: ${c.text}`;
			}
			return ctx;
		}
		case "apple_mail": {
			const emails = openingState.emails as Array<{ from?: string; subject?: string; body?: string }> | undefined;
			if (!emails?.length) return "Scenario: Mail app";
			const e = emails[0];
			return `Scenario: Received email\nFrom: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}`;
		}
		case "discord": {
			const server = openingState.serverName as string | undefined;
			const channel = openingState.channelName as string | undefined;
			const msgs = openingState.previousMessages as Array<{ sender?: string; text?: string }> | undefined;
			let ctx = "Scenario: Discord";
			if (server) ctx += `\nServer: ${server}`;
			if (channel) ctx += `\nChannel: ${channel}`;
			if (msgs?.length) {
				ctx += "\nHistory:";
				for (const m of msgs) ctx += `\n- ${m.sender}: ${m.text}`;
			}
			return ctx;
		}
		case "imessage": {
			const prev = openingState.previousMessages as Array<{ sender?: string; text?: string }> | undefined;
			let ctx = "Scenario: iMessage conversation";
			if (prev?.length) {
				ctx += "\nPrevious:";
				for (const m of prev) ctx += `\n- ${m.sender}: ${m.text}`;
			}
			return ctx;
		}
		case "ao3": {
			const work = openingState.workTitle as string | undefined;
			const excerpt = openingState.bodyExcerpt as string | undefined;
			const comments = openingState.previousComments as Array<{ username?: string; comment?: string }> | undefined;
			let ctx = "Scenario: AO3 work page";
			if (work) ctx += `\nWork: ${work}`;
			if (excerpt) ctx += `\nExcerpt: ${excerpt}`;
			if (comments?.length) {
				ctx += "\nExisting comments:";
				for (const c of comments) ctx += `\n- ${c.username}: ${c.comment}`;
			}
			return ctx;
		}
		case "translator": {
			const text = openingState.sourceText as string | undefined;
			return text ? `Text to translate: ${text}` : "Translation task";
		}
		default:
			return "";
	}
}

/**
 * Build complete system prompt
 * Note: MBTI is already included in agentPromptBase from tasks.ts
 */
function buildSystemPrompt(agentPromptBase: string | null, ui: UiVariant, openingState: Record<string, unknown>): string {
	const parts: string[] = [];

	// Scenario context
	const scenario = buildScenarioContext(ui, openingState);
	if (scenario) parts.push(scenario);

	// Task instruction (already includes MBTI from tasks.ts)
	if (agentPromptBase) parts.push(agentPromptBase);

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
	const systemPrompt = buildSystemPrompt(taskData.agentPrompt, taskData.template.ui, taskData.variant.openingState as Record<string, unknown>);

	const snapshot = { systemPrompt, mbti, ui: taskData.template.ui };

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
 * Complete the session
 */
export async function completeSession(sessionId: number): Promise<void> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
	});

	if (!session) throw new Error("Session not found");
	if (session.status !== "in_progress") throw new Error("Session not in progress");

	await db.update(practiceSession).set({ status: "completed", completedAt: new Date() }).where(eq(practiceSession.id, sessionId));
}
