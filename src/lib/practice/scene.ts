/**
 * Who is in a practice scene, as the interface shows them. Every surface and every chat prompt
 * resolves the counterpart and the cast here, so the names the learner sees are the names the
 * models are told.
 */

import type { UiVariant } from "$lib/constants";
import { flattenOpeningComments, getThreadOwner } from "./comment-thread";
import { createMemberPool } from "./discord-members";
import { type MailContact, type MailOpeningState, parseMailAddress, resolveMailCounterpart, seededContact } from "./mail";
import { type ChatOpeningState, resolveOpeningAgentName } from "./messages";

/** A person's display name; `address` is set only on mail. */
export type Counterpart = MailContact;

export type Scene = {
	/** Who the learner primarily addresses: the DM partner, the main recipient, the thread owner. */
	counterpart: Counterpart;
	/** Everyone the models voice, counterpart first. */
	cast: Counterpart[];
	/** Anyone besides the counterpart may speak. */
	group: boolean;
	/** People outside the cast may join, as on public channels and threads. */
	open: boolean;
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/** `Ana, Bruno <b@x.example>` → the listed people. */
function listed(value: unknown): Counterpart[] {
	return text(value)
		.split(",")
		.map((entry) => parseMailAddress(entry))
		.filter((person) => person.name);
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
			const fallback = ui === "discord" ? createMemberPool(String(seed)).agent.name : seededContact(seed).name;
			return { name: text(state.counterpartName) || resolveOpeningAgentName(state as ChatOpeningState, learnerName) || fallback, address: "" };
		}
	}
}

/**
 * The counterpart plus everyone else the learner can see in the scene: opening senders and
 * authors, declared `members` (iMessage groups, mail recipients), and, for a Discord channel whose
 * opening has fewer than three speakers, its online members. A Discord `dm` is one-to-one.
 */
export function resolveScene(ui: UiVariant, openingState: unknown, seed: string | number, learnerName: string): Scene {
	const state = record(openingState);
	const counterpart = resolveCounterpart(ui, state, seed, learnerName);
	const people = [counterpart];
	const dm = ui === "discord" && state.dm === true;
	const senders = () =>
		(Array.isArray(state.previousMessages) ? state.previousMessages : []).map((message) => ({ name: text(record(message).sender), address: "" }));
	switch (ui) {
		case "imessage":
			people.push(...senders(), ...listed(state.members));
			break;
		case "discord": {
			if (dm) break;
			// A channel whose opening already has a crowd needs no filler members.
			const posted = new Set(senders().map((person) => person.name)).size;
			people.push(...senders(), ...(posted < 3 ? createMemberPool(String(seed)).online.map((member) => ({ name: member.name, address: "" })) : []));
			break;
		}
		case "apple_mail":
			people.push(
				...(Array.isArray(state.emails) ? state.emails : []).map((email) => parseMailAddress(text(record(email).from))),
				...listed(state.members),
			);
			break;
		case "reddit":
		case "ao3":
			people.push(...flattenOpeningComments(ui, state).map((comment) => ({ name: comment.author, address: "" })));
			break;
	}
	const seen = new Set([learnerName.trim().toLowerCase()]);
	const cast = people.filter((person) => {
		const key = person.name.toLowerCase();
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	const open = ui === "reddit" || ui === "ao3" || (ui === "discord" && !dm);
	return { counterpart, cast, group: open || cast.length > 1, open };
}

/** Group chats that live on while the learner is silent: time passes in them every minute or two. */
export function isLiveChat(ui: UiVariant, scene: Scene): boolean {
	return (ui === "discord" || ui === "imessage") && scene.group;
}

/** Surfaces whose replies arrive as independently scheduled response opportunities, not live-chat turns. */
export function isAsyncSurface(ui: UiVariant): boolean {
	return ui === "reddit" || ui === "ao3" || ui === "apple_mail";
}
