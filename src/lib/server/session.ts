import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { summarizeMailBodyLayout } from "$lib/components/practice-ui/mail/mailUtils";
import { getLanguageEnglishName, type UiVariant } from "$lib/constants";
import { type TutorFeedback, tutorFeedbackSchema } from "$lib/schemas";
import { db } from "./db";
import { practiceSession, sessionMessage, task } from "./db/schema";
import { type ChatMessage, createStructuredOutput, StructuredOutputParseError, stripJsonFences } from "./llm";
import { getMbtiPrompt, getRandomMbti } from "./mbti";

const MESSAGE_FIELD_ORDER = ["sender", "author", "username", "from", "to", "subject", "time", "text", "comment", "body", "timestamp"];

function stringifyMessageValue(value: unknown): string | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	return String(value);
}

function orderedMessageValues(item: Record<string, unknown>): string[] {
	const usedKeys = new Set<string>();
	const ordered = MESSAGE_FIELD_ORDER.flatMap((key) => {
		usedKeys.add(key);
		const value = stringifyMessageValue(item[key]);
		return value ? [value] : [];
	});
	const remaining = Object.entries(item).flatMap(([key, value]) => {
		if (usedKeys.has(key)) return [];
		const rendered = stringifyMessageValue(value);
		return rendered ? [rendered] : [];
	});
	return [...ordered, ...remaining];
}

function appendMessages(ctx: string, label: string, items: Array<Record<string, unknown>>): string {
	if (!items.length) return ctx;
	const lines = items.map((item) => `- ${orderedMessageValues(item).join(": ")}`);
	return `${ctx}\n${label}:\n${lines.join("\n")}`;
}

function formatRedditContextComments(comments: Array<{ author?: string; text?: string; replies?: unknown }> = [], depth = 0): string[] {
	return comments.flatMap((comment) => {
		const author = stringifyMessageValue(comment.author);
		const text = stringifyMessageValue(comment.text);
		const currentLine = author || text ? [`${"  ".repeat(depth)}- ${[author, text].filter(Boolean).join(": ")}`] : [];
		const replyLines = formatRedditContextComments(
			Array.isArray(comment.replies) ? (comment.replies as Array<{ author?: string; text?: string; replies?: unknown }>) : [],
			depth + 1,
		);
		return [...currentLine, ...replyLines];
	});
}

function buildRedditContext(openingState: Record<string, unknown>): string {
	const post = openingState.post as { title?: string; body?: string; author?: string; subreddit?: string } | undefined;
	const comments = openingState.previousComments as Array<{ author?: string; text?: string; replies?: unknown }> | undefined;
	let ctx = "Scenario: Reddit post comment thread";
	if (post?.subreddit) ctx += `\nSubreddit: ${post.subreddit}`;
	if (post?.author) ctx += `\nPost author: ${post.author}`;
	if (post?.title) ctx += `\nTitle: ${post.title}`;
	if (post?.body) ctx += `\nContent: ${post.body}`;
	const commentLines = formatRedditContextComments(comments ?? []);
	if (commentLines.length) ctx += `\nExisting nested comments:\n${commentLines.join("\n")}`;
	ctx +=
		"\nRoleplay rule: each learner comment may target a different Reddit commenter. When the learner prompt specifies a comment author to roleplay as, reply only as that person for that turn.";
	return ctx;
}

function buildMailContext(openingState: Record<string, unknown>): string {
	const emails = openingState.emails as Array<{ from?: string; to?: string; subject?: string; body?: string; time?: string }> | undefined;
	const roleplayRule =
		"Roleplay rule: when you reply to the learner, write a natural email reply body only. Do not include markdown fences, JSON, or header lines such as Subject:, From:, or To: in the reply text. If you include a sign-off, sign with the email sender's normal name, never with an MBTI/personality label.";
	if (!emails?.length) return `Scenario: Mail app\n${roleplayRule}`;

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

	return `Scenario: Received email${emails.length > 1 ? "s" : ""}\n${emailLines.join("\n\n")}\n${roleplayRule}`;
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

function flattenAo3ContextComments(
	comments: Array<{ username?: string; comment?: string; replies?: unknown }> = [],
): Array<Record<string, string | undefined>> {
	return comments.flatMap((comment) => [
		{ username: comment.username, comment: comment.comment },
		...flattenAo3ContextComments(
			Array.isArray(comment.replies) ? (comment.replies as Array<{ username?: string; comment?: string; replies?: unknown }>) : [],
		),
	]);
}

function buildAo3Context(openingState: Record<string, unknown>): string {
	const work = openingState.workTitle as string | undefined;
	const author = openingState.authorName as string | undefined;
	const chapter = openingState.chapterTitle as string | undefined;
	const summary = openingState.summary as string | undefined;
	const excerpt = openingState.bodyExcerpt as string | undefined;
	const rating = openingState.rating as string | undefined;
	const warning = openingState.archiveWarning as string | undefined;
	const fandoms = openingState.fandoms as string[] | undefined;
	const tags = (
		[...((openingState.additionalTags as string[] | undefined) ?? []), ...((openingState.tags as string[] | undefined) ?? [])] as string[]
	).filter(Boolean);
	const comments = openingState.previousComments as Array<{ username?: string; comment?: string; replies?: unknown }> | undefined;
	let ctx = "Scenario: AO3 work page comment thread";
	if (work) ctx += `\nWork: ${work}`;
	if (author) ctx += `\nAuthor: ${author}`;
	if (chapter) ctx += `\nChapter: ${chapter}`;
	if (rating) ctx += `\nRating: ${rating}`;
	if (warning) ctx += `\nArchive Warning: ${warning}`;
	if (fandoms?.length) ctx += `\nFandoms: ${fandoms.join(", ")}`;
	if (tags.length) ctx += `\nAdditional Tags: ${tags.join(", ")}`;
	if (summary) ctx += `\nSummary: ${summary}`;
	if (excerpt) ctx += `\nExcerpt: ${excerpt}`;
	const flattenedComments = flattenAo3ContextComments(comments ?? []);
	if (flattenedComments.length) ctx = appendMessages(ctx, "Existing nested comments", flattenedComments);
	ctx +=
		"\nRoleplay rule: each learner comment may target a different AO3 commenter. When the learner prompt specifies a comment author to roleplay as, reply only as that person for that turn.";
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
	mailBodyHtml?: string;
	displayContent?: string;
	assistantAuthorName?: string;
	thread?: unknown;
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

function getMessageDisplayContent(message: { content: string; llmMetadata?: unknown }): string {
	return getMessageMetadata(message.llmMetadata).displayContent ?? message.content;
}

function countVisibleUserTurns(messages: Array<{ role: string; llmMetadata?: unknown }>): number {
	return messages.filter((message) => message.role === "user" && !isHiddenUserMessage(message)).length;
}

function getAssistantTerminateFlag(metadata: unknown): boolean {
	const raw = getMessageMetadata(metadata).raw;
	return raw && typeof raw === "object" && !Array.isArray(raw) ? ((raw as { terminate?: boolean }).terminate ?? false) : false;
}

function formatMessageForStructuredHistory(message: { role: string; content: string; llmMetadata?: unknown }): ChatMessage {
	const role = message.role as "user" | "assistant" | "system";
	if (role !== "assistant") return { role, content: message.content };
	return {
		role,
		content: JSON.stringify({
			reply: message.content,
			terminate: getAssistantTerminateFlag(message.llmMetadata),
		}),
	};
}

function getPlainTextFallbackFromStructuredError(error: unknown): string | null {
	if (!(error instanceof StructuredOutputParseError)) return null;
	const candidates = [error.retryText, error.firstText];
	const text = candidates.find((value) => {
		const trimmed = stripJsonFences(value ?? "");
		return trimmed && !trimmed.startsWith("{") && !trimmed.startsWith("[");
	});
	return text ? stripJsonFences(text) : null;
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
	promptContent?: string;
	userDisplayContent?: string;
	userMetadata?: Record<string, unknown>;
	assistantAuthorName?: string;
	assistantMetadata?: Record<string, unknown>;
};

export async function sendMessage(
	sessionId: number,
	userMessage: string,
	userId: string,
	clientMessageId?: string,
	options: SendMessageOptions = {},
): Promise<SendMessageResult> {
	const trimmedUserMessage = userMessage.trim();
	if (!trimmedUserMessage) {
		throw new Error("userMessage is required");
	}
	const trimmedPromptContent = options.promptContent?.trim() || trimmedUserMessage;
	const displayContent = options.userDisplayContent?.trim();

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

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; ui?: string };

	// Inject exact JSON schema format to bypass provider compatibility issues
	const terminationRule =
		snapshot.ui === "apple_mail"
			? 'For email practice, set "terminate" to true only when the learner explicitly says they are finished OR the email exchange has clearly reached a natural endpoint and no further learner response is needed. When unsure, use false.'
			: 'Set "terminate" to true ONLY IF you are severely offended or the user explicitly says goodbye.';
	const systemPromptWithJson = `${snapshot.systemPrompt}\n\nYou MUST respond ONLY in valid JSON format using exactly this schema: { "reply": "string (your conversational reply to the user)", "terminate": boolean }. ${terminationRule}`;

	// Build LLM history. Threaded UIs provide precise target context through promptContent
	// and stable comment metadata; persisted DB parent ids are not used for UI structure.
	const history: ChatMessage[] = [{ role: "system", content: systemPromptWithJson }];
	if (!existingUserMessage) {
		for (const m of activeMessages) {
			history.push(formatMessageForStructuredHistory(m));
		}
		history.push({ role: "user", content: trimmedPromptContent });
	} else {
		// Retry: existing user message is already in activeMessages
		for (const m of activeMessages) {
			history.push(formatMessageForStructuredHistory(m));
		}
	}

	// Persist the learner's message before calling the LLM so it is never lost on generation failure.
	if (!existingUserMessage) {
		const insertedMessages = await db
			.insert(sessionMessage)
			.values({
				sessionId,
				role: "user",
				content: trimmedPromptContent,
				llmMetadata:
					clientMessageId || options.hiddenUserMessage || displayContent || options.userMetadata
						? {
								...options.userMetadata,
								clientMessageId,
								failed: false,
								hidden: options.hiddenUserMessage === true,
								displayContent,
							}
						: undefined,
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
					...options.userMetadata,
					clientMessageId,
					failed: false,
					hidden: getMessageMetadata(existingUserMessage.llmMetadata).hidden === true || options.hiddenUserMessage === true,
					displayContent: displayContent ?? getMessageMetadata(existingUserMessage.llmMetadata).displayContent,
				},
			})
			.where(eq(sessionMessage.id, existingUserMessage.id));

		activeMessages = activeMessages.map((message) =>
			message === existingUserMessage
				? {
						...message,
						llmMetadata: {
							...getMessageMetadata(message.llmMetadata),
							...options.userMetadata,
							clientMessageId,
							failed: false,
							hidden: getMessageMetadata(message.llmMetadata).hidden === true || options.hiddenUserMessage === true,
							displayContent: displayContent ?? getMessageMetadata(message.llmMetadata).displayContent,
						},
					}
				: message,
		);
	}

	let output: z.infer<typeof AgentReplySchema>;
	try {
		output = await createStructuredOutput(AgentReplySchema, history, {}, userId);
	} catch (error) {
		const fallbackReply = getPlainTextFallbackFromStructuredError(error);
		if (fallbackReply) {
			output = { reply: fallbackReply, terminate: false };
		} else {
			if (existingUserMessage?.id) {
				await db
					.update(sessionMessage)
					.set({
						llmMetadata: {
							...getMessageMetadata(existingUserMessage.llmMetadata),
							...options.userMetadata,
							clientMessageId,
							failed: true,
							hidden: getMessageMetadata(existingUserMessage.llmMetadata).hidden === true || options.hiddenUserMessage === true,
							displayContent: displayContent ?? getMessageMetadata(existingUserMessage.llmMetadata).displayContent,
						},
					})
					.where(eq(sessionMessage.id, existingUserMessage.id));
			}
			throw error;
		}
	}

	await db.insert(sessionMessage).values({
		sessionId,
		role: "assistant",
		content: output.reply,
		llmMetadata: {
			...options.assistantMetadata,
			...(clientMessageId ? { clientMessageId } : {}),
			...(options.assistantAuthorName ? { assistantAuthorName: options.assistantAuthorName } : {}),
			model: "structured-output",
			raw: output,
		},
	});

	const turnCount = countVisibleUserTurns(session.messages) + (reusedExistingUserMessage || options.hiddenUserMessage ? 0 : 1);

	return { reply: output.reply, turnCount, terminated: output.terminate === true };
}

function buildTutorPrompt(
	objectives: string[],
	scenarioContext: string,
	messages: { role: string; content: string; llmMetadata?: unknown }[],
	learningLanguage: string,
	ui?: string,
): string {
	const isMailPractice = ui === "apple_mail";
	const conversationHistory = messages
		.map((m) => {
			const mailBodyLayout = summarizeMailBodyLayout(getMailBodyHtmlMetadata(m.llmMetadata));
			if (!mailBodyLayout) return `[${m.role}] ${m.content}`;
			return `[${m.role}] ${m.content}\n\nEmail body layout:\n${mailBodyLayout}`;
		})
		.join("\n\n");
	const userMessages = messages.filter((m) => m.role === "user");
	const studentMessages = userMessages
		.map((m, i) => {
			const mailBodyLayout = summarizeMailBodyLayout(getMailBodyHtmlMetadata(m.llmMetadata));
			const layout = mailBodyLayout ? `\nEmail body layout:\n${mailBodyLayout}` : "";
			return `${i + 1}. ${m.content}${layout}`;
		})
		.join("\n\n");

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
	- The quality, clarity, and appropriateness of their messages
	${
		isMailPractice
			? `- For this Apple Mail task, consider EVERY learner-sent email when forming the evaluation, including content, tone, clarity, completeness, subject/body fit, and email conventions such as greeting, purpose, next steps, and closing.
	- Also evaluate the whole email exchange: whether the learner responded appropriately across turns, handled the agent's replies, and achieved the task objectives by the end.
	- The "objectiveResults" grades should remain per objective, not per email.
	- In the "content" feedback, summarize the most important strengths and issues across the learner's emails and the overall conversation. Mention specific emails only when useful.`
			: "- For email-style tasks, judge the student's submitted messages mainly by content, tone, completeness, and email conventions such as greeting, purpose, clarity, and closing."
	}

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

function getMailBodyHtmlMetadata(metadata: unknown) {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
	const value = (metadata as { mailBodyHtml?: unknown }).mailBodyHtml;
	return typeof value === "string" ? value.trim() : "";
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
		session.messages
			.filter((m) => !isHiddenUserMessage(m))
			.map((m) => ({
				role: m.role,
				content: getMessageDisplayContent(m),
				llmMetadata: m.llmMetadata,
			})),
		learningLanguageName,
		snapshot.ui,
	);

	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: "Please evaluate this conversation." },
	];

	const feedback = await createStructuredOutput(tutorFeedbackSchema, messages, {}, session.userId);

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

export type ContextComment = {
	author: string;
	text: string;
};

export async function generateHint(sessionId: number, contextPath?: ContextComment[]): Promise<HintResult> {
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
		.map((m) => `[${m.role}] ${getMessageDisplayContent(m)}`)
		.join("\n");

	// Build context section from the ancestor comment path (precise thread extraction)
	let contextSection = "";
	if (contextPath && contextPath.length > 0) {
		const threadLines = contextPath.map((c, i) => `${"  ".repeat(i)}u/${c.author}: ${c.text}`).join("\n");
		contextSection = `\n## Reply Context (comment thread from root to the comment being replied to)\n${threadLines}\n`;
	}

	const prompt = `You are an expert language tutor. A student is practicing ${learningLanguageName} in a roleplay.

    ## Roleplay Rules & Context
    ${snapshot.systemPrompt}

    ## Conversation History
    ${history || "(No messages yet)"}${contextSection}

    ## Critical Instructions
    Suggest 3 natural ways for the student to reply.
    1. The "text" field MUST be written in ${learningLanguageName.toUpperCase()} ONLY.
    2. The suggestions must be consistent with the persona and context provided above.
    3. The "translation" field should provide an English translation of that suggestion.
${contextPath && contextPath.length > 0 ? "    4. The suggestions should be relevant to the specific comment thread shown in the Reply Context section.\n" : ""}
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

	return await createStructuredOutput(HintSchema, messages, {}, session.userId);
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
