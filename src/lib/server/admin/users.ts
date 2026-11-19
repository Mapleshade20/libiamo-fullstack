import { and, count, desc, eq, ilike, inArray, max, or, sql, sum } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { llmCall, note, piece, session, user, userKey } from "#lib/server/db/schema.ts";
import { forgetLearner } from "#lib/server/revision/store.ts";

/*
 * Every account, for the admin, a page at a time: who they are, their setup, how much they write, and their model calls
 * (the thirty days `llm_call` keeps), counted for that page's accounts only (each an index lookup by user). Deleting
 * one deletes the row; everything of theirs goes with it (on delete cascade).
 */
export const USERS_PAGE = 50;
export type UsersPage = { rows: UserRow[]; total: number; more: boolean };
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

/** A page of accounts, newest first; `q` finds a name, an address or an id. */
export async function users(o: { q?: string; offset?: number; ids?: string[] } = {}): Promise<UsersPage> {
	const q = o.q?.trim();
	const like = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
	const where = and(
		like ? or(ilike(user.name, like), ilike(user.email, like), eq(user.id, q as string)) : undefined,
		o.ids ? inArray(user.id, o.ids) : undefined,
	);
	const [found, [{ total }]] = await Promise.all([
		db
			.select({ u: user, provider: userKey.provider, model: userKey.model })
			.from(user)
			.leftJoin(userKey, eq(userKey.userId, user.id))
			.where(where)
			.orderBy(desc(user.createdAt), desc(user.id))
			.limit(USERS_PAGE + 1)
			.offset(o.offset ?? 0),
		db.select({ total: count() }).from(user).where(where),
	]);
	const rows = found.slice(0, USERS_PAGE);
	const ids = rows.map((r) => r.u.id);
	if (!ids.length) return { rows: [], total, more: false };
	const [pieces, notes, calls, seen] = await Promise.all([
		db.select({ id: piece.userId, n: count() }).from(piece).where(inArray(piece.userId, ids)).groupBy(piece.userId),
		db
			.select({ id: note.userId, n: count() })
			.from(note)
			.where(and(inArray(note.userId, ids), sql`${note.deletedAt} is null`))
			.groupBy(note.userId),
		db
			.select({ id: llmCall.userId, n: count(), cost: sum(llmCall.costUsd) })
			.from(llmCall)
			.where(inArray(llmCall.userId, ids))
			.groupBy(llmCall.userId),
		db
			.select({ id: session.userId, at: max(session.updatedAt) })
			.from(session)
			.where(inArray(session.userId, ids))
			.groupBy(session.userId),
	]);
	const by = <T extends { id: string | null }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
	const [p, n, c, s] = [by(pieces), by(notes), by(calls), by(seen)];
	const out = rows.map(({ u, provider, model }) => ({
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
	return { rows: out, total, more: found.length > USERS_PAGE };
}

/** A learner's calls, newest first (at most `limit`), with the piece each was for. */
export async function callsOf(userId: string, limit = 300): Promise<UserCall[]> {
	const rows = await db
		// The numbers and the error only: a call's messages and output are the bulk of its row.
		.select({
			c: {
				id: llmCall.id,
				createdAt: llmCall.createdAt,
				tag: llmCall.tag,
				purpose: llmCall.purpose,
				model: llmCall.model,
				state: llmCall.state,
				promptTokens: llmCall.promptTokens,
				completionTokens: llmCall.completionTokens,
				costUsd: llmCall.costUsd,
				latencyMs: llmCall.latencyMs,
				pieceId: llmCall.pieceId,
				error: llmCall.error,
			},
			title: piece.title,
		})
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
	await forgetLearner(id);
	await db.delete(user).where(eq(user.id, id));
}
