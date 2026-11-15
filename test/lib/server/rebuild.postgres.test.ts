import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
}));
vi.mock("$app/env", () => ({ building: true }));
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
vi.mock("#lib/server/translation/source.ts", () => ({
	extractTerms: async () => [],
	makeSource: config.makeSource,
	checkSource: async () => ({ issues: [] }),
	repairSource: async () => [],
}));

import { encryptKey } from "#lib/server/account/key.ts";
import { db, sql } from "#lib/server/db/index.ts";
import {
	llmCall,
	llmPrompt,
	note,
	piece,
	pieceRevision,
	pieceStep,
	reviewLog,
	scenario,
	scenarioSource,
	user,
	userKey,
} from "#lib/server/db/schema.ts";
import { Caller, type CallRecord, chat } from "#lib/server/llm/caller.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import { pruneCalls, writeRecord } from "#lib/server/llm/records.ts";
import { rateNote } from "#lib/server/notebook/notes.ts";
import { newCard } from "#lib/server/review/scheduler.ts";
import { act, dropRevision, openRevision, startRevision } from "#lib/server/revision/store.ts";
import { importContent } from "#lib/server/scenario/content.ts";
import { scenarioViewOf } from "#lib/server/scenario/scenarios.ts";
import { sourceIdentity } from "#lib/server/translation/identity.ts";
import { makeSourceRow, queueSources } from "#lib/server/translation/runner.ts";
import { saveSheet, sheetOf, translationFor } from "#lib/server/translation/sheet.ts";

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
		await sql.unsafe(readFileSync("drizzle/0000_init.sql", "utf8"));
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

	it("pins a draft's source, original and language through imports, remakes, withdrawal and account language changes", async () => {
		await importContent(db, content());
		const sheet = await sheetOf(learner, "menu", "en");
		expect(sheet).not.toBeNull();
		if (!sheet) throw new Error("missing sheet");
		const saved = await saveSheet(learner, { scenarioId: "menu", language: sheet.language, ...sheet.binding, text: "My soup" });
		if (!saved) throw new Error("missing draft");
		await importContent(db, content("Cake", "蛋糕"));
		await db.update(scenario).set({ status: "withdrawn" });
		const reopened = await sheetOf({ ...learner, nativeLanguage: "ja" }, "menu", "es");
		expect(reopened?.language).toBe("en");
		expect(reopened?.scenario.situation).toMatchObject({ source: "汤", sourceLang: "zh-CN" });
		expect((await translationFor(learner.id, saved.id))?.translation).toMatchObject({ original: "Soup", source: "汤", target: "en" });
		await expect(saveSheet(learner, { scenarioId: "menu", language: "es", ...sheet.binding, text: "Do not overwrite" })).rejects.toMatchObject({
			status: 409,
		});
		expect((await db.select().from(piece))[0].text).toBe("My soup");
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
