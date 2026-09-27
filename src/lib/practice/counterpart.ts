/**
 * Who the learner talks to, as the interface shows them. Every surface and every chat prompt
 * resolves the counterpart here, so the name the learner sees is the name the models are told.
 */

import type { UiVariant } from "$lib/constants";
import { getThreadOwner } from "./comment-thread";
import { createMemberPool } from "./discord-members";
import { type MailContact, type MailOpeningState, resolveMailCounterpart, seededContact } from "./mail";
import { type ChatOpeningState, resolveOpeningAgentName } from "./messages";

/** The counterpart's display name; `address` is set only on mail. */
export type Counterpart = MailContact;

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * The authored `counterpartName` wins, then the first opening sender who is not the learner, then
 * a stable made-up identity seeded by the task id. Comment threads name the post or work author.
 */
export function resolveCounterpart(ui: UiVariant, openingState: unknown, seed: string | number, learnerName: string): Counterpart {
	const state = record(openingState);
	switch (ui) {
		case "apple_mail":
			return resolveMailCounterpart(state as MailOpeningState, seed);
		case "reddit":
		case "ao3":
			return { name: getThreadOwner(ui, state), address: "" };
		default: {
			const authored = typeof state.counterpartName === "string" ? state.counterpartName.trim() : "";
			const fallback = ui === "discord" ? createMemberPool(String(seed)).agent.name : seededContact(seed).name;
			return { name: authored || resolveOpeningAgentName(state as ChatOpeningState, learnerName) || fallback, address: "" };
		}
	}
}
