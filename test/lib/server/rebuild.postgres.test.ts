import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Opt in with TEST_POSTGRES_URL=postgres://localhost/postgres pnpm test. The suite creates and drops its own database;
// it never migrates or truncates the development database. Provider calls are stubbed, database semantics are real.
const config = vi.hoisted(() => ({
	url: process.env.TEST_POSTGRES_URL,
	name: `libiamo_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
	send: vi.fn(),
	makeSource: vi.fn(),
	user: { id: "learner", name: "Learner", helpImprove: true, nativeLanguage: "zh-CN", tutorLanguage: "native", timeZone: "UTC" },
}));
vi.mock("$app/env", () => ({ building: true, dev: false }));
vi.mock("$app/env/private", () => ({
	BETTER_AUTH_SECRET: "rebuild-test-secret-with-at-least-32-characters",
	LLM_CACHE_DIR: undefined,
	LLM_CACHE_ONLY: false,
	OPENROUTER_API_KEY: undefined,
}));
vi.mock("#lib/server/db/index.ts", async () => {
	const { drizzle } = await import("drizzle-orm/postgres-js");
	const { default: postgres } = await import("postgres");
	const schema = await import("#lib/server/db/schema.ts");
	const sql = postgres(config.url ?? "postgres://localhost/postgres", { database: config.name, max: 4 });
	return { sql, db: drizzle(sql, { schema }) };
});
vi.mock("#lib/server/llm/transport.ts", async (original) => ({
	...(await original<typeof import("#lib/server/llm/transport.ts")>()),
	send: config.send,
}));
vi.mock("#lib/server/guard.ts", () => ({ learner: () => config.user, admin: () => config.user }));
vi.mock("#lib/server/translation/source.ts", () => ({
	extractTerms: async () => [],
	makeSource: config.makeSource,
	checkSource: async () => ({ issues: [] }),
	repairSource: async () => [],
}));

import { encryptKey } from "#lib/server/account/key.ts";
import { inbox } from "#lib/server/admin/inbox.ts";
import { adminScenario, scenarioFromSuggestion } from "#lib/server/admin/scenarios.ts";
import { sessionOf, sessions } from "#lib/server/admin/sessions.ts";
import { deleteUser, users } from "#lib/server/admin/users.ts";
import { db, sql } from "#lib/server/db/index.ts";
import {
	exchange,
	exchangeMessage,
	llmCall,
	llmPrompt,
	note,
	piece,
	pieceRevision,
	pieceStep,
	practiceDay,
	reviewLog,
	scenario,
	scenarioSource,
	sessionCase,
	user,
	userKey,
} from "#lib/server/db/schema.ts";
import { afterOf } from "#lib/server/exchange/after.ts";
import { AgentReplyWorker } from "#lib/server/exchange/agents/worker.ts";
import { openExchange, submitMessage } from "#lib/server/exchange/exchanges.ts";
import { settingFrom } from "#lib/server/exchange/setting.ts";
import { Caller, type CallRecord, chat } from "#lib/server/llm/caller.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import { pruneCalls, writeRecord } from "#lib/server/llm/records.ts";
import {
	addReading,
	fileCollected,
	NOTEBOOK_PAGE,
	notebookGlance,
	notebookPage,
	ownReading,
	rateNote,
	readingFor,
	readingOf,
} from "#lib/server/notebook/notes.ts";
import { newCard } from "#lib/server/review/scheduler.ts";
import {
	abandon,
	abandonStale,
	act,
	dropRevision,
	flushRevisions,
	heldRevision,
	openRevision,
	pruneRevisions,
	pruneTapes,
	putAwayIdle,
	startRevision,
} from "#lib/server/revision/store.ts";
import { importContent } from "#lib/server/scenario/content.ts";
import { scenarioViewOf } from "#lib/server/scenario/scenarios.ts";
import { suggest, suggestionsOf } from "#lib/server/scenario/suggestions.ts";
import { sourceIdentity } from "#lib/server/translation/identity.ts";
import { makeSourceRow, queueSources } from "#lib/server/translation/runner.ts";
import { saveSheet, sheetOf, translationFor } from "#lib/server/translation/sheet.ts";
import { credit, reviewsDone } from "#lib/server/week/days.ts";
import { PIECES_PAGE, piecesPage, shelvesOf } from "#lib/server/writing/pieces.ts";
import { takeUp } from "#lib/server/writing/take-up.ts";
import { POST as startPost } from "../../../src/routes/api/s/+server.ts";
import { POST as actionPost } from "../../../src/routes/api/s/[id]/[action]/+server.ts";

describe.skipIf(!config.url)("rebuild boundaries on PostgreSQL", () => {
	const admin = postgres(config.url ?? "postgres://localhost/postgres", { max: 1 });
	const learner = { id: "learner", helpImprove: true, nativeLanguage: "zh-CN", tutorLanguage: "native", timeZone: "UTC" };
	const ids = new Set<string>();
	const version = {
		title: "Menu",
		line: "Translate a menu",
		introduction: "For visitors",
		original: "Soup",
		where: "menu",
		readers: "diners",
		terms: [],
	};
	const content = (original = "Soup", text = "汤") => ({
		version: 1,
		scenarios: [
			{
				id: "menu",
				kind: "translation",
				place: "translation",
				status: "published",
				minutes: 5,
				versions: { en: { ...version, original } },
				sources: [{ language: "en", native: "zh-CN", text, title: "菜单" }],
			},
		],
	});
	const call: CallRecord = {
		purpose: "ask",
		tag: "collect/ask",
		model: "test",
		provider: "openrouter",
		effort: "low",
		state: "done",
		background: false,
		messages: [
			{ role: "system", content: "Private learner passage" },
			{ role: "user", content: "Question" },
		],
		output: "Answer",
		step: null,
	};
	beforeAll(async () => {
		await admin.unsafe(`CREATE DATABASE "${config.name}"`);
		// Every migration in order, as production has them.
		for (const f of readdirSync("drizzle")
			.filter((f) => f.endsWith(".sql"))
			.toSorted())
			await sql.unsafe(readFileSync(`drizzle/${f}`, "utf8"));
	});
	afterAll(async () => {
		try {
			for (const id of ids) await dropRevision(id);
		} finally {
			await sql.end({ timeout: 2 });
			try {
				await admin.unsafe(`DROP DATABASE IF EXISTS "${config.name}" WITH (FORCE)`);
			} finally {
				await admin.end({ timeout: 2 });
			}
		}
	});
	beforeEach(async () => {
		for (const id of ids) await dropRevision(id);
		ids.clear();
		await db.delete(user);
		await db.delete(scenario);
		await db.insert(user).values({ id: learner.id, email: "learner@example.test", name: "Learner" });
		config.send.mockReset().mockResolvedValue({ text: "OK", usage: {}, ms: 1, costUsd: 0 });
		config.makeSource.mockReset().mockResolvedValue({ title: "菜单", source: ["汤"], glossary: [] });
	});

	it("prunes the snapshots finished pieces left behind, and only those", async () => {
		const day = 864e5;
		const make = async (state: "finished" | "revising", finishedAgo?: number, notesPending = false) => {
			const [p] = await db
				.insert(piece)
				.values({
					userId: learner.id,
					language: "en",
					kind: "own",
					text: "A draft.",
					tutorLanguage: "zh-CN",
					state,
					finishedAt: finishedAgo === undefined ? null : new Date(Date.now() - finishedAgo),
					notesRequestedAt: notesPending ? new Date() : null,
				})
				.returning({ id: piece.id });
			await db.insert(pieceRevision).values({ pieceId: p.id, version: 1, state: {} });
			return p.id;
		};
		const old = await make("finished", 2 * day);
		const waiting = await make("finished", 2 * day, true);
		const recent = await make("finished", 3_600_000);
		const open = await make("revising");
		expect(await pruneRevisions()).toBe(1);
		const left = new Set((await db.select({ id: pieceRevision.pieceId }).from(pieceRevision)).map((r) => r.id));
		expect(left.has(old)).toBe(false);
		expect([waiting, recent, open].every((id) => left.has(id))).toBe(true);
	});

	it("keeps a finished piece's tape as long as its model calls, and not at all for a learner who does not help", async () => {
		const day = 864e5;
		await db.insert(user).values({ id: "quiet", email: "quiet@example.test", name: "Quiet", helpImprove: false });
		const make = async (owner: string, state: "finished" | "revising" | "abandoned", finishedAgo?: number) => {
			const [p] = await db
				.insert(piece)
				.values({
					userId: owner,
					language: "en",
					kind: "own",
					text: "A draft.",
					tutorLanguage: "zh-CN",
					state,
					finishedAt: finishedAgo === undefined ? null : new Date(Date.now() - finishedAgo),
				})
				.returning({ id: piece.id });
			await db.insert(pieceStep).values([0, 1].map((seq) => ({ pieceId: p.id, seq, action: "pass1", body: {}, response: {} })));
			return p.id;
		};
		const old = await make(learner.id, "finished", 31 * day);
		const held = await make(learner.id, "finished", 31 * day);
		await db.insert(sessionCase).values({ pieceId: held, note: "wrong flag" });
		const recent = await make(learner.id, "finished", day);
		const quiet = await make("quiet", "finished", day);
		const open = await make("quiet", "revising");
		// An abandoned piece's tape was kept for a case: it goes once the case is closed.
		const settled = await make(learner.id, "abandoned");
		await db.insert(sessionCase).values({ pieceId: settled, note: "wrong flag", status: "fixed" });
		const studied = await make(learner.id, "abandoned");
		await db.insert(sessionCase).values({ pieceId: studied, note: "wrong flag" });
		expect(await pruneTapes()).toBe(3);
		const left = new Set((await db.select({ id: pieceStep.pieceId }).from(pieceStep)).map((r) => r.id));
		expect(left.has(old) || left.has(quiet) || left.has(settled)).toBe(false);
		expect([held, recent, open, studied].every((id) => left.has(id))).toBe(true);
	});

	it("reads the notebook a page at a time, newest first, filtered on the server", async () => {
		const card = newCard(new Date(), "UTC");
		const total = NOTEBOOK_PAGE + 5;
		// One at a time, so each has its own (later) uuidv7.
		for (let i = 0; i < total; i++)
			await db.insert(note).values({
				userId: learner.id,
				language: "en",
				kind: i % 5 === 0 ? "collected" : "own",
				phrase: `phrase ${i}`,
				meaningLanguage: "zh-CN",
				fsrs: card,
				due: new Date(card.dueAt),
				deletedAt: i === 1 ? new Date() : null,
			});
		const first = await notebookPage(learner, "en", "all");
		expect(first.rows).toHaveLength(NOTEBOOK_PAGE);
		expect(first.rows[0].phrase).toBe(`phrase ${total - 1}`);
		expect(first.next).toBe(first.rows.at(-1)?.id);
		const second = await notebookPage(learner, "en", "all", first.next);
		// The rest, without the deleted one, and no more pages.
		expect(second.rows.map((n) => n.phrase)).toEqual(["phrase 4", "phrase 3", "phrase 2", "phrase 0"]);
		expect(second.next).toBeUndefined();
		const read = await notebookPage(learner, "en", "collected");
		expect(read.rows.every((n) => n.from === "collected")).toBe(true);
		expect(read.rows).toHaveLength(Math.ceil(total / 5));
		expect(await notebookGlance(learner, "en")).toEqual({ count: total - 1, latest: [104, 103, 102, 101].map((i) => `phrase ${i}`) });
	});

	it("abandons what nobody will finish, and keeps what was written", async () => {
		const day = 864e5;
		const old = new Date(Date.now() - 31 * day);
		const make = async (values: Partial<typeof piece.$inferInsert> = {}) => {
			const [p] = await db
				.insert(piece)
				.values({ userId: learner.id, language: "en", kind: "own", text: "My draft", tutorLanguage: "zh-CN", state: "revising", ...values })
				.returning({ id: piece.id });
			return p.id;
		};
		const snapshot = (pieceId: string, version = 1, updatedAt = new Date()) =>
			db.insert(pieceRevision).values({ pieceId, version, state: {}, updatedAt });
		const place = async (pieceId: string, completedAt: Date, said: boolean) => {
			const [e] = await db
				.insert(exchange)
				.values({ userId: learner.id, pieceId, expiresAt: completedAt, status: "abandoned", completionReason: "max_age", completedAt })
				.returning({ id: exchange.id });
			if (said) await db.insert(exchangeMessage).values({ exchangeId: e.id, role: "user", content: "Hi!" });
		};
		const stale = await make();
		await snapshot(stale, 1, old);
		await db.insert(pieceStep).values({ pieceId: stale, seq: 0, action: "create" });
		const outdated = await make();
		await snapshot(outdated, 0);
		const going = await make();
		await snapshot(going);
		const silent = await make({ kind: "scenario", state: "writing", text: "" });
		await place(silent, new Date(), false);
		const talked = await make({ kind: "scenario", state: "writing", text: "" });
		await place(talked, new Date(Date.now() - 2 * day), true);
		const longAgo = await make({ kind: "scenario", state: "writing", text: "", updatedAt: old });
		await place(longAgo, old, true);
		const sheet = await make({ kind: "translation", state: "writing", updatedAt: old });

		expect(await abandonStale()).toBe(5);
		const state = new Map((await db.select({ id: piece.id, state: piece.state, text: piece.text }).from(piece)).map((p) => [p.id, p]));
		for (const id of [stale, outdated, silent, longAgo, sheet]) expect(state.get(id)?.state).toBe("abandoned");
		for (const id of [going, talked]) expect(state.get(id)?.state).not.toBe("abandoned");
		// What was written stays; the revision and its tape go.
		expect(state.get(stale)?.text).toBe("My draft");
		expect(await db.select().from(pieceRevision).where(eq(pieceRevision.pieceId, stale))).toHaveLength(0);
		expect(await db.select().from(pieceStep).where(eq(pieceStep.pieceId, stale))).toHaveLength(0);
		expect(await db.select().from(exchangeMessage)).toHaveLength(2);
	});

	it("closes an expired place on the worker's sweep, a silent one's piece at once, and takes nothing more in it", async () => {
		const place = async (said: boolean) => {
			const [p] = await db
				.insert(piece)
				.values({ userId: learner.id, language: "en", kind: "scenario", text: "", tutorLanguage: "zh-CN", state: "writing" })
				.returning({ id: piece.id });
			const [e] = await db
				.insert(exchange)
				.values({ userId: learner.id, pieceId: p.id, expiresAt: new Date(Date.now() - 1000) })
				.returning({ id: exchange.id });
			if (said) await db.insert(exchangeMessage).values({ exchangeId: e.id, role: "user", content: "Hi!" });
			return { piece: p.id, exchange: e.id };
		};
		const silent = await place(false);
		const talked = await place(true);
		// Expired, not yet swept: nothing more is taken.
		await expect(submitMessage(talked.exchange, "Still there?", learner.id)).rejects.toThrow("not in progress");
		await new AgentReplyWorker({ onExpired: () => abandonStale() }).runOnce();
		const states = new Map((await db.select({ id: piece.id, state: piece.state }).from(piece)).map((p) => [p.id, p.state]));
		expect(states.get(silent.piece)).toBe("abandoned");
		expect(states.get(talked.piece)).toBe("writing");
		const closed = await db.select({ status: exchange.status }).from(exchange);
		expect(closed.map((e) => e.status)).toEqual(["abandoned", "abandoned"]);
	});

	it("abandons a piece only if it is still stale in its turn, and never while its revision is in use", async () => {
		const day = 864e5;
		// A revision the learner came back to: in memory, its snapshot still from a month ago until they change something.
		const back = await startRevision(learner, { text: "Back again", learner: "en", feedback: "native" }, { kind: "own", language: "en" });
		ids.add(back);
		await db
			.update(pieceRevision)
			.set({ updatedAt: new Date(Date.now() - 31 * day) })
			.where(eq(pieceRevision.pieceId, back));
		expect(await abandonStale()).toBe(0);
		expect((await db.select({ state: piece.state }).from(piece).where(eq(piece.id, back)))[0].state).toBe("revising");
		// Out of memory, a revision that opens is not abandoned for being unopenable; one that cannot is.
		const [p] = await db
			.insert(piece)
			.values({ userId: learner.id, language: "en", kind: "own", text: "Draft", tutorLanguage: "zh-CN", state: "revising" })
			.returning({ id: piece.id });
		await db.insert(pieceRevision).values({ pieceId: p.id, version: 1, state: {} });
		expect(await abandon(p.id)).toBe(false);
		await db.delete(pieceRevision).where(eq(pieceRevision.pieceId, p.id));
		expect(await abandon(p.id)).toBe(true);
	});

	it("takes an abandoned piece up again where it was before its revision", async () => {
		await importContent(db, content());
		const [own] = await db
			.insert(piece)
			.values({ userId: learner.id, language: "en", kind: "own", text: "My draft", tutorLanguage: "zh-CN", state: "abandoned" })
			.returning({ id: piece.id });
		ids.add(own.id);
		expect(await takeUp(learner, own.id)).toEqual({ to: `/live/${own.id}` });
		const [again] = await db.select().from(piece).where(eq(piece.id, own.id));
		expect(again.state).toBe("revising");
		expect(await db.select().from(pieceRevision).where(eq(pieceRevision.pieceId, own.id))).toHaveLength(1);

		const sheet = await sheetOf(learner, "menu", "en");
		if (!sheet) throw new Error("missing sheet");
		const sent = await saveSheet(learner, { scenarioId: "menu", language: "en", ...sheet.binding, text: "My soup", plan: "Keep it short" });
		if (!sent) throw new Error("not sent");
		expect((await db.select().from(piece).where(eq(piece.id, sent.id)))[0].background).toBe("Keep it short");
		await db.update(piece).set({ state: "abandoned" }).where(eq(piece.id, sent.id));
		expect(await takeUp(learner, sent.id)).toEqual({ to: "/scenario/menu/translate?lang=en" });
		expect((await sheetOf(learner, "menu", "en"))?.draft).toBe("My soup");
		// Not abandoned (any more): nothing to take up.
		expect(await takeUp(learner, sent.id)).toBeNull();

		const [silent] = await db
			.insert(piece)
			.values({ userId: learner.id, language: "en", kind: "scenario", scenarioId: "menu", text: "", tutorLanguage: "zh-CN", state: "abandoned" })
			.returning({ id: piece.id });
		// Nothing of theirs in its conversation: the scenario starts again.
		expect(await takeUp(learner, silent.id)).toEqual({ to: "/scenario/menu" });
	});

	it("gives every page a shelf of the same size however much was written, and My writing a page at a time", async () => {
		const day = 864e5;
		const total = PIECES_PAGE + 3;
		for (let i = 0; i < total; i++)
			await db.insert(piece).values({
				userId: learner.id,
				language: i % 10 === 0 ? "es" : "en",
				kind: "own",
				title: `piece ${i}`,
				text: "A draft.",
				tutorLanguage: "zh-CN",
				state: i === total - 1 ? "revising" : i === total - 2 ? "abandoned" : "finished",
				finishedAt: i >= total - 2 ? null : new Date(Date.now() - (total - i) * day),
				posted: i === total - 4 ? null : "yes",
			});
		const shelves = await shelvesOf(learner.id);
		const en = shelves.en;
		expect(en.open.map((w) => w.title)).toEqual([`piece ${total - 1}`]);
		// The six most recent, without the abandoned one.
		expect(en.recent).toHaveLength(6);
		expect(en.recent.some((w) => w.phase === "abandoned")).toBe(false);
		expect(en.followUp).toMatchObject({ kind: "posted", w: { title: `piece ${total - 4}` } });
		const finishedEn = Array.from({ length: total - 2 }, (_, i) => i).filter((i) => i % 10 !== 0).length;
		expect(en.finished).toBe(finishedEn);
		expect(shelves.es.recent.every((w) => w.lang === "es")).toBe(true);

		const enTotal = Array.from({ length: total }, (_, i) => i).filter((i) => i % 10 !== 0).length;
		const first = await piecesPage(learner.id, "en");
		expect(first.items).toHaveLength(Math.min(PIECES_PAGE, enTotal));
		const rest = first.next ? (await piecesPage(learner.id, "en", first.next)).items : [];
		expect(first.items.length + rest.length).toBe(enTotal);
		expect(new Set([...first.items, ...rest].map((w) => w.id)).size).toBe(enTotal);
	});

	it("lists the admin's accounts a page at a time, counted for that page, and sessions from a few fields of each step", async () => {
		await db.insert(user).values({ id: "other", email: "someone@example.test", name: "Someone" });
		const [p] = await db
			.insert(piece)
			.values({ userId: learner.id, language: "en", kind: "own", text: "A draft.", tutorLanguage: "zh-CN", state: "revising" })
			.returning({ id: piece.id });
		const step = (seq: number, action: string, body: unknown, response: unknown, ms = 500) => ({ pieceId: p.id, seq, action, body, response, ms });
		await db.insert(pieceStep).values([
			step(0, "overview", {}, { stops: [{}, {}, {}] }),
			step(1, "keep", { id: "s1" }, {}),
			step(2, "grade", { id: "s2" }, { pass: false }),
			step(3, "grade", { id: "s2" }, { pass: false }),
			step(4, "grade", { id: "s2" }, { pass: false }, 9500),
			// What the page sent, as it sent it: a stray value reads as not the learner's own, and never fails the list.
			step(5, "apply", { id: "s2", self: "maybe" }, {}),
			step(6, "end", {}, { issues: [{}] }),
		]);

		const page = await users({ q: "LEARNER@" });
		expect(page.total).toBe(1);
		expect(page.rows[0]).toMatchObject({ id: learner.id, pieces: 1, notes: 0 });
		expect((await users()).rows.map((u) => u.id).sort()).toEqual([learner.id, "other"].sort());
		// A search cannot be a pattern.
		expect((await users({ q: "%" })).total).toBe(0);

		const [row] = await sessions();
		expect(row.stops).toBe(3);
		expect(row.signals.map((x) => x.kind)).toEqual(["kept", "tries", "answer", "lost", "slow"]);
	});

	it("carries a suggestion into its draft, frees its place in the queue, and shows it made only once learners are offered it", async () => {
		const ask = (purpose: string, place: "other" | "email" = "other") =>
			suggest(learner.id, { place, language: "en", situation: "My landlord has not fixed the heater.", who: "my landlord", purpose });
		for (const n of [1, 2, 3, 4, 5]) expect(await ask(`Ask ${n}`)).toBe(true);
		expect(await ask("One too many")).toBe(false);
		const [first] = (await inbox()).suggestions.filter((x) => x.purpose === "Ask 1");
		expect(first).toMatchObject({ who: "my landlord", status: "pending" });
		// From elsewhere, it happens where the admin says.
		await expect(scenarioFromSuggestion(first.id, learner.id)).rejects.toThrow("Say where it happens.");
		const id = await scenarioFromSuggestion(first.id, learner.id, "email");
		const made = await adminScenario(id);
		expect(made).toMatchObject({ place: "email", status: "draft", from: { id: first.id, who: "my landlord" } });
		expect(made?.versions.en).toMatchObject({ title: "Ask 1", goals: ["Ask 1"], people: [{ who: "my landlord" }] });
		// A draft no longer holds a place among the five, but the learner sees it waiting until it is offered.
		expect(await ask("Ask 6", "email")).toBe(true);
		const mine = async () => (await suggestionsOf(learner.id)).find((x) => x.id === first.id);
		expect(await mine()).toMatchObject({ status: "pending", scenarioId: null });
		await db.update(scenario).set({ status: "published" }).where(eq(scenario.id, id));
		// Published, but its version in the learner's language is still hidden.
		expect(await mine()).toMatchObject({ status: "pending", scenarioId: null });
		const { draft: _, ...shown } = made?.versions.en ?? {};
		await db
			.update(scenario)
			.set({ versions: { en: shown } })
			.where(eq(scenario.id, id));
		expect(await mine()).toMatchObject({ status: "live", scenarioId: id });
		expect((await inbox()).suggestions.find((x) => x.id === first.id)?.scenario).toMatchObject({ id, published: true });
	});

	it("deletes owned dynamic prompts with the account and refuses records arriving after deletion", async () => {
		await writeRecord({ userId: learner.id, keepText: true }, call);
		expect(await db.select().from(llmPrompt)).toHaveLength(1);
		await db.delete(user).where(eq(user.id, learner.id));
		expect(await db.select().from(llmPrompt)).toHaveLength(0);
		expect(await db.select().from(llmCall)).toHaveLength(0);
		await writeRecord({ userId: learner.id, keepText: true }, call);
		expect(await db.select().from(llmPrompt)).toHaveLength(0);
	});

	it("prunes unreferenced prompts and respects the current opt-out, not a captured setting", async () => {
		await writeRecord({ userId: learner.id, keepText: true }, call);
		await pruneCalls(new Date(Date.now() + 31 * 864e5));
		expect(await db.select().from(llmPrompt)).toHaveLength(0);
		await db.update(user).set({ helpImprove: false }).where(eq(user.id, learner.id));
		await writeRecord({ userId: learner.id, keepText: true }, call);
		const [record] = await db.select().from(llmCall);
		expect(record).toMatchObject({ messages: null, output: null, promptHash: null });
		expect(await db.select().from(llmPrompt)).toHaveLength(0);
	});

	it("never prunes a prompt a record is being written with", async () => {
		// A prompt whose calls are gone, about to be named again.
		await writeRecord({ userId: learner.id, keepText: true }, call);
		await db.delete(llmCall);
		const [p] = await db
			.insert(piece)
			.values({ userId: learner.id, language: "en", kind: "own", text: "A draft.", tutorLanguage: "zh-CN", state: "revising" })
			.returning({ id: piece.id });
		// The piece held locked stops the record at its call's foreign key, after it has seen to its prompt.
		let release!: () => void;
		const holding = sql.begin(async (tx) => {
			await tx`select 1 from piece where id = ${p.id} for update`;
			await new Promise<void>((r) => {
				release = r;
			});
		});
		await vi.waitFor(() => expect(release).toBeTypeOf("function"));
		const writing = writeRecord({ userId: learner.id, pieceId: p.id, keepText: true }, call);
		await vi.waitFor(async () => {
			const [{ n }] = await admin`select count(*)::int as n from pg_stat_activity where datname = ${config.name} and wait_event_type = 'Lock'`;
			expect(n).toBe(1);
		});
		await pruneCalls();
		release();
		await holding;
		await writing;
		expect(await db.select({ hash: llmCall.promptHash }).from(llmCall)).toHaveLength(1);
		expect(await db.select().from(llmPrompt)).toHaveLength(1);
		// Once nothing is writing with it and nothing names it, it goes.
		await pruneCalls(new Date(Date.now() + 31 * 864e5));
		expect(await db.select().from(llmPrompt)).toHaveLength(0);
	});

	it("a held caller sees a newly added key, then a replacement key/model", async () => {
		const ai = await learnerCaller({ user: learner });
		await expect(chat([], { ai, tag: "test" })).rejects.toMatchObject({ kind: "nokey" });
		await db.insert(userKey).values({ userId: learner.id, provider: "openrouter", model: "first", encryptedKey: encryptKey("first-secret") });
		await chat([], { ai: ai.for("first"), tag: "test" });
		await db
			.update(userKey)
			.set({ model: "second", encryptedKey: encryptKey("second-secret") })
			.where(eq(userKey.userId, learner.id));
		await chat([], { ai: ai.ahead("second"), tag: "test" });
		expect(config.send.mock.calls.map(([route]) => ({ model: route.model, key: route.apiKey }))).toEqual([
			{ model: "first", key: "first-secret" },
			{ model: "second", key: "second-secret" },
		]);
		await vi.waitFor(async () => expect(await db.select().from(llmCall)).toHaveLength(2));
	});

	it("pins a draft's source and original through imports, remakes, withdrawal and a change of native language", async () => {
		await importContent(db, content());
		const sheet = await sheetOf(learner, "menu", "en");
		expect(sheet).not.toBeNull();
		if (!sheet) throw new Error("missing sheet");
		const saved = await saveSheet(learner, { scenarioId: "menu", language: sheet.language, ...sheet.binding, text: "My soup" });
		if (!saved) throw new Error("missing draft");
		await importContent(db, content("Cake", "蛋糕"));
		await db.update(scenario).set({ status: "withdrawn" });
		const reopened = await sheetOf({ ...learner, nativeLanguage: "ja" }, "menu", "en");
		expect(reopened?.language).toBe("en");
		// Each language is written on its own: Spanish has nothing open, and the scenario is no longer offered.
		expect(await sheetOf(learner, "menu", "es")).toBeNull();
		expect(reopened?.scenario.situation).toMatchObject({ source: "汤", sourceLang: "zh-CN" });
		expect((await translationFor(learner.id, saved.id))?.translation).toMatchObject({ original: "Soup", source: "汤", target: "en" });
		await expect(saveSheet(learner, { scenarioId: "menu", language: "es", ...sheet.binding, text: "Do not overwrite" })).rejects.toMatchObject({
			status: 409,
		});
		expect((await db.select().from(piece))[0].text).toBe("My soup");
	});

	it("counts a scenario's progress in each language on its own, and keeps one unfinished piece per language", async () => {
		const seed = JSON.parse(readFileSync("lab/seed/scenarios.json", "utf8"));
		const thanks = seed.scenarios.find((x: { id: string }) => x.id === "imessage-thanks");
		await importContent(db, { version: 1, scenarios: [{ ...thanks, versions: { en: thanks.versions.en, es: thanks.versions.en } }] });
		const u = { ...learner, name: "Learner" };
		const settingIn = async (language: string) => {
			const [row] = await db.select().from(scenario).where(eq(scenario.id, "imessage-thanks"));
			const s = settingFrom(row, language);
			if (!s) throw new Error(`no ${language} setting`);
			return s;
		};
		// Entering in English twice at once (two tabs), then in Spanish: two pieces, each in its language; entering again finds each.
		const inEn = await settingIn("en");
		const [en, twice] = await Promise.all([openExchange(u, inEn), openExchange(u, inEn)]);
		expect(twice).toEqual(en);
		const es = await openExchange(u, await settingIn("es"));
		expect(es.pieceId).not.toBe(en.pieceId);
		expect(await openExchange(u, await settingIn("en"))).toEqual(en);
		const langs = new Map((await db.select({ id: piece.id, language: piece.language }).from(piece)).map((p) => [p.id, p.language]));
		expect([langs.get(en.pieceId), langs.get(es.pieceId)]).toEqual(["en", "es"]);
		// A second unfinished piece in one language is refused by the database itself.
		await expect(
			db.insert(piece).values({
				userId: learner.id,
				language: "en",
				kind: "scenario",
				scenarioId: "imessage-thanks",
				text: "",
				tutorLanguage: "zh-CN",
				state: "writing",
			}),
		).rejects.toMatchObject({ cause: { code: "23505" } });
		// Finished in English: written there, still open in Spanish.
		await db.update(piece).set({ state: "finished", finishedAt: new Date() }).where(eq(piece.id, en.pieceId));
		expect(await scenarioViewOf(learner, "imessage-thanks", "en")).toMatchObject({ state: "written", writtenPiece: en.pieceId });
		const inSpanish = await scenarioViewOf(learner, "imessage-thanks", "es");
		expect(inSpanish).toMatchObject({ state: "open", openPiece: es.pieceId });
		expect(inSpanish).not.toHaveProperty("writtenPiece");
		// The after page reads the exchange of the language asked for.
		await db.update(exchange).set({ status: "completed", completedAt: new Date() });
		expect((await afterOf(u, "imessage-thanks", "es"))?.pieceId).toBe(es.pieceId);
		expect(await afterOf(u, "imessage-thanks", "en")).toBeNull();
	});

	it("records collecting with its reading, shows it to the admin while the learner helps improve Libiamo, and never names another's reading", async () => {
		await db.insert(user).values({ id: "other", email: "someone@example.test", name: "Someone" });
		const theirs = await addReading("other", "Their text.", "en");
		// A reading id from someone else is never theirs to record under or to file into.
		expect(await ownReading(learner.id, theirs)).toBeNull();
		const readingId = await readingFor(learner.id, { id: theirs, text: "It was late, so I took the long way round.\nThen home.", language: "en" });
		expect(readingId).not.toBe(theirs);
		expect(await readingFor(learner.id, { id: readingId, text: "ignored", language: "en" })).toBe(readingId);

		await writeRecord(
			{ userId: learner.id, readingId, keepText: true },
			{
				...call,
				tag: "collect/explain",
				messages: [{ role: "user", content: 'Highlights:\n1. "the long way round"\n\nFor each highlight' }],
				output: '{"items":[{"n":1,"phrase":"take the long way round","meaning":"绕远路","why":"w","example":"e"}]}',
			},
		);
		await fileCollected(learner, { id: readingId, text: "", language: "en", tutorLanguage: "zh-CN" }, [
			{
				phrase: "take the long way round",
				meaning: "绕远路",
				register: "neutral",
				why: "w",
				example: "e",
				marked: "the long way round",
				sentence: "It was late, so I took the long way round.",
			},
		]);
		const row = (await sessions()).find((s) => s.id === readingId);
		expect(row).toMatchObject({ kind: "collect", title: "It was late, so I took the long way round.", stops: 1, calls: 1, callsKept: true });
		const view = await sessionOf(readingId);
		expect(view?.steps.map((s) => s.label)).toEqual(["Pasted", "Highlighted 1", "In the notebook"]);
		expect(view?.steps[1]).toMatchObject({
			calls: [1],
			lines: [
				{ who: "me", text: "the long way round" },
				{ who: "tutor", text: "take the long way round: 绕远路\n\nw\n\ne" },
			],
		});

		// A learner who stops helping improve Libiamo is no longer shown.
		await db.update(user).set({ helpImprove: false }).where(eq(user.id, learner.id));
		expect((await sessions()).some((s) => s.id === readingId)).toBe(false);
		expect(await sessionOf(readingId)).toBeNull();
	});

	it("marks again what was collected from a reading, and never keeps the same words twice", async () => {
		const passage = "I walked home. It was late, so I took the long way round.";
		const item = (marked: string, sentence: string) => ({
			phrase: marked,
			meaning: "m",
			register: "neutral" as const,
			why: "",
			example: "",
			marked,
			sentence,
		});
		const r = { text: passage, language: "en", tutorLanguage: "zh-CN" };
		const first = await fileCollected(learner, r, [item("the long way round", "It was late, so I took the long way round.")]);
		// The same words again (another tab, a later visit) and a new phrase: one entry each, the first one's id again.
		const again = await fileCollected(learner, { ...r, id: first.readingId }, [
			item("the long way round", "It was late, so I took the long way round."),
			item("walked home", "I walked home. "),
		]);
		expect(again.readingId).toBe(first.readingId);
		expect(again.ids[0]).toBe(first.ids[0]);
		expect(await db.select().from(note)).toHaveLength(2);
		const opened = await readingOf(learner.id, first.readingId);
		expect(opened?.kept.map((k) => [k.marked, k.sentence])).toEqual([
			["the long way round", "It was late, so I took the long way round."],
			["walked home", "I walked home. "],
		]);
		// Undone, it is no longer kept, and can be collected again as a new entry.
		await db.update(note).set({ deletedAt: new Date() }).where(eq(note.id, first.ids[0]));
		expect((await readingOf(learner.id, first.readingId))?.kept).toHaveLength(1);
		const back = await fileCollected(learner, { ...r, id: first.readingId }, [
			item("the long way round", "It was late, so I took the long way round."),
		]);
		expect(back.ids[0]).not.toBe(first.ids[0]);
		// Another learner's reading is not theirs to open.
		expect(await readingOf("other", first.readingId)).toBeNull();
	});

	it("refuses a first save if its displayed source was replaced", async () => {
		await importContent(db, content());
		const sheet = await sheetOf(learner, "menu", "en");
		if (!sheet) throw new Error("missing sheet");
		await importContent(db, content("Cake", "蛋糕"));
		await expect(saveSheet(learner, { scenarioId: "menu", language: "en", ...sheet.binding, text: "Old answer" })).rejects.toMatchObject({
			status: 409,
		});
		expect(await db.select().from(piece)).toHaveLength(0);
	});

	it("hides stale checked sources and requeues only changed content", async () => {
		await importContent(db, content());
		expect(await queueSources("menu", { natives: ["zh-CN"] })).toBe(0);
		await db.update(scenario).set({ versions: { en: { ...version, original: "Cake" } } });
		expect(await scenarioViewOf(learner, "menu", "en")).toBeNull();
		expect(await queueSources("menu", { natives: ["zh-CN"] })).toBe(1);
		const [source] = await db.select().from(scenarioSource);
		expect(source.state).toBe("pending");
		expect(source.inputHash).toBe(sourceIdentity({ ...version, original: "Cake" }, null));
	});

	it("a superseded generator cannot consume a new request for the same original", async () => {
		await importContent(db, content());
		await queueSources("menu", { natives: ["zh-CN"], again: true });
		const [source] = await db.select().from(scenarioSource);
		let release = (_: { title: string; source: string[]; glossary: [] }) => {};
		config.makeSource.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const making = makeSourceRow(source.id, new Caller({ route: null }));
		await vi.waitFor(() => expect(config.makeSource).toHaveBeenCalledOnce());
		await queueSources("menu", { natives: ["zh-CN"], again: true });
		release({ title: "old", source: ["old source"], glossary: [] });
		await making;
		const [after] = await db.select().from(scenarioSource);
		expect(after.state).toBe("pending");
		expect(after.generation).not.toBe(source.generation);
		expect(after.text).not.toBe("old source");
		await makeSourceRow(source.id, new Caller({ route: null }));
		expect((await db.select().from(scenarioSource))[0]).toMatchObject({ state: "checked", text: "汤", generation: after.generation });
	});

	describe("starting a revision (POST /api/s)", () => {
		const post = async (body: unknown) => {
			const r = await startPost({ request: new Request("http://test/api/s", { method: "POST", body: JSON.stringify(body) }) } as never);
			const json = await r.json();
			if (typeof json.id === "string") ids.add(json.id);
			return { status: r.status, json };
		};
		const resume = async (id: string) =>
			(await (await actionPost({ params: { id, action: "resume" }, request: new Request("http://test", { method: "POST" }) } as never)).json()).setup;
		const prefs = { learner: "zh-CN", feedback: "native" };

		it("opens the learner's own draft with the setup a reload gets", async () => {
			const made = await post({ ...prefs, text: "I goes to the shop yesterday.", background: "For my teacher", lang: "es" });
			expect(made.status).toBe(200);
			expect(made.json.setup).toMatchObject({ text: "I goes to the shop yesterday.", background: "For my teacher", lang: "es", learner: "zh-CN" });
			expect(made.json.setup.scenario).toBeUndefined();
			expect(await resume(made.json.id)).toEqual(made.json.setup);
		});

		it("opens a translation from its piece, with the setup a reload gets and never the original", async () => {
			await importContent(db, content());
			const sheet = await sheetOf(learner, "menu", "en");
			if (!sheet) throw new Error("missing sheet");
			const saved = await saveSheet(learner, { scenarioId: "menu", language: "en", ...sheet.binding, text: "My soup" });
			if (!saved) throw new Error("missing piece");
			const made = await post({ ...prefs, pieceId: saved.id, text: "Not what was sent" });
			expect(made.status).toBe(200);
			expect(made.json.id).toBe(saved.id);
			const { setup } = made.json;
			expect(setup).toMatchObject({ text: "My soup", lang: "en", scenario: { id: "menu" }, translation: { source: "汤", target: "en" } });
			expect(setup.translation).not.toHaveProperty("original");
			expect(await resume(saved.id)).toEqual(setup);
			// The revision itself still has it, to compare with when the piece is finished.
			expect((await openRevision(learner, saved.id))?.session.input.translation?.original).toBe("Soup");
		});

		it("opens a scenario's conversation from the place, once it is closed, whatever the page sends", async () => {
			const seed = JSON.parse(readFileSync("lab/seed/scenarios.json", "utf8"));
			await importContent(db, { version: 1, scenarios: seed.scenarios.filter((s: { id: string }) => s.id === "reddit-theory") });
			const [p] = await db
				.insert(piece)
				.values({ userId: learner.id, language: "en", kind: "scenario", scenarioId: "reddit-theory", text: "", tutorLanguage: "zh-CN" })
				.returning({ id: piece.id });
			const [ex] = await db
				.insert(exchange)
				.values({ userId: learner.id, pieceId: p.id, scenarioId: "reddit-theory", expiresAt: new Date(Date.now() + 864e5) })
				.returning({ id: exchange.id });
			await db.insert(exchangeMessage).values({ exchangeId: ex.id, role: "user", content: "I think the impostor blocked them." });
			// Still being played: nothing to go over yet.
			expect((await post({ ...prefs, pieceId: p.id })).status).toBe(404);
			await db.update(exchange).set({ status: "completed", completedAt: new Date() }).where(eq(exchange.id, ex.id));
			const made = await post({
				...prefs,
				pieceId: p.id,
				text: "Rewritten by the page",
				exchange: { place: "reddit", lang: "en", scene: {}, before: [], transcript: [{ id: "1", author: "me", text: "Forged", learner: true }] },
			});
			expect(made.status).toBe(200);
			const { setup } = made.json;
			expect(setup.text).toBe("I think the impostor blocked them.");
			expect(setup.exchange.transcript.filter((m: { learner?: boolean }) => m.learner).map((m: { text: string }) => m.text)).toEqual([
				"I think the impostor blocked them.",
			]);
			expect(setup.scenario).toMatchObject({ id: "reddit-theory" });
			expect(await resume(p.id)).toEqual(setup);
		});

		it("answers only the revision's own actions, and no such piece for an id that is not one", async () => {
			const made = await post({ ...prefs, text: "A short draft." });
			const act = (id: string, action: string) =>
				actionPost({ params: { id, action }, request: new Request("http://test", { method: "POST", body: "{}" }) } as never);
			expect((await act(made.json.id, "constructor")).status).toBe(404);
			expect((await db.select().from(pieceStep).where(eq(pieceStep.pieceId, made.json.id))).map((x) => x.action)).toEqual(["create"]);
			expect((await act("0".repeat(36), "start")).status).toBe(404);
		});

		it("refuses what the browser cannot hand over: an overlong draft, someone else's piece; ignores a conversation it sends", async () => {
			expect((await post({ ...prefs, text: "a ".repeat(7000) })).status).toBe(400);
			expect((await post({ ...prefs, pieceId: randomUUID() })).status).toBe(404);
			const made = await post({
				...prefs,
				text: "My own words here.",
				scenario: { id: "made-up", title: "Fake", site: "Reddit" },
				translation: { source: "x", original: "y", target: "en" },
			});
			expect(made.status).toBe(200);
			const [row] = await db.select().from(piece).where(eq(piece.id, made.json.id));
			expect(row).toMatchObject({ kind: "own", scenarioId: null });
			expect(made.json.setup.translation).toBeUndefined();
		});
	});

	it("earns each half of a day once, and leaves the day's row alone when it has that half already", async () => {
		const at = new Date();
		const version = async () => (await sql`select xmin::text as v from practice_day where user_id = ${learner.id}`)[0]?.v;
		expect(await credit(db, learner, "reviewed", "en", at)).toBe(true);
		const first = await version();
		expect(await credit(db, learner, "reviewed", "en", at)).toBe(false);
		expect(await version()).toBe(first);
		// The other half is still earned, on the same row.
		expect(await credit(db, learner, "learned", "en", at)).toBe(true);
		expect(await version()).not.toBe(first);
	});

	it("finds the reviews done only when there is something in the notebook and none of it is waiting", async () => {
		const now = new Date();
		// Nothing collected yet: nothing has been reviewed by looking.
		expect(await reviewsDone(db, learner.id, "en", now)).toBe(false);
		// But learning something then is the whole day: there is nothing it could have reviewed.
		expect(await credit(db, learner, "learned", "en", now)).toBe(true);
		expect((await db.select().from(practiceDay).where(eq(practiceDay.userId, learner.id)))[0]).toMatchObject({
			learnedAt: now,
			reviewedAt: now,
		});
		const [card] = await db
			.insert(note)
			.values({
				userId: learner.id,
				language: "en",
				kind: "collected",
				phrase: "hello",
				meaning: "你好",
				meaningLanguage: "zh-CN",
				fsrs: newCard(now, "UTC"),
				due: new Date(now.getTime() + 864e5),
			})
			.returning();
		// A new note waits until the next local day: today's reviews are done.
		expect(await reviewsDone(db, learner.id, "en", now)).toBe(true);
		// Another language's notebook is its own.
		expect(await reviewsDone(db, learner.id, "es", now)).toBe(false);
		await db.update(note).set({ due: now }).where(eq(note.id, card.id));
		expect(await reviewsDone(db, learner.id, "en", now)).toBe(false);
	});

	it("retired revision callbacks cannot overwrite a replacement or recreate a deleted snapshot", async () => {
		const id = await startRevision(learner, { text: "First", learner: "en", feedback: "native" }, { kind: "own", language: "en" });
		ids.add(id);
		const first = await openRevision(learner, id);
		if (!first) throw new Error("missing revision");
		const late = first.session.onChange;
		await startRevision(learner, { text: "Second", learner: "en", feedback: "native" }, { kind: "own", language: "en", pieceId: id });
		late();
		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect((await db.select().from(pieceRevision))[0].state).toMatchObject({ input: { text: "Second" } });
		const second = await openRevision(learner, id);
		if (!second) throw new Error("missing replacement");
		const afterDrop = second.session.onChange;
		await dropRevision(id);
		afterDrop();
		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect(await db.select().from(pieceRevision)).toHaveLength(0);
	});

	it("does not acknowledge or leave a tape step when its snapshot transaction fails", async () => {
		const id = await startRevision(learner, { text: "Initial", learner: "en", feedback: "native" }, { kind: "own", language: "en" });
		ids.add(id);
		const h = await openRevision(learner, id);
		if (!h) throw new Error("missing revision");
		await sql.unsafe(
			`CREATE FUNCTION fail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'snapshot failure'; END $$; CREATE TRIGGER fail_snapshot BEFORE UPDATE ON piece_revision FOR EACH ROW EXECUTE FUNCTION fail_snapshot();`,
		);
		try {
			await expect(
				act(id, h, "test", {}, async (s) => {
					s.input.text = "Changed";
					return {};
				}),
			).rejects.toThrow();
			expect((await db.select().from(pieceStep)).map((s) => s.action)).toEqual(["create"]);
			expect((await db.select().from(pieceRevision))[0].state).toMatchObject({ input: { text: "Initial" } });
		} finally {
			await sql.unsafe("DROP TRIGGER fail_snapshot ON piece_revision; DROP FUNCTION fail_snapshot();");
		}
		await expect(act(id, h, "test", {}, async () => ({}))).rejects.toThrow("replaced");
		const reopened = await openRevision(learner, id);
		if (!reopened) throw new Error("missing durable revision");
		expect(reopened.session.input.text).toBe("Initial");
		await act(id, reopened, "test", {}, async () => ({}));
		expect((await db.select().from(pieceRevision))[0].state).toMatchObject({ input: { text: "Initial" } });
		expect(await db.select().from(pieceStep)).toHaveLength(2);
	});

	it("serializes concurrent actions on one revision", async () => {
		const id = await startRevision(learner, { text: "Initial", learner: "en", feedback: "native" }, { kind: "own", language: "en" });
		ids.add(id);
		const h = await openRevision(learner, id);
		if (!h) throw new Error("missing revision");
		const seen: string[] = [];
		await Promise.all([
			act(id, h, "first", {}, async () => {
				seen.push("first starts");
				await new Promise((r) => setTimeout(r, 20));
				seen.push("first ends");
			}),
			act(id, h, "second", {}, async () => {
				seen.push("second");
			}),
		]);
		expect(seen).toEqual(["first starts", "first ends", "second"]);
	});

	it("answers a reload and the bookmark at once while an action waits on the model", async () => {
		const id = await startRevision(learner, { text: "Initial", learner: "en", feedback: "native" }, { kind: "own", language: "en" });
		ids.add(id);
		const h = await openRevision(learner, id);
		if (!h) throw new Error("missing revision");
		let release = () => {};
		let calling = () => {};
		const called = new Promise<void>((r) => (calling = r));
		const waiting = act(id, h, "slow", {}, () => {
			calling();
			return new Promise<object>((r) => (release = () => r({})));
		});
		// The action has its turn and is waiting on the model (before that, it waits on the piece's queue and the key).
		await called;
		const post = (action: string, body?: object) =>
			actionPost({ params: { id, action }, request: new Request("http://test", { method: "POST", body: JSON.stringify(body ?? {}) }) } as never);
		const soon = <T>(p: Promise<T>) => Promise.race([p, new Promise<"waited">((r) => setTimeout(() => r("waited"), 500))]);
		try {
			const resumed = await soon(post("resume"));
			expect(resumed).not.toBe("waited");
			expect(await (resumed as Response).json()).toMatchObject({ setup: { text: "Initial" } });
			const marked = await soon(post("progress", { phase: 1, answers: [] }));
			expect(marked).not.toBe("waited");
			expect((marked as Response).status).toBe(200);
		} finally {
			release();
			await waiting;
		}
	});

	it("puts a deleted learner's revisions away unwritten, and shutdown writes the others whatever fails", async () => {
		await db.insert(user).values([
			{ id: "gone", email: "gone@example.test", name: "Gone" },
			{ id: "vanished", email: "vanished@example.test", name: "Vanished" },
		]);
		const as = (id: string) => ({ ...learner, id });
		const start = (who: string) => startRevision(as(who), { text: `By ${who}`, learner: "en", feedback: "native" }, { kind: "own", language: "en" });
		const [gone, vanished, kept] = [await start("gone"), await start("vanished"), await start(learner.id)];
		for (const id of [gone, vanished, kept]) ids.add(id);
		// Deleting an account puts its revisions away first.
		await deleteUser("gone");
		expect(heldRevision(gone, "gone")).toBeNull();
		// A piece deleted some other way leaves its revision with nowhere to write.
		const lost = heldRevision(vanished, "vanished");
		await db.delete(user).where(eq(user.id, "vanished"));
		const mine = heldRevision(kept, learner.id);
		if (!lost || !mine) throw new Error("missing revision");
		mine.session.input.text = "Changed before shutdown";
		await expect(flushRevisions()).resolves.toBeUndefined();
		expect((await db.select().from(pieceRevision).where(eq(pieceRevision.pieceId, kept)))[0].state).toMatchObject({
			input: { text: "Changed before shutdown" },
		});
		// Idle, it leaves memory even though its snapshot cannot be written.
		await putAwayIdle(Date.now() + 31 * 60_000);
		expect(heldRevision(vanished, "vanished")).toBeNull();
		expect(heldRevision(kept, learner.id)).toBeNull();
	});

	it("retries a rating with the same request id without advancing FSRS or logging twice", async () => {
		const now = new Date();
		const [card] = await db
			.insert(note)
			.values({
				userId: learner.id,
				language: "en",
				kind: "collected",
				phrase: "hello",
				meaning: "你好",
				meaningLanguage: "zh-CN",
				examples: [],
				fsrs: newCard(new Date(now.getTime() - 2 * 864e5), "UTC"),
				due: now,
			})
			.returning();
		const requestId = randomUUID();
		const first = await rateNote(learner, card.id, "good", "exact", 1, now, requestId);
		const again = await rateNote(learner, card.id, "good", "exact", 1, now, requestId);
		expect(again).toEqual(first);
		expect(
			await db
				.select()
				.from(reviewLog)
				.where(and(eq(reviewLog.noteId, card.id), eq(reviewLog.requestId, requestId))),
		).toHaveLength(1);
		await rateNote(learner, card.id, "good", "exact", 1, now, randomUUID());
		expect((await rateNote(learner, card.id, "good", "exact", 1, now, requestId)).queue).toBe("review");
		expect(await db.select().from(reviewLog).where(eq(reviewLog.noteId, card.id))).toHaveLength(2);
	});
});
