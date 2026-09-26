/**
 * Shared rendering of task facts, scenario settings and chat transcripts for LLM prompts.
 *
 * Every chat-derived call (agent replies, hints, feedback, expressions) describes the task in
 * the same delimited format so a model never sees the same fact twice in two shapes. Trusted,
 * author-written facts belong in the system message through `renderTaskBrief`/`renderScenarioSetting`;
 * the conversation itself (opening messages included) is the variable input and travels in the
 * user message through `buildChatTranscript`.
 */

import type { UiVariant } from "$lib/constants";
import { flattenOpeningComments } from "$lib/practice/comment-thread";
import { parseMailMessage } from "$lib/practice/mail";

export const LEVEL_NAMES: Record<number, string> = { 1: "beginner", 2: "intermediate", 3: "advanced" };

/** A human-readable level, e.g. `intermediate (2 of 3)`; null when the level is unknown. */
export function describeLevel(level: number | null | undefined): string | null {
	if (!level || !LEVEL_NAMES[level]) return null;
	return `${LEVEL_NAMES[level]} (${level} of 3)`;
}

/** Wraps trusted text in a named block so sections and embedded Markdown cannot bleed into each other. */
export function tagged(name: string, body: string): string {
	return `<${name}>\n${body.trim()}\n</${name}>`;
}

export type TaskFacts = {
	title: string;
	language: string;
	ui: UiVariant;
	shortObjective?: string | null;
	description?: string | null;
	objectives?: string[] | null;
	materialsMd?: string | null;
	difficulty?: number | null;
};

/**
 * The prompt-relevant facts of a task row. LLM recipe inputs must be JSON-plain, so call sites pass
 * this instead of a full row (which carries dates and unrelated columns).
 */
export function pickTaskFacts(task: TaskFacts): TaskFacts {
	return {
		title: task.title,
		language: task.language,
		ui: task.ui,
		shortObjective: task.shortObjective ?? null,
		description: task.description ?? null,
		objectives: task.objectives ?? null,
		materialsMd: task.materialsMd ?? null,
		difficulty: task.difficulty ?? null,
	};
}

type TaskBriefOptions = {
	/** Include the graded objectives (tutor-side calls). */
	objectives?: boolean;
	/** Include the study materials shown to the learner before the task. */
	materials?: boolean;
};

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/** The task as the learner was briefed on it, in one consistent block. */
export function renderTaskBrief(task: TaskFacts, options: TaskBriefOptions = {}): string {
	// The interface and target language are stated by each prompt's role and setting, not repeated here.
	const lines = [`Title: ${text(task.title)}`];
	const difficulty = describeLevel(task.difficulty);
	if (difficulty) lines.push(`Difficulty: ${difficulty}`);
	if (text(task.shortObjective)) lines.push(`Goal: ${text(task.shortObjective)}`);
	if (text(task.description)) lines.push(`Description: ${text(task.description)}`);
	const objectives = (task.objectives ?? []).map(text).filter(Boolean);
	if (options.objectives && objectives.length)
		lines.push(`Objectives:\n${objectives.map((objective, index) => `${index + 1}. ${objective}`).join("\n")}`);
	const brief = tagged("task", lines.join("\n"));
	const materials = text(task.materialsMd);
	return options.materials && materials ? `${brief}\n\n${tagged("materials", materials)}` : brief;
}

// ── Scenario setting (static facts, no messages) ─────────────────────

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
	return list(value).map(text).filter(Boolean);
}

function withPrefix(prefix: string, value: string) {
	return value.startsWith(prefix) ? value : `${prefix}${value}`;
}

/**
 * The static setting the learner sees when the scenario opens: the surface, channel, post or
 * work. Opening messages, emails and comments are conversation, rendered by `buildChatTranscript`.
 */
export function renderScenarioSetting(ui: UiVariant, openingState: JsonRecord | null | undefined): string {
	const state = record(openingState);
	const lines: string[] = [];
	switch (ui) {
		case "imessage":
			lines.push("A private iMessage text conversation between the learner and one other person.");
			break;
		case "discord": {
			const server = text(state.serverName);
			const channel = text(state.channelName);
			lines.push("A Discord text channel.");
			if (server) lines.push(`Server: ${server}`);
			if (channel) lines.push(`Channel: ${withPrefix("#", channel)}`);
			break;
		}
		case "apple_mail":
			lines.push("An email exchange in a mail app.");
			break;
		case "reddit": {
			const post = record(state.post);
			lines.push("A public Reddit comment thread under a post.");
			if (text(post.subreddit)) lines.push(`Subreddit: ${withPrefix("r/", text(post.subreddit))}`);
			if (text(post.author)) lines.push(`Post author: ${text(post.author)}`);
			if (text(post.title)) lines.push(`Post title: ${text(post.title)}`);
			if (text(post.body)) lines.push(`Post body:\n${text(post.body)}`);
			break;
		}
		case "ao3": {
			lines.push("The public comment section of a fan work on Archive of Our Own (AO3).");
			const fields: Array<[string, unknown]> = [
				["Work", state.workTitle],
				["Author", state.authorName],
				["Chapter", state.chapterTitle],
				["Rating", state.rating],
				["Archive warning", state.archiveWarning],
			];
			for (const [label, value] of fields) if (text(value)) lines.push(`${label}: ${text(value)}`);
			const lists: Array<[string, unknown]> = [
				["Fandoms", state.fandoms],
				["Relationships", state.relationships],
				["Characters", state.characters],
				["Tags", [...list(state.additionalTags), ...list(state.tags)]],
			];
			for (const [label, value] of lists) if (strings(value).length) lines.push(`${label}: ${strings(value).join(", ")}`);
			if (text(state.summary)) lines.push(`Summary:\n${text(state.summary)}`);
			if (text(state.bodyExcerpt)) lines.push(`Excerpt:\n${text(state.bodyExcerpt)}`);
			break;
		}
		default:
			break;
	}
	return tagged("setting", lines.join("\n"));
}

// ── Chat transcript ───────────────────────────────────────────────────

export type TranscriptRole = "learner" | "counterpart" | "other";

export type TranscriptEntry = {
	/** Present on learner messages of comment threads: the id a threaded reply must target. */
	messageId?: number;
	/** Present on comment threads: this comment's id and the comment it replies to (null = top level). */
	commentId?: string;
	replyTo?: string | null;
	/** True for messages that were already there when the scenario opened. */
	opening?: true;
	role: TranscriptRole;
	author: string;
	/** Email-only headers. */
	to?: string;
	subject?: string;
	time?: string;
	text: string;
	/** Learner comments on threads: the person who answers this comment. */
	respondAs?: string;
};

export type TranscriptMessage = {
	id: number;
	role: string;
	content: string;
	llmMetadata?: unknown;
};

type MessageMetadata = {
	hidden?: boolean;
	clientMessageId?: string;
	displayContent?: string;
	assistantAuthorName?: string;
	thread?: {
		commentId?: string;
		targetCommentId?: string | null;
		parentCommentId?: string | null;
		responderName?: string;
	};
};

function metadataOf(value: unknown): MessageMetadata {
	return record(value) as MessageMetadata;
}

/** What the learner typed: persisted content, or the display copy kept beside legacy prompt wrappers. */
export function learnerVisibleContent(message: { content: string; llmMetadata?: unknown }): string {
	return metadataOf(message.llmMetadata).displayContent ?? message.content;
}

function isHidden(message: TranscriptMessage) {
	return message.role === "user" && metadataOf(message.llmMetadata).hidden === true;
}

/** The name the interface shows for the counterpart of a linear chat: the first opening sender. */
export function resolveCounterpartName(ui: UiVariant, openingState: JsonRecord | null | undefined): string | null {
	const state = record(openingState);
	if (ui === "imessage" || ui === "discord") {
		for (const message of list(state.previousMessages)) {
			const sender = text(record(message).sender);
			if (sender) return sender;
		}
		return null;
	}
	if (ui === "apple_mail") return text(record(list(state.emails)[0]).from) || null;
	if (ui === "reddit") return text(record(state.post).author) || null;
	if (ui === "ao3") return text(state.authorName) || null;
	return null;
}

export type BuildChatTranscriptInput = {
	ui: UiVariant;
	openingState: JsonRecord | null | undefined;
	messages: TranscriptMessage[];
	learnerName: string;
};

/**
 * One chronological transcript of everything visible in the scenario: opening messages first,
 * then the session. Roles are relative to the learner (`counterpart` = the simulated person).
 */
export function buildChatTranscript(input: BuildChatTranscriptInput): TranscriptEntry[] {
	const { ui, learnerName } = input;
	const state = record(input.openingState);
	const counterpartName = resolveCounterpartName(ui, state);
	const threaded = ui === "reddit" || ui === "ao3";
	const entries: TranscriptEntry[] = [];

	if (ui === "imessage" || ui === "discord") {
		for (const raw of list(state.previousMessages)) {
			const message = record(raw);
			const author = text(message.sender);
			const body = text(message.text);
			if (!body) continue;
			entries.push({
				opening: true,
				role: author === learnerName ? "learner" : author === counterpartName ? "counterpart" : "other",
				author: author || counterpartName || "Unknown",
				...(text(message.timestamp) ? { time: text(message.timestamp) } : {}),
				text: body,
			});
		}
	} else if (ui === "apple_mail") {
		for (const raw of list(state.emails)) {
			const email = record(raw);
			const author = text(email.from);
			entries.push({
				opening: true,
				role: author === counterpartName ? "counterpart" : "other",
				author: author || "Unknown",
				to: text(email.to),
				subject: text(email.subject),
				...(text(email.time) ? { time: text(email.time) } : {}),
				text: text(email.body),
			});
		}
	} else if (threaded) {
		for (const comment of flattenOpeningComments(ui, state)) {
			if (comment.text)
				entries.push({ commentId: comment.id, replyTo: comment.parentId, opening: true, role: "other", author: comment.author, text: comment.text });
		}
	}

	for (const message of input.messages) {
		if ((message.role !== "user" && message.role !== "assistant") || isHidden(message)) continue;
		const metadata = metadataOf(message.llmMetadata);
		const isLearner = message.role === "user";
		const content = learnerVisibleContent(message).trim();
		if (!content) continue;

		if (threaded) {
			const thread = metadata.thread ?? {};
			entries.push(
				isLearner
					? {
							messageId: message.id,
							commentId: thread.commentId ?? `${ui}-user-${metadata.clientMessageId ?? message.id}`,
							replyTo: thread.targetCommentId ?? null,
							role: "learner",
							author: learnerName,
							text: content,
							...(thread.responderName ? { respondAs: thread.responderName } : {}),
						}
					: {
							// Matches the id the thread UI derives, so learner replies to it resolve.
							commentId: thread.commentId ?? `${ui}-agent-${message.id}`,
							replyTo: thread.parentCommentId ?? null,
							role: "counterpart",
							author: metadata.assistantAuthorName ?? thread.responderName ?? counterpartName ?? "Unknown",
							text: content,
						},
			);
			continue;
		}

		if (ui === "apple_mail" && isLearner) {
			const draft = parseMailMessage(content);
			entries.push({
				role: "learner",
				author: learnerName,
				...(draft.to ? { to: draft.to } : {}),
				...(draft.subject ? { subject: draft.subject } : {}),
				text: draft.body,
			});
			continue;
		}

		entries.push({
			role: isLearner ? "learner" : "counterpart",
			author: isLearner ? learnerName : (counterpartName ?? "Unknown"),
			text: content,
		});
	}

	return entries;
}
