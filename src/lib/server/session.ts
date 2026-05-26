import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { summarizeMailBodyLayout } from "$lib/components/practice-ui/mail/mailUtils";
import { getLanguageEnglishName, type UiVariant } from "$lib/constants";
import { type TutorFeedback, tutorFeedbackSchema } from "$lib/schemas";
import { db } from "./db";
import { practiceSession, sessionMessage, task } from "./db/schema";
import { type ChatMessage, type ChatTool, chatJson, chatTools } from "./llm";
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

const TERMINATE_CONVERSATION_TOOL: ChatTool = {
	type: "function",
	function: {
		name: "terminate_conversation",
		description: "Call this only when the learner severely insults or abuses you.",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				reason: {
					type: "string",
					description: "Short reason why the conversation should end.",
				},
			},
			required: ["reason"],
		},
	},
};

function getStoredTermination(metadata: unknown) {
	const raw = getMessageMetadata(metadata).raw;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
	const value = raw as { terminate?: unknown; terminated?: unknown };
	return value.terminate === true || value.terminated === true;
}

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
				terminated: getStoredTermination(existingState.assistantReply.llmMetadata),
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

	const systemPromptWithPlainText = `${snapshot.systemPrompt}\n\nCRITICAL REPLY RULES:\n- Reply in natural plain text only — like a real person typing in chat.\n- NEVER prefix your reply with a username or sender label (e.g. "CodePanic_Leo:" or "Alice:"). Just the reply text.\n- NEVER include asterisk-wrapped actions or narration (e.g. "*reads message twice*" or "*User joined the server*").\n- NEVER output JSON, markdown fences, or metadata.\n- Write ONLY the conversational reply. Nothing else.\n\nCall terminate_conversation ONLY IF the learner severely insults or abuses you. Do not call it for goodbyes, completed tasks, natural endpoints, or ordinary disagreement.`;

	// Build LLM history. Threaded UIs provide precise target context through promptContent
	// and stable comment metadata; persisted DB parent ids are not used for UI structure.
	const history: ChatMessage[] = [{ role: "system", content: systemPromptWithPlainText }];
	for (const m of activeMessages) {
		history.push({ role: m.role as "user" | "assistant" | "system", content: m.content });
	}
	if (!existingUserMessage) {
		history.push({ role: "user", content: trimmedPromptContent });
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

	let output: { reply: string; terminated: boolean; raw: unknown };
	try {
		const response = await chatTools({ messages: history, tools: [TERMINATE_CONVERSATION_TOOL], userId });
		const terminationCall = response.toolCalls.find((toolCall) => toolCall.name === "terminate_conversation");
		let reply = response.content;
		const raw: Record<string, unknown> = {
			terminated: terminationCall !== undefined,
			toolCalls: response.toolCalls,
			completion: response.raw,
		};

		if (!reply && terminationCall) {
			reply = "I’m going to end this conversation here.";
		}

		output = { reply, terminated: terminationCall !== undefined, raw };
	} catch (error) {
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

	await db.insert(sessionMessage).values({
		sessionId,
		role: "assistant",
		content: output.reply,
		llmMetadata: {
			...options.assistantMetadata,
			...(clientMessageId ? { clientMessageId } : {}),
			...(options.assistantAuthorName ? { assistantAuthorName: options.assistantAuthorName } : {}),
			model: "tool-calling",
			raw: output.raw,
		},
	});

	const turnCount = countVisibleUserTurns(session.messages) + (reusedExistingUserMessage || options.hiddenUserMessage ? 0 : 1);

	return { reply: output.reply, turnCount, terminated: output.terminated };
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
	const emailEvaluationInstruction = isMailPractice
		? `- For this Apple Mail task, consider EVERY learner-sent email when forming the evaluation, including content, tone, clarity, completeness, subject/body fit, and email conventions such as greeting, purpose, next steps, and closing.
- Also evaluate the whole email exchange: whether the learner responded appropriately across turns, handled the agent's replies, and achieved the task objectives by the end.
- The "objectiveResults" grades should remain per objective, not per email.
- In the "summary", summarize the most important strengths and issues across the learner's emails and the overall conversation. Mention specific emails only when useful.`
		: "- For email-style tasks, judge the student's submitted messages mainly by content, tone, completeness, and email conventions such as greeting, purpose, clarity, and closing.";

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
${emailEvaluationInstruction}

Grade each objective (or general fluency) as:
- A: Excellent - fully achieved
- B: Good - mostly achieved with minor issues
- C: Needs improvement - significant gaps

Provide brief, constructive feedback (2-3 sentences).
IMPORTANT: The "summary" and the items in "grammar", "vocabulary", and "coherence" arrays MUST be written in ${learningLanguage.toUpperCase()}. The "text" field of objectiveResults should remain in the original language of the objectives.

In "grammar", list specific grammar issues (e.g. tense, conjugation, agreement).
In "vocabulary", list word/phrase precision issues.
In "coherence", list logical flow and engagement issues.
If there are no issues for a category, provide an empty array [].

Respond in JSON format: {"objectiveResults":[{"text":"objective description","grade":"A|B|C"}],"grammar":["specific grammar issue"],"vocabulary":["word precision issue"],"coherence":["flow or engagement issue"],"summary":"brief overall recap of student's performance"}`;
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

	const feedback = await chatJson(tutorFeedbackSchema, { messages, userId: session.userId });

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
		contextSection = `\n\n## Reply Context (comment thread from root to the comment being replied to)\n${threadLines}`;
	}

	const threadInstruction =
		contextPath && contextPath.length > 0
			? "\n4. The suggestions should be relevant to the specific comment thread shown in the Reply Context section."
			: "";

	const prompt = `You are an expert language tutor. A student is practicing ${learningLanguageName} in a roleplay.

## Roleplay Rules & Context
${snapshot.systemPrompt}

## Conversation History
${history || "(No messages yet)"}${contextSection}

## Critical Instructions
Suggest 3 natural ways for the student to reply.
1. The "text" field MUST be written in ${learningLanguageName.toUpperCase()} ONLY.
2. The suggestions must be consistent with the persona and context provided above.
3. The "translation" field should provide an English translation of that suggestion.${threadInstruction}

Respond in JSON format: {"hints":[{"text":"suggested reply in ${learningLanguageName}","translation":"English translation"}]}`;

	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: `Give me hints for my next reply in ${learningLanguageName}.` },
	];

	return await chatJson(HintSchema, { messages, userId: session.userId });
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

// ── Follow-up on feedback items ──────────────────────────────────────

const FollowUpAnswerSchema = z.object({
	answer: z.string().describe("A helpful, concise explanation answering the learner's follow-up question."),
});

const FOLLOWUP_PRESET_PROMPTS: Record<string, string> = {
	why: "Why is this wrong? Please explain the underlying rule or principle.",
	examples: "Give me 3 more natural examples that illustrate the correct usage.",
};

export type FollowUpOnFeedbackInput = {
	sessionId: number;
	userId: string;
	itemText: string;
	category: "grammar" | "vocabulary" | "coherence";
	question: string;
};

export type FollowUpOnFeedbackResult = {
	answer: string;
};

export async function followUpOnFeedback(input: FollowUpOnFeedbackInput): Promise<FollowUpOnFeedbackResult> {
	const session = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.id, input.sessionId), eq(practiceSession.userId, input.userId)),
		with: { task: { columns: { language: true } } },
	});

	if (!session) throw new Error("Session not found");

	const learningLanguageName = getLanguageEnglishName(session.task?.language ?? "en");
	const resolvedQuestion = FOLLOWUP_PRESET_PROMPTS[input.question] ?? input.question;
	const categoryLabel = { grammar: "Grammar", vocabulary: "Vocabulary", coherence: "Coherence" }[input.category];

	const systemPrompt = `You are an expert ${learningLanguageName} language tutor. A learner has just received feedback on their ${learningLanguageName} practice and wants to understand a specific issue better.

The note they're asking about:
- Category: ${categoryLabel}
- Knowledge point: "${input.itemText}"

Their follow-up question: ${resolvedQuestion}

## Instructions
- Answer in a helpful, encouraging tone suitable for a language learner.
- Be concise but thorough — 2-5 sentences is usually enough unless the learner asks for examples (then include 3 brief examples).
- If the knowledge point describes a mistake, explain the correct rule clearly.
- If the learner asks for examples, provide natural ${learningLanguageName} examples with brief English explanations.
- Write your entire answer in English (the examples can mix ${learningLanguageName} and English).
- Do NOT roleplay as a character — you are a tutor, not the scenario persona.

Respond in JSON format: { "answer": "your response here" }`;

	const messages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: resolvedQuestion },
	];

	const result = await chatJson(FollowUpAnswerSchema, { messages, userId: input.userId });
	return { answer: result.answer };
}
