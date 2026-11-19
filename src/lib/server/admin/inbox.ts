import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { feedback, scenario, suggestion, user } from "#lib/server/db/schema.ts";

/* What learners send, as the admin's inbox reads it: suggested situations and feedback about the app. */
export type InboxSuggestion = {
	id: string;
	by: string;
	place: string;
	language: string;
	situation: string;
	who: string | null;
	purpose: string;
	mine: string | null;
	status: "pending" | "live" | "unused";
	reason: string | null;
	scenario: { id: string; title: string; published: boolean } | null;
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
			.select({ s: suggestion, by: user.name, versions: scenario.versions, published: sql<boolean>`${scenario.status} = 'published'` })
			.from(suggestion)
			.innerJoin(user, eq(user.id, suggestion.userId))
			.leftJoin(scenario, eq(scenario.id, suggestion.scenarioId))
			.orderBy(desc(suggestion.createdAt)),
		db.select({ f: feedback, by: user.name }).from(feedback).innerJoin(user, eq(user.id, feedback.userId)).orderBy(desc(feedback.createdAt)),
	]);
	return {
		suggestions: sug.map(({ s, by, versions, published }) => {
			const v = versions as Record<string, { title?: string }> | null;
			const title = v ? (v[s.language]?.title ?? Object.values(v)[0]?.title ?? "") : "";
			return { ...viewOf(s, by), scenario: s.scenarioId ? { id: s.scenarioId, title, published: !!published } : null };
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

const viewOf = (s: typeof suggestion.$inferSelect, by: string): Omit<InboxSuggestion, "scenario"> => ({
	id: s.id,
	by,
	place: s.place,
	language: s.language,
	situation: s.situation,
	who: s.who,
	purpose: s.purpose,
	mine: s.mine,
	status: s.status as InboxSuggestion["status"],
	reason: s.reason,
	at: s.createdAt.toISOString(),
});

/** The suggestion a scenario was made from, for its editor. */
export async function suggestionFor(scenarioId: string) {
	const [row] = await db
		.select({ s: suggestion, by: user.name })
		.from(suggestion)
		.innerJoin(user, eq(user.id, suggestion.userId))
		.where(eq(suggestion.scenarioId, scenarioId));
	return row ? viewOf(row.s, row.by) : null;
}

/** Sets a waiting suggestion aside with a line the learner reads. */
export async function setAside(id: string, reason: string) {
	await db
		.update(suggestion)
		.set({ status: "unused", reason, resolvedAt: new Date() })
		.where(and(eq(suggestion.id, id), eq(suggestion.status, "pending")));
}

export async function markFeedback(id: string, done: boolean) {
	await db
		.update(feedback)
		.set({ doneAt: done ? new Date() : null })
		.where(eq(feedback.id, id));
}
