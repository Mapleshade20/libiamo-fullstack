/**
 * Pure helpers for admin variant editing: slot extraction/validation
 * and opening-state defaults.
 */

import type { z } from "zod";
import type { UiVariant } from "$lib/constants";
import type {
	ao3OpeningStateSchema,
	appleMailOpeningStateSchema,
	discordOpeningStateSchema,
	imessageOpeningStateSchema,
	redditOpeningStateSchema,
	translatorOpeningStateSchema,
} from "$lib/schemas";

// ── Types ────────────────────────────────────────────────────────────

type IMessageState = z.infer<typeof imessageOpeningStateSchema>;
type DiscordState = z.infer<typeof discordOpeningStateSchema>;
type RedditState = z.infer<typeof redditOpeningStateSchema>;
type AppleMailState = z.infer<typeof appleMailOpeningStateSchema>;
type Ao3State = z.infer<typeof ao3OpeningStateSchema>;
type TranslatorState = z.infer<typeof translatorOpeningStateSchema>;

export type OpeningState = IMessageState | DiscordState | RedditState | AppleMailState | Ao3State | TranslatorState;

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

	if (fields.objectivesBase) {
		for (const objective of fields.objectivesBase) {
			for (const match of objective.matchAll(SLOT_REGEX)) {
				slots.add(match[1]);
			}
		}
	}

	return slots;
}

export function getMissingSlots(slotValues: Record<string, string>, requiredSlots: Set<string>): string[] {
	const missing: string[] = [];
	for (const slot of requiredSlots) {
		if (!(slot in slotValues) || slotValues[slot].trim() === "") {
			missing.push(slot);
		}
	}
	return missing.sort((a, b) => a.localeCompare(b));
}

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
			return { workTitle: "", chapterTitle: "", bodyExcerpt: "", tags: [], previousComments: [] };
		case "translator":
			return { sourceText: "" };
	}
}

export type { UiVariant } from "$lib/constants";
