import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { NAME_KINDS, NAME_STATUSES, PLACES, SCENARIO_KINDS, SCENARIO_STATUSES, SOURCE_STATES, URGENCIES } from "#lib/constants.ts";
import { versionsSchema } from "#lib/scenario/versions.ts";
import type * as schema from "../db/schema.ts";
import { issue, issueScenario, nameRendering, scenario, scenarioSource, work } from "../db/schema.ts";

/*
 * Scenarios and issues as one document: what the development seed loads (lab/seed/scenarios.json) and what the admin
 * will export and import (phase 5). Importing writes each work with its name tables, each scenario whole (its versions
 * validated by its kind and place) with its sources, and each issue with its scenarios in order; what is there already
 * is replaced.
 */
const Local = z.record(z.string(), z.string());
const Source = z.object({
	language: z.string(),
	native: z.string(),
	title: z.string().default(""),
	text: z.string(),
	glossary: z.array(z.object({ term: z.string(), shown: z.string(), gloss: z.string() })).default([]),
	state: z.enum(SOURCE_STATES).default("confirmed"),
});
const NameRow = z.object({
	term: z.string().min(1),
	kind: z.enum(NAME_KINDS),
	rendering: z.string().nullable(),
	status: z.enum(NAME_STATUSES),
	origin: z.string().default("none"),
	url: z.string().optional(),
	why: z.string().optional(),
	candidates: z.array(z.object({ rendering: z.string(), source: z.string(), url: z.string(), about: z.string() })).optional(),
});
/** A work translation scenarios come from, as far as naming goes, with its name table per learner language. */
const Work = z.object({
	id: z.string().regex(/^[a-z0-9-]{2,60}$/),
	title: z.string().min(1),
	wikidata: z.string().optional(),
	wikis: z.array(z.object({ api: z.string(), lang: z.string() })).optional(),
	manual: z.array(z.object({ lang: z.string(), name: z.string(), search: z.string() })).optional(),
	names: z.record(z.string(), z.array(NameRow)).default({}),
});
const Scenario = z.object({
	id: z.string().regex(/^[a-z0-9-]{2,60}$/),
	kind: z.enum(SCENARIO_KINDS),
	workId: z.string().nullish(),
	place: z.enum(PLACES),
	status: z.enum(SCENARIO_STATUSES).default("draft"),
	minutes: z.number().int().positive(),
	urgency: z.enum(URGENCIES).nullish(),
	maxTurns: z.number().int().positive().nullish(),
	publishedAt: z.string().nullish(),
	versions: z.unknown(),
	sources: z.array(Source).default([]),
});
const Issue = z.object({
	id: z.string().regex(/^[a-z0-9-]{2,60}$/),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	title: Local,
	line: Local,
	tone: z.string(),
	deep: z.string(),
	scenarios: z.array(z.string()),
});
export const ContentDoc = z.object({
	version: z.literal(1),
	works: z.array(Work).default([]),
	scenarios: z.array(Scenario).default([]),
	issues: z.array(Issue).default([]),
});
export type ContentDoc = z.infer<typeof ContentDoc>;

type Db = PostgresJsDatabase<typeof schema>;

export async function importContent(db: Db, input: unknown) {
	const doc = ContentDoc.parse(input);
	const rows = doc.scenarios.map((s) => {
		const versions = versionsSchema(s.kind, s.place).safeParse(s.versions);
		if (!versions.success) throw new Error(`${s.id}: ${versions.error.message}`);
		return { s, versions: versions.data };
	});
	await db.transaction(async (tx) => {
		for (const w of doc.works) {
			const set = { title: w.title, wikidata: w.wikidata ?? null, wikis: w.wikis ?? null, manual: w.manual ?? null };
			await tx
				.insert(work)
				.values({ id: w.id, ...set })
				.onConflictDoUpdate({ target: work.id, set });
			for (const [locale, names] of Object.entries(w.names))
				for (const r of names) {
					const row = {
						kind: r.kind,
						rendering: r.rendering ?? "",
						status: r.status,
						origin: r.origin,
						url: r.url ?? null,
						why: r.why ?? null,
						candidates: r.candidates ?? null,
					};
					await tx
						.insert(nameRendering)
						.values({ workId: w.id, locale, term: r.term, ...row })
						.onConflictDoUpdate({ target: [nameRendering.workId, nameRendering.locale, nameRendering.term], set: row });
				}
		}
		for (const { s, versions } of rows) {
			const set = {
				kind: s.kind,
				workId: s.workId ?? null,
				place: s.place,
				status: s.status,
				minutes: s.minutes,
				urgency: s.urgency ?? null,
				maxTurns: s.maxTurns ?? null,
				versions,
				publishedAt: s.publishedAt ? new Date(`${s.publishedAt}T12:00:00Z`) : null,
			};
			await tx
				.insert(scenario)
				.values({ id: s.id, ...set })
				.onConflictDoUpdate({ target: scenario.id, set });
			for (const src of s.sources) {
				const row = { title: src.title, text: src.text, glossary: src.glossary, state: src.state, madeAt: new Date() };
				await tx
					.insert(scenarioSource)
					.values({ scenarioId: s.id, language: src.language, native: src.native, ...row })
					.onConflictDoUpdate({ target: [scenarioSource.scenarioId, scenarioSource.language, scenarioSource.native], set: row });
			}
		}
		for (const i of doc.issues) {
			const set = { date: i.date, title: i.title, line: i.line, tone: i.tone, deep: i.deep };
			await tx
				.insert(issue)
				.values({ id: i.id, ...set })
				.onConflictDoUpdate({ target: issue.id, set });
			await tx.delete(issueScenario).where(sql`${issueScenario.issueId} = ${i.id}`);
			if (i.scenarios.length)
				await tx.insert(issueScenario).values(i.scenarios.map((scenarioId, position) => ({ issueId: i.id, scenarioId, position })));
		}
	});
	return { works: doc.works.length, scenarios: rows.length, issues: doc.issues.length };
}
