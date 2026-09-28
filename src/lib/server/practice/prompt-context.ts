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
import { type CommentThreadMetadata, flattenOpeningComments, getCommentId } from "$lib/practice/comment-thread";
import { formatMailAddress, parseMailAddress, parseMailMessage } from "$lib/practice/mail";
import { resolveScene, type Scene } from "$lib/practice/scene";

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

/** Task facts of a chat task: the opening state and the people in it as the learner's interface shows them. */
export type ChatTaskFacts = TaskFacts & { openingState: Record<string, unknown> | null; scene: Scene };

export function pickChatTaskFacts(
	task: TaskFacts & { id: number; openingState?: Record<string, unknown> | null },
	learnerName: string,
): ChatTaskFacts {
	const openingState = task.openingState ?? null;
	return { ...pickTaskFacts(task), openingState, scene: resolveScene(task.ui, openingState, task.id, learnerName) };
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
 * work, and the people as the interface names them. Opening messages, emails and comments are
 * conversation, rendered by `buildChatTranscript`.
 */
export function renderScenarioSetting(ui: UiVariant, openingState: JsonRecord | null | undefined, scene?: Scene | null): string {
	const state = record(openingState);
	const lines: string[] = [];
	switch (ui) {
		case "imessage":
			lines.push(scene?.group ? "An iMessage group chat." : "A private iMessage text conversation between the learner and one other person.");
			if (text(state.groupName)) lines.push(`Group: ${text(state.groupName)}`);
			break;
		case "discord": {
			if (state.dm === true) {
				lines.push("A Discord direct message conversation between the learner and one other person.");
				break;
			}
			const server = text(state.serverName);
			const channel = text(state.channelName);
			lines.push("A Discord text channel.");
			if (server) lines.push(`Server: ${server}`);
			if (channel) lines.push(`Channel: ${withPrefix("#", channel)}`);
			break;
		}
		case "apple_mail":
			lines.push(scene?.group ? "An email thread with several people in a mail app." : "An email exchange in a mail app.");
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
	// Comment threads name their owner above.
	if (scene && ui !== "reddit" && ui !== "ao3") {
		lines.push(`Counterpart as the learner's interface shows them: ${formatMailAddress(scene.counterpart)}`);
		const others = scene.cast.slice(1).map(formatMailAddress);
		if (others.length) lines.push(`Also present: ${others.join(", ")}`);
	}
	return tagged("setting", lines.join("\n"));
}

// ── Chat transcript ───────────────────────────────────────────────────

/** `cast` is anyone besides the learner: the people the models voice. */
export type TranscriptRole = "learner" | "cast";

export type TranscriptEntry = {
	/** 1-based position in the transcript; `replyTo` and reply targets refer to it. */
	id: number;
	/** The entry this one answers, where the interface shows it (comment threads, quoted replies). */
	replyTo?: number;
	/** True for messages that were already there when the scenario opened. */
	opening?: true;
	role: TranscriptRole;
	author: string;
	/** Email-only headers. */
	to?: string;
	subject?: string;
	time?: string;
	text: string;
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
	/** A reply's target, as a scene message ref (see `getCommentId`). */
	replyTo?: string | null;
	thread?: CommentThreadMetadata;
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

export type BuildChatTranscriptInput = {
	ui: UiVariant;
	openingState: JsonRecord | null | undefined;
	messages: TranscriptMessage[];
	learnerName: string;
	/** Resolved by `resolveScene`, so the transcript names people as the interface does. */
	scene: Scene;
};

type Draft = Omit<TranscriptEntry, "id" | "replyTo"> & { ref: string; parent?: string | null };

/**
 * One chronological transcript of everything visible in the scenario, opening messages first, with
 * `refs[i]` the scene message ref (comment id scheme) of `entries[i]`.
 */
export function buildSceneTranscript(input: BuildChatTranscriptInput): { entries: TranscriptEntry[]; refs: string[] } {
	const { ui, learnerName } = input;
	const state = record(input.openingState);
	const counterpartName = input.scene.counterpart.name;
	const threaded = ui === "reddit" || ui === "ao3";
	const role = (author: string): TranscriptRole => (author === learnerName ? "learner" : "cast");
	const drafts: Draft[] = [];

	if (ui === "imessage" || ui === "discord") {
		list(state.previousMessages).forEach((raw, index) => {
			const message = record(raw);
			// The interface shows an unnamed opening line as the counterpart's.
			const author = text(message.sender) || counterpartName;
			if (!text(message.text)) return;
			const time = text(message.timestamp);
			drafts.push({ ref: `opening-${index}`, opening: true, role: role(author), author, ...(time ? { time } : {}), text: text(message.text) });
		});
	} else if (ui === "apple_mail") {
		list(state.emails).forEach((raw, index) => {
			const email = record(raw);
			const author = parseMailAddress(text(email.from)).name || "Unknown";
			const time = text(email.time);
			drafts.push({
				ref: `opening-${index}`,
				opening: true,
				role: role(author),
				author,
				to: text(email.to),
				subject: text(email.subject),
				...(time ? { time } : {}),
				text: text(email.body),
			});
		});
	} else if (threaded) {
		for (const comment of flattenOpeningComments(ui, state)) {
			if (comment.text)
				drafts.push({ ref: comment.id, parent: comment.parentId, opening: true, role: "cast", author: comment.author, text: comment.text });
		}
	}

	for (const message of input.messages) {
		if ((message.role !== "user" && message.role !== "assistant") || isHidden(message)) continue;
		const metadata = metadataOf(message.llmMetadata);
		const isLearner = message.role === "user";
		const content = learnerVisibleContent(message).trim();
		if (!content) continue;
		const ref = getCommentId(ui, {
			id: String(message.id),
			role: isLearner ? "user" : "agent",
			clientMessageId: metadata.clientMessageId,
			thread: metadata.thread,
		});
		const author = isLearner ? learnerName : (metadata.assistantAuthorName ?? metadata.thread?.responderName ?? counterpartName);
		const parent = isLearner ? metadata.thread?.targetCommentId : (metadata.thread?.parentCommentId ?? metadata.replyTo);
		if (ui === "apple_mail" && isLearner) {
			const draft = parseMailMessage(content);
			drafts.push({
				ref,
				role: "learner",
				author,
				...(draft.to ? { to: draft.to } : {}),
				...(draft.subject ? { subject: draft.subject } : {}),
				text: draft.body,
			});
			continue;
		}
		drafts.push({ ref, parent, role: isLearner ? "learner" : "cast", author, text: content });
	}

	const positions = new Map(drafts.map((draft, index) => [draft.ref, index + 1]));
	const entries = drafts.map(({ ref: _ref, parent, ...entry }, index): TranscriptEntry => {
		const replyTo = parent ? positions.get(parent) : undefined;
		return { id: index + 1, ...(replyTo ? { replyTo } : {}), ...entry };
	});
	return { entries, refs: drafts.map((draft) => draft.ref) };
}

export function buildChatTranscript(input: BuildChatTranscriptInput): TranscriptEntry[] {
	return buildSceneTranscript(input).entries;
}
