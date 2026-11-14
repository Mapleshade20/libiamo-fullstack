import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { APP_LANGS } from "#lib/constants.ts";
import type { TranslationVersion } from "#lib/scenario/versions.ts";
import { db } from "#lib/server/db/index.ts";
import { scenario, scenarioSource } from "#lib/server/db/schema.ts";
import type { Caller } from "#lib/server/llm/caller.ts";
import { serviceCaller } from "#lib/server/llm/callers.ts";
import type { Lang } from "#lib/server/revision/draft.ts";
import { unitsOf } from "#lib/translation/blocks.ts";
import { building } from "$app/env";
import { checkSource, extractTerms, makeSource, repairSource, type Term } from "./source.ts";
import { confirmedNamesOf } from "./tables.ts";

/*
 * Making a translation scenario's sources (design §6.4). Publishing queues a `pending` source for each learner language;
 * a runner in the server process makes them one at a time on the service's key: the terms, the source written from the
 * original's points (names as the work's confirmed table says), a blind back-translation and drift check, one repair
 * and a second check. A source with nothing left is `checked` and offered; one with drift left is `notes` for the
 * admin, with what the check still finds; one that could not be made is `failed`. Pending rows left by a restart are
 * picked up again.
 */
const SWEEP_MS = 30_000;

/** A paragraph as the model wrote it, without the "[2] " the prompt numbers them with. */
const unnumbered = (p: string) => p.replace(/^\s*\[\d+\]\s*/, "").trim();

export const hashOf = (original: string) => createHash("sha256").update(original).digest("hex").slice(0, 32);

/**
 * The names and terms a reader of the original needs: what the model finds, with every term the scenario says the source
 * must give.
 */
async function termsFor(v: TranslationVersion, language: Lang, ai: Caller): Promise<Term[]> {
	const found = await extractTerms(v.original, language, `${v.where}, read by ${v.readers}`, ai);
	const given = v.terms.filter((t) => !found.some((f) => f.term === t)).map((term): Term => ({ term, kind: "term", note: "" }));
	return [...found, ...given];
}

/** Makes one source and leaves it checked, with notes, or failed. */
export async function makeSourceRow(id: string, ai: Caller = serviceCaller()) {
	const [row] = await db
		.select({ src: scenarioSource, s: scenario })
		.from(scenarioSource)
		.innerJoin(scenario, eq(scenario.id, scenarioSource.scenarioId))
		.where(eq(scenarioSource.id, id));
	if (!row) return;
	const target = row.src.language as Lang;
	const native = row.src.native as Lang;
	const v = (row.s.versions as Record<string, TranslationVersion>)[target];
	try {
		if (!v) throw new Error(`no ${target} version`);
		const { units: original, join } = unitsOf(v.original);
		const context = `${v.where}, read by ${v.readers}`;
		const terms = await termsFor(v, target, ai);
		const names = await confirmedNamesOf(row.s.workId, native);
		const made = await makeSource(original, terms, target, native, context, ai, names);
		let source = made.source.map(unnumbered);
		const first = await checkSource(original, source, terms, target, native, ai);
		let left = first.issues;
		if (left.length) {
			source = (await repairSource(original, source, left, target, native, ai)).map(unnumbered);
			left = (await checkSource(original, source, terms, target, native, ai)).issues;
		}
		await db
			.update(scenarioSource)
			.set({
				title: made.title,
				text: source.join(join),
				glossary: made.glossary,
				state: left.length ? "notes" : "checked",
				notes: left.length ? { issues: left, found: first.issues } : null,
				originalHash: hashOf(v.original),
				madeAt: new Date(),
			})
			.where(and(eq(scenarioSource.id, id), eq(scenarioSource.state, "pending")));
	} catch (e) {
		console.error(`translation source ${row.s.id} ${target}←${native} failed:`, e);
		await db
			.update(scenarioSource)
			.set({ state: "failed", notes: { error: String((e as Error)?.message ?? e) }, madeAt: new Date() })
			.where(and(eq(scenarioSource.id, id), eq(scenarioSource.state, "pending")));
	}
}

/**
 * Queues a source for each learner language for each version of a translation scenario (publishing does this). A
 * language whose source is already there is left alone; `again` queues those too (the original changed).
 */
export async function queueSources(scenarioId: string, opts: { natives?: readonly string[]; again?: boolean } = {}) {
	const [s] = await db.select().from(scenario).where(eq(scenario.id, scenarioId));
	if (s?.kind !== "translation") return 0;
	const rows = Object.keys(s.versions as Record<string, unknown>).flatMap((language) =>
		(opts.natives ?? APP_LANGS).filter((native) => native !== language).map((native) => ({ scenarioId, language, native, state: "pending" })),
	);
	if (!rows.length) return 0;
	const q = db.insert(scenarioSource).values(rows);
	const done = opts.again
		? await q
				.onConflictDoUpdate({
					target: [scenarioSource.scenarioId, scenarioSource.language, scenarioSource.native],
					set: { state: "pending", notes: null },
				})
				.returning({ id: scenarioSource.id })
		: await q.onConflictDoNothing().returning({ id: scenarioSource.id });
	kick();
	return done.length;
}

let running: Promise<void> | null = null;

/** Makes every pending source, one after another; a second call while it runs waits for the same run. */
export function sweepSources(): Promise<void> {
	running ??= sweep().finally(() => {
		running = null;
	});
	return running;
}

async function sweep() {
	// Without the service's key nothing could be made: the rows wait for it rather than fail.
	if (!serviceCaller().route) return;
	try {
		while (globalThis.__sourceRunner) {
			const [next] = await db
				.select({ id: scenarioSource.id })
				.from(scenarioSource)
				.innerJoin(scenario, eq(scenario.id, scenarioSource.scenarioId))
				.where(and(eq(scenarioSource.state, "pending"), ne(scenario.status, "withdrawn")))
				.limit(1);
			if (!next) return;
			await makeSourceRow(next.id);
		}
	} catch (e) {
		console.error("translation source sweep failed:", e);
	}
}

declare global {
	/** The runner's interval, kept across the dev server's module reloads so a reload replaces it. */
	var __sourceRunner: ReturnType<typeof setInterval> | undefined;
}

function kick() {
	if (globalThis.__sourceRunner) void sweepSources();
}

export function ensureSourceRunner() {
	if (building) return;
	clearInterval(globalThis.__sourceRunner);
	globalThis.__sourceRunner = setInterval(() => void sweepSources(), SWEEP_MS);
	globalThis.__sourceRunner.unref?.();
	void sweepSources();
}

/** Stops picking up sources. One being made is not waited for: it is still pending, and made again after the restart. */
export function stopSourceRunner() {
	clearInterval(globalThis.__sourceRunner);
	globalThis.__sourceRunner = undefined;
}
