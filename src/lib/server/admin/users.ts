import { count, desc, eq, max, sql, sum } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { llmCall, note, piece, session, user, userKey } from "#lib/server/db/schema.ts";

/*
 * Every account, for the admin: who they are, their setup, how much they write, and their model calls (the thirty days
 * `llm_call` keeps). Deleting one deletes the row; everything of theirs goes with it (on delete cascade).
 */
export type UserRow = {
	id: string;
	name: string;
	email: string;
	role: string;
	verified: boolean;
	native: string | null;
	learning: string[];
	helpImprove: boolean;
	provider: string | null;
	model: string | null;
	createdAt: string;
	onboarded: boolean;
	lastSeen: string | null;
	pieces: number;
	notes: number;
	calls: number;
	cost: number;
};

export type UserCall = {
	id: string;
	at: string;
	tag: string;
	purpose: string;
	model: string;
	state: string;
	tokens: number;
	cost: number;
	ms: number;
	piece: { id: string; title: string } | null;
	error: string | null;
};

export async function users(): Promise<UserRow[]> {
	const [rows, pieces, notes, calls, seen] = await Promise.all([
		db
			.select({ u: user, provider: userKey.provider, model: userKey.model })
			.from(user)
			.leftJoin(userKey, eq(userKey.userId, user.id))
			.orderBy(desc(user.createdAt)),
		db.select({ id: piece.userId, n: count() }).from(piece).groupBy(piece.userId),
		db.select({ id: note.userId, n: count() }).from(note).where(sql`${note.deletedAt} is null`).groupBy(note.userId),
		db
			.select({ id: llmCall.userId, n: count(), cost: sum(llmCall.costUsd) })
			.from(llmCall)
			.groupBy(llmCall.userId),
		db
			.select({ id: session.userId, at: max(session.updatedAt) })
			.from(session)
			.groupBy(session.userId),
	]);
	const by = <T extends { id: string | null }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
	const [p, n, c, s] = [by(pieces), by(notes), by(calls), by(seen)];
	return rows.map(({ u, provider, model }) => ({
		id: u.id,
		name: u.name,
		email: u.email,
		role: u.role,
		verified: u.emailVerified,
		native: u.nativeLanguage,
		learning: u.learningLanguages,
		helpImprove: u.helpImprove,
		provider,
		model,
		createdAt: u.createdAt.toISOString(),
		onboarded: !!u.onboardedAt,
		lastSeen: s.get(u.id)?.at?.toISOString() ?? null,
		pieces: p.get(u.id)?.n ?? 0,
		notes: n.get(u.id)?.n ?? 0,
		calls: c.get(u.id)?.n ?? 0,
		cost: Number(c.get(u.id)?.cost ?? 0),
	}));
}

/** A learner's calls, newest first (at most `limit`), with the piece each was for. */
export async function callsOf(userId: string, limit = 300): Promise<UserCall[]> {
	const rows = await db
		.select({ c: llmCall, title: piece.title })
		.from(llmCall)
		.leftJoin(piece, eq(piece.id, llmCall.pieceId))
		.where(eq(llmCall.userId, userId))
		.orderBy(desc(llmCall.createdAt))
		.limit(limit);
	return rows.map(({ c, title }) => ({
		id: c.id,
		at: c.createdAt.toISOString(),
		tag: c.tag,
		purpose: c.purpose,
		model: c.model,
		state: c.state,
		tokens: (c.promptTokens ?? 0) + (c.completionTokens ?? 0),
		cost: c.costUsd ?? 0,
		ms: c.latencyMs ?? 0,
		piece: c.pieceId ? { id: c.pieceId, title: title ?? "" } : null,
		error: c.error,
	}));
}

export async function deleteUser(id: string) {
	await db.delete(user).where(eq(user.id, id));
}
