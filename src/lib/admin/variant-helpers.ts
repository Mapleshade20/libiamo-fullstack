/**
 * Pure helpers for admin variant editing: slot extraction/validation
 * and opening-state normalisation/projection.
 */

import type { z } from "zod";
import type {
	ao3OpeningStateSchema,
	appleMailOpeningStateSchema,
	discordOpeningStateSchema,
	imessageOpeningStateSchema,
	redditOpeningStateSchema,
	translatorOpeningStateSchema,
} from "$lib/schemas";

// ── Types ────────────────────────────────────────────────────────────

export type UiVariant = "reddit" | "apple_mail" | "discord" | "imessage" | "ao3" | "translator";

type IMessageState = z.infer<typeof imessageOpeningStateSchema>;
type DiscordState = z.infer<typeof discordOpeningStateSchema>;
type RedditState = z.infer<typeof redditOpeningStateSchema>;
type AppleMailState = z.infer<typeof appleMailOpeningStateSchema>;
type Ao3State = z.infer<typeof ao3OpeningStateSchema>;
type TranslatorState = z.infer<typeof translatorOpeningStateSchema>;

export type OpeningState = IMessageState | DiscordState | RedditState | AppleMailState | Ao3State | TranslatorState;

/** Canonical superset for lossless transformation between UIs */
export interface OpeningStateSuperset {
	// Message-based UIs (imessage, discord)
	messages: Array<{ sender: "user" | "agent"; text: string; timestamp?: string }>;
	// Discord-specific
	serverName: string;
	channelName: string;
	// Apple Mail
	emails: Array<{ from: string; to: string; subject: string; body: string; date?: string }>;
	// Reddit
	post: { title: string; body: string; subreddit: string; author: string; votes?: number };
	comments: Array<{ author: string; text: string; votes?: number }>;
	// AO3
	workTitle: string;
	chapterTitle: string;
	bodyExcerpt: string;
	tags: string[];
	// Translator
	sourceText: string;
}

// ── Form Data Parsing ────────────────────────────────────────────────

export function parseJsonField(raw: unknown): Record<string, unknown> {
	if (typeof raw !== "string" || raw.trim() === "") return {};
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
		return {};
	} catch {
		return {};
	}
}

export function parseSlotValues(raw: unknown): Record<string, string> {
	const obj = parseJsonField(raw);
	const result: Record<string, string> = {};
	for (const [k, v] of Object.entries(obj)) {
		result[k] = String(v);
	}
	return result;
}

// ── Slot Extraction ──────────────────────────────────────────────────

const SLOT_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Extract slot names from template fields that support slots.
 * Handles both string and string[] (objectivesBase) fields.
 */
export function extractSlotNames(fields: {
	titleBase?: string | null;
	shortObjectiveBase?: string | null;
	descriptionBase?: string | null;
	agentPromptBase?: string | null;
	objectivesBase?: string[] | null;
}): Set<string> {
	const slots = new Set<string>();

	const stringFields = [fields.titleBase, fields.shortObjectiveBase, fields.descriptionBase, fields.agentPromptBase];

	for (const field of stringFields) {
		if (!field) continue;
		for (const match of field.matchAll(SLOT_REGEX)) {
			slots.add(match[1]);
		}
	}

	// objectivesBase is string[]
	if (fields.objectivesBase) {
		for (const objective of fields.objectivesBase) {
			for (const match of objective.matchAll(SLOT_REGEX)) {
				slots.add(match[1]);
			}
		}
	}

	return slots;
}

/**
 * Return slot names used in template fields but missing from variant slotValues.
 */
export function getMissingSlots(slotValues: Record<string, string>, requiredSlots: Set<string>): string[] {
	const missing: string[] = [];
	for (const slot of requiredSlots) {
		if (!(slot in slotValues) || slotValues[slot].trim() === "") {
			missing.push(slot);
		}
	}
	return missing.sort((a, b) => a.localeCompare(b));
}

/**
 * Return slot names in slotValues that are NOT used in any template field.
 */
export function getUnusedSlots(slotValues: Record<string, string>, requiredSlots: Set<string>): string[] {
	const unused: string[] = [];
	for (const slot of Object.keys(slotValues)) {
		if (!requiredSlots.has(slot)) {
			unused.push(slot);
		}
	}
	return unused.sort((a, b) => a.localeCompare(b));
}

// ── Opening State Defaults ───────────────────────────────────────────

export function getDefaultOpeningState(ui: UiVariant): OpeningState {
	switch (ui) {
		case "imessage":
			return { previousMessages: [] };
		case "discord":
			return { serverName: "", channelName: "", previousMessages: [] };
		case "reddit":
			return {
				post: { title: "", body: "", subreddit: "", author: "" },
				previousComments: [],
			};
		case "apple_mail":
			return { emails: [] };
		case "ao3":
			return { workTitle: "", chapterTitle: "", bodyExcerpt: "", tags: [] };
		case "translator":
			return { sourceText: "" };
	}
}

// ── Opening State Superset Transform ─────────────────────────────────

function emptySuperset(): OpeningStateSuperset {
	return {
		messages: [],
		serverName: "",
		channelName: "",
		emails: [],
		post: { title: "", body: "", subreddit: "", author: "" },
		comments: [],
		workTitle: "",
		chapterTitle: "",
		bodyExcerpt: "",
		tags: [],
		sourceText: "",
	};
}

/**
 * Normalise current opening state draft into canonical superset.
 * Preserves all data for lossless transform when possible.
 */
export function normaliseToSuperset(state: Record<string, unknown>, fromUi: UiVariant): OpeningStateSuperset {
	const superset = emptySuperset();

	switch (fromUi) {
		case "imessage": {
			const msgs = state.previousMessages;
			if (Array.isArray(msgs)) {
				superset.messages = msgs.map((m) => ({
					sender: m?.sender === "agent" ? "agent" : "user",
					text: String(m?.text ?? ""),
				}));
			}
			break;
		}
		case "discord": {
			superset.serverName = String(state.serverName ?? "");
			superset.channelName = String(state.channelName ?? "");
			const msgs = state.previousMessages;
			if (Array.isArray(msgs)) {
				superset.messages = msgs.map((m) => ({
					sender: m?.sender === "agent" ? "agent" : "user",
					text: String(m?.text ?? ""),
					timestamp: m?.timestamp ? String(m.timestamp) : undefined,
				}));
			}
			break;
		}
		case "reddit": {
			const post = state.post as Record<string, unknown> | undefined;
			if (post) {
				superset.post = {
					title: String(post.title ?? ""),
					body: String(post.body ?? ""),
					subreddit: String(post.subreddit ?? ""),
					author: String(post.author ?? ""),
					votes: typeof post.votes === "number" ? post.votes : undefined,
				};
			}
			const comments = state.previousComments;
			if (Array.isArray(comments)) {
				superset.comments = comments.map((c) => ({
					author: String(c?.author ?? ""),
					text: String(c?.text ?? ""),
					votes: typeof c?.votes === "number" ? c.votes : undefined,
				}));
			}
			break;
		}
		case "apple_mail": {
			const emails = state.emails;
			if (Array.isArray(emails)) {
				superset.emails = emails.map((e) => ({
					from: String(e?.from ?? ""),
					to: String(e?.to ?? ""),
					subject: String(e?.subject ?? ""),
					body: String(e?.body ?? ""),
					date: e?.date ? String(e.date) : undefined,
				}));
			}
			break;
		}
		case "ao3": {
			superset.workTitle = String(state.workTitle ?? "");
			superset.chapterTitle = String(state.chapterTitle ?? "");
			superset.bodyExcerpt = String(state.bodyExcerpt ?? "");
			const tags = state.tags;
			if (Array.isArray(tags)) {
				superset.tags = tags.map(String);
			}
			break;
		}
		case "translator": {
			superset.sourceText = String(state.sourceText ?? "");
			break;
		}
	}

	return superset;
}

/**
 * Project superset to UI-specific shape with proper defaults.
 */
export function projectFromSuperset(superset: OpeningStateSuperset, toUi: UiVariant): OpeningState {
	switch (toUi) {
		case "imessage":
			return {
				previousMessages: superset.messages.map((m) => ({
					sender: m.sender,
					text: m.text,
				})),
			};
		case "discord":
			return {
				serverName: superset.serverName,
				channelName: superset.channelName,
				previousMessages: superset.messages.map((m) => ({
					sender: m.sender,
					text: m.text,
					timestamp: m.timestamp,
				})),
			};
		case "reddit":
			return {
				post: superset.post,
				previousComments: superset.comments.length > 0 ? superset.comments : undefined,
			};
		case "apple_mail":
			return { emails: superset.emails };
		case "ao3":
			return {
				workTitle: superset.workTitle,
				chapterTitle: superset.chapterTitle || undefined,
				bodyExcerpt: superset.bodyExcerpt || undefined,
				tags: superset.tags.length > 0 ? superset.tags : undefined,
			};
		case "translator":
			return { sourceText: superset.sourceText };
	}
}

/**
 * Transform opening state from one UI to another via superset.
 */
export function transformOpeningState(state: Record<string, unknown>, fromUi: UiVariant, toUi: UiVariant): OpeningState {
	if (fromUi === toUi) {
		// Just return with defaults applied
		return projectFromSuperset(normaliseToSuperset(state, fromUi), toUi);
	}
	const superset = normaliseToSuperset(state, fromUi);
	return projectFromSuperset(superset, toUi);
}
