import { and, desc, eq } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { feedback, scenario, suggestion, user } from "#lib/server/db/schema.ts";

/* What learners send, as the admin's inbox reads it: suggested situations and feedback about the app. */
export type InboxSuggestion = {
	id: string;
	by: string;
	place: string;
	language: string;
	situation: string;
	purpose: string;
	mine: string | null;
	status: "pending" | "live" | "unused";
	reason: string | null;
	scenario: { id: string; title: string } | null;
	at: string;
};
export type InboxFeedback = {
	id: string;
	by: string;
	kind: "idea" | "bug" | "other";
	text: string;
	page: string | null;
	browser: string | null;
	done: boolean;
	at: string;
};

export async function inbox(): Promise<{ suggestions: InboxSuggestion[]; feedback: InboxFeedback[] }> {
	const [sug, fb] = await Promise.all([
		db
			.select({ s: suggestion, by: user.name, versions: scenario.versions })
			.from(suggestion)
			.innerJoin(user, eq(user.id, suggestion.userId))
			.leftJoin(scenario, eq(scenario.id, suggestion.scenarioId))
			.orderBy(desc(suggestion.createdAt)),
		db.select({ f: feedback, by: user.name }).from(feedback).innerJoin(user, eq(user.id, feedback.userId)).orderBy(desc(feedback.createdAt)),
	]);
	return {
		suggestions: sug.map(({ s, by, versions }) => {
			const v = versions as Record<string, { title?: string }> | null;
			const title = v ? (v[s.language]?.title ?? Object.values(v)[0]?.title ?? "") : "";
			return {
				id: s.id,
				by,
				place: s.place,
				language: s.language,
				situation: s.situation,
				purpose: s.purpose,
				mine: s.mine,
				status: s.status as InboxSuggestion["status"],
				reason: s.reason,
				scenario: s.scenarioId ? { id: s.scenarioId, title } : null,
				at: s.createdAt.toISOString(),
			};
		}),
		feedback: fb.map(({ f, by }) => ({
			id: f.id,
			by,
			kind: f.kind as InboxFeedback["kind"],
			text: f.text,
			page: f.page,
			browser: f.browser,
			done: !!f.doneAt,
			at: f.createdAt.toISOString(),
		})),
	};
}

/** Sets a waiting suggestion aside with a line the learner reads. */
export async function setAside(id: string, reason: string) {
	await db
		.update(suggestion)
		.set({ status: "unused", reason, resolvedAt: new Date() })
		.where(and(eq(suggestion.id, id), eq(suggestion.status, "pending")));
}

/** Marks a suggestion as made into a scenario. */
export async function markLive(id: string, scenarioId: string) {
	await db.update(suggestion).set({ status: "live", scenarioId, reason: null, resolvedAt: new Date() }).where(eq(suggestion.id, id));
}

export async function markFeedback(id: string, done: boolean) {
	await db
		.update(feedback)
		.set({ doneAt: done ? new Date() : null })
		.where(eq(feedback.id, id));
}

export async function suggestionById(id: string) {
	const [row] = await db.select().from(suggestion).where(eq(suggestion.id, id));
	return row ?? null;
}
