import { error } from "@sveltejs/kit";
import { and, eq, inArray, sql } from "drizzle-orm";
import EmojiConverter from "emoji-js";
import { z } from "zod";
import type { SendResult } from "#lib/components/exchange/actions.ts";
import type { ExchangePlace } from "#lib/constants.ts";
import { db } from "#lib/server/db/index.ts";
import { exchange, piece, scenario } from "#lib/server/db/schema.ts";
import { afterOf } from "#lib/server/exchange/after.ts";
import { completeSession, exchangeFor, openExchange, sessionMessageChronologicalOrder, submitMessage } from "#lib/server/exchange/exchanges.ts";
import { generateHint } from "#lib/server/exchange/hints.ts";
import { sendOptionsFor } from "#lib/server/exchange/send-options.ts";
import { settingFrom } from "#lib/server/exchange/setting.ts";
import { acknowledgeAssistantMessage, earliestOutstandingDueAtInScope, getNextAgentWorkDueAt, getUnreadInbox } from "#lib/server/exchange/unread.ts";
import { learner } from "#lib/server/guard.ts";
import { learnerCaller, routeOf } from "#lib/server/llm/callers.ts";
import { stopOf } from "#lib/server/llm/transport.ts";
import { shelves } from "#lib/writing/writing.remote.ts";
import { command, query } from "$app/server";
import { MAIL_TEXT_MAX, TEXT_MAX } from "./limits.ts";
import { parseMailMessage } from "./mail.ts";
import type { PersistedExchange } from "./messages.ts";
import type { UnreadInboxItem } from "./unread.ts";

/*
 * The simulated place as the play page reads and writes it. `place` is everything the page needs to draw it: the
 * scenario's place, its opening with the people named, the turn limit, and the learner's exchange once they have gone
 * in (null before). The page polls it while the cast is composing; every command answers for itself (`learner()` and
 * the exchange's owner).
 */
const emoji = new EmojiConverter();
emoji.colons_mode = true;

const sqlScope = (id: number) => sql`s.id = ${id}`;

const PlaceQuery = z.object({ scenarioId: z.string().max(60), lang: z.string().max(10) });

async function settingFor(scenarioId: string, language: string) {
	const [row] = await db
		.select()
		.from(scenario)
		.where(and(eq(scenario.id, scenarioId), eq(scenario.status, "published")));
	return row ? settingFrom(row, language) : null;
}

export type PlaceView = {
	scenarioId: string;
	place: ExchangePlace;
	title: string;
	language: string;
	openingState: Record<string, unknown>;
	maxTurns: number;
	/** The learner's exchange, once they have gone in. */
	persisted: PersistedExchange | null;
	pieceId: string | null;
	/** The newest reply, for the read receipt. */
	latestReplyId: number | null;
};

export const placeOf = query(PlaceQuery, async ({ scenarioId, lang }): Promise<PlaceView | null> => {
	const u = learner();
	// The open piece of this scenario in this language, whether its exchange is going on or over (the after page reads it too).
	const [row] = await db
		.select({ id: exchange.id, pieceId: exchange.pieceId })
		.from(exchange)
		.innerJoin(piece, eq(piece.id, exchange.pieceId))
		.where(
			and(eq(exchange.userId, u.id), eq(exchange.scenarioId, scenarioId), eq(piece.language, lang), inArray(piece.state, ["writing", "revising"])),
		);
	const s = await settingFor(scenarioId, lang);
	if (!s) return null;
	let persisted: PersistedExchange | null = null;
	let latestReplyId: number | null = null;
	if (row) {
		const ex = await db.query.exchange.findFirst({
			where: eq(exchange.id, row.id),
			columns: { id: true, status: true, agentReadUpToMessageId: true },
			with: {
				messages: { columns: { id: true, role: true, content: true, createdAt: true, llmMetadata: true }, orderBy: sessionMessageChronologicalOrder },
			},
		});
		if (ex) {
			const dueAt = await earliestOutstandingDueAtInScope(sqlScope(ex.id));
			persisted = { ...ex, status: ex.status as PersistedExchange["status"], nextAgentWorkDueAt: dueAt };
			latestReplyId = ex.messages.reduce((m, x) => (x.role === "assistant" ? Math.max(m, x.id) : m), 0) || null;
		}
	}
	return {
		scenarioId,
		place: s.ui,
		title: s.title,
		language: s.language,
		openingState: s.openingState,
		maxTurns: s.maxTurns ?? 0,
		persisted,
		pieceId: row?.pieceId ?? null,
		latestReplyId,
	};
});

/** Goes into the place: the piece and its exchange, the plan typed on the scenario page as the piece's background. */
export const enterPlace = command(
	z.object({ scenarioId: z.string().max(60), lang: z.string().max(10), plan: z.string().max(4000).default("") }),
	async (input) => {
		const u = learner();
		const s = await settingFor(input.scenarioId, input.lang);
		if (!s) error(404, "No such scenario.");
		const r = await openExchange(u, s, input.plan);
		if (!r) error(404, "No such scenario.");
		await Promise.all([placeOf({ scenarioId: input.scenarioId, lang: input.lang }).refresh(), shelves().refresh()]);
		return r;
	},
);

async function owned(exchangeId: number) {
	const u = learner();
	const ex = await exchangeFor(exchangeId, u.id);
	if (!ex?.scenarioId) error(404, "No such exchange.");
	const [p] = await db.select({ language: piece.language }).from(piece).where(eq(piece.id, ex.pieceId));
	const [row] = await db.select().from(scenario).where(eq(scenario.id, ex.scenarioId));
	const s = row && p ? settingFrom(row, p.language) : null;
	if (!s) error(404, "No such exchange.");
	return { u, ex, s };
}

const SendInput = z.object({ exchangeId: z.number().int(), fields: z.record(z.string(), z.string().max(60_000)) });

/** One learner message; the cast's reply is composed in the background (server/exchange/agents). */
export const sendToPlace = command(SendInput, async ({ exchangeId, fields }): Promise<SendResult> => {
	const { u, ex, s } = await owned(exchangeId);
	const raw = fields.message ?? "";
	const clientMessageId = (fields.clientMessageId ?? "").trim();
	const invalid = { status: "rejected", reason: "invalid" } as const;
	if (!raw.trim() || clientMessageId.length > 200) return invalid;
	// The cast answers on the learner's key: without one the message is not kept, rather than failing a minute later.
	if (!(await routeOf(u.id))) return { status: "rejected", reason: "nokey" };
	const tooLong = s.ui === "email" ? parseMailMessage(raw).body.length > MAIL_TEXT_MAX : raw.length > TEXT_MAX;
	if (tooLong) return invalid;
	const message = emoji.replace_unified(raw);
	const options = await sendOptionsFor({
		ui: s.ui,
		fields,
		openingState: s.openingState,
		exchangeId: ex.id,
		message,
		clientMessageId,
		userName: u.name || "Learner",
	});
	if (!options.ok) return invalid;
	try {
		const r = await submitMessage(ex.id, message, u.id, clientMessageId || undefined, options.options);
		return "sessionCompleted" in r ? { status: "exchange_completed" } : { status: "pending" };
	} catch (e) {
		const m = (e as Error).message;
		if (/not in progress|Maximum conversation turns/i.test(m)) return { status: "rejected", reason: "closed" };
		if (/required/i.test(m)) return invalid;
		console.error("exchange send failed:", e);
		return { status: "failed" };
	}
});

/** The learner ends the exchange (a turn limit ends it by itself). */
export const finishPlace = command(z.number().int(), async (exchangeId) => {
	const { ex } = await owned(exchangeId);
	if (ex.status === "in_progress") await completeSession(ex.id);
});

/** A hint for the next message, on the learner's key. */
export const hintInPlace = command(
	z.object({
		exchangeId: z.number().int(),
		mode: z.enum(["content", "expression"]),
		draft: z.string().max(20_000).default(""),
		expression: z.string().max(2000).optional(),
		contextPath: z
			.array(z.object({ author: z.string().max(200), text: z.string().max(20_000) }))
			.max(40)
			.optional(),
	}),
	async ({ exchangeId, ...input }) => {
		const { u, ex } = await owned(exchangeId);
		if (input.mode === "expression" && !input.expression?.trim()) error(400, "Expression is required");
		try {
			return await generateHint(ex.id, { ...input, nativeLanguage: u.nativeLanguage }, await learnerCaller({ user: u, pieceId: ex.pieceId }));
		} catch (e) {
			error(stopOf(e) === "error" ? 502 : 402, stopOf(e));
		}
	},
);

/** The learner has seen the replies up to this one. */
export const readInPlace = command(z.object({ exchangeId: z.number().int(), messageId: z.number().int() }), async ({ exchangeId, messageId }) => {
	const u = learner();
	const r = await acknowledgeAssistantMessage(exchangeId, u.id, messageId);
	return { worldScheduled: r.worldScheduled };
});

/** The exchange once it is over, for the after page: the thread, and what the revision is handed. */
export const afterPlace = query(PlaceQuery, async ({ scenarioId, lang }) => {
	const u = learner();
	return afterOf(u, scenarioId, lang);
});

/** Replies the learner has not read, by exchange (the home page's "someone answered you"), and when the cast's next
 *  reply falls due, so the page knows when to ask again (null: nothing is coming). */
export const unreadReplies = query(async (): Promise<{ items: UnreadInboxItem[]; nextDueAt: string | null }> => {
	const u = learner();
	const [items, due] = await Promise.all([getUnreadInbox(u.id), getNextAgentWorkDueAt(u.id)]);
	return { items, nextDueAt: due?.toISOString() ?? null };
});
