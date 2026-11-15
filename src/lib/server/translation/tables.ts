import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { nameRendering, work } from "#lib/server/db/schema.ts";
import type { Caller } from "#lib/server/llm/caller.ts";
import type { Lang } from "#lib/server/revision/draft.ts";
import type { NameRow, NameTable, Work } from "#lib/translation/names.ts";
import { judgeNames, lookupName } from "./names.ts";
import type { Term } from "./source.ts";

/*
 * The works' name tables in the database: a row per work, learner language and name or term (`name_rendering`, an
 * empty rendering for "as in the original"). Building one looks every name up and lets a model pick (names.ts); rows
 * the admin confirmed are never replaced, and only confirmed rows reach a source.
 */
type RenderingRow = typeof nameRendering.$inferSelect;

const rowOf = (r: RenderingRow): NameRow => ({
	term: r.term,
	kind: r.kind as NameRow["kind"],
	rendering: r.rendering || null,
	status: r.status as NameRow["status"],
	origin: (r.origin ?? "none") as NameRow["origin"],
	...(r.url ? { url: r.url } : {}),
	...(r.why ? { why: r.why } : {}),
	...(Array.isArray(r.candidates) ? { candidates: r.candidates as NameRow["candidates"] } : {}),
});

const valuesOf = (workId: string, locale: string, r: NameRow) => ({
	workId,
	locale,
	term: r.term,
	kind: r.kind,
	rendering: r.rendering ?? "",
	status: r.status,
	origin: r.origin,
	url: r.url ?? null,
	why: r.why ?? null,
	candidates: r.candidates ?? null,
});

export function workOf(row: typeof work.$inferSelect): Work {
	return {
		id: row.id,
		title: row.title,
		...(row.wikidata ? { wikidata: row.wikidata } : {}),
		...(Array.isArray(row.wikis) ? { wikis: row.wikis as Work["wikis"] } : {}),
		...(Array.isArray(row.manual) ? { manual: row.manual as Work["manual"] } : {}),
	};
}

/** Every table, by work and language, and the works they belong to. */
export async function nameTables(): Promise<{ tables: NameTable[]; works: Record<string, Work> }> {
	const [rows, works] = await Promise.all([
		db.select().from(nameRendering).orderBy(asc(nameRendering.workId), asc(nameRendering.locale)),
		db.select().from(work),
	]);
	const tables = new Map<string, NameTable>();
	for (const r of rows) {
		const key = `${r.workId}.${r.locale}`;
		const t = tables.get(key) ?? { work: r.workId, locale: r.locale, rows: [] };
		t.rows.push(rowOf(r));
		tables.set(key, t);
	}
	return { tables: [...tables.values()], works: Object.fromEntries(works.map((w) => [w.id, workOf(w)])) };
}

/** The admin's edits to a table: each row as they left it. */
export async function saveNameTable(t: NameTable) {
	await db.transaction(async (tx) => {
		for (const r of t.rows) {
			const v = valuesOf(t.work, t.locale, r);
			await tx
				.insert(nameRendering)
				.values(v)
				.onConflictDoUpdate({ target: [nameRendering.workId, nameRendering.locale, nameRendering.term], set: v });
		}
	});
}

/** The renderings a source in this language may use: confirmed rows only (null: as in the original). */
export async function confirmedNamesOf(workId: string | null, locale: string): Promise<Map<string, string | null>> {
	if (!workId) return new Map();
	const rows = await db
		.select({ term: nameRendering.term, rendering: nameRendering.rendering })
		.from(nameRendering)
		.where(and(eq(nameRendering.workId, workId), eq(nameRendering.locale, locale), eq(nameRendering.status, "confirmed")));
	return new Map(rows.map((r) => [r.term, r.rendering || null]));
}

/** Which of these terms the work's table in this language has, and how far: confirmed or still to confirm. */
export async function namesStateOf(workId: string, locale: string, terms: string[]) {
	const rows = await db
		.select({ term: nameRendering.term, status: nameRendering.status })
		.from(nameRendering)
		.where(and(eq(nameRendering.workId, workId), eq(nameRendering.locale, locale)));
	const status = new Map(rows.map((r) => [r.term, r.status]));
	return { missing: terms.filter((t) => !status.has(t)), pending: terms.filter((t) => status.get(t) === "pending") };
}

/**
 * Looks up the names and terms of a text in a language and writes what was found as rows to confirm. The work's own
 * title is a name too ("a cat in 猫武士"). Confirmed rows stay as they are.
 */
export async function buildNameTable(workId: string, locale: Lang, text: { original: string; context: string; terms: Term[] }, ai: Caller) {
	const [w] = await db.select().from(work).where(eq(work.id, workId));
	if (!w) throw new Error(`no work ${workId}`);
	const theWork = workOf(w);
	const title = theWork.title.split(" (")[0];
	const terms = text.terms.some((t) => t.term === title)
		? text.terms
		: [...text.terms, { term: title, kind: "name" as const, note: `the title of the work: ${theWork.title}` }];
	const found = [];
	for (const t of terms) found.push(await lookupName(t.term, locale, theWork));
	const rows = await judgeNames(text.original, text.context, terms, found, locale, ai, theWork);
	await db.transaction(async (tx) => {
		for (const r of rows) {
			const v = valuesOf(workId, locale, r);
			await tx
				.insert(nameRendering)
				.values(v)
				.onConflictDoUpdate({
					target: [nameRendering.workId, nameRendering.locale, nameRendering.term],
					set: v,
					setWhere: ne(nameRendering.status, "confirmed"),
				});
		}
	});
	return rows;
}
