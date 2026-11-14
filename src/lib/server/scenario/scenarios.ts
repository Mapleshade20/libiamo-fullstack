import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { ExchangePlace, Place, ScenarioKind } from "#lib/constants.ts";
import { situationOf } from "#lib/exchange/opening.ts";
import type { IssueCard, Library, ScenarioCard, ScenarioProgress, ScenarioView, Situation } from "#lib/scenario/types.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import { type ExchangeVersion, live, type TranslationVersion } from "#lib/scenario/versions.ts";
import { db } from "#lib/server/db/index.ts";
import { issue, issueScenario, piece, scenario, scenarioSource } from "#lib/server/db/schema.ts";
import { isCurrent, rank, shelfOf } from "./rank.ts";

/*
 * Scenarios as a learner meets them. A scenario is offered in the language they are working in when it is published and
 * that version is live; a translation also needs its source in their own language, checked or confirmed. What a page
 * receives is built here and nowhere else: no person's notes, no "others", nothing of what followed in the real thread.
 */
export type Reader = { id: string; nativeLanguage?: string | null };

type Row = typeof scenario.$inferSelect;
type Source = Pick<typeof scenarioSource.$inferSelect, "id" | "title" | "text" | "glossary" | "native">;
const READY = ["checked", "confirmed"];

async function published(ids?: string[]) {
	return db
		.select()
		.from(scenario)
		.where(and(eq(scenario.status, "published"), ids ? inArray(scenario.id, ids) : undefined));
}

/** The sources learners of this language with this native language can translate from, by scenario. */
async function sourcesFor(language: string, native: string | null | undefined, ids: string[]) {
	if (!native || !ids.length) return new Map<string, Source>();
	const rows = await db
		.select({
			scenarioId: scenarioSource.scenarioId,
			id: scenarioSource.id,
			title: scenarioSource.title,
			text: scenarioSource.text,
			glossary: scenarioSource.glossary,
			native: scenarioSource.native,
			state: scenarioSource.state,
		})
		.from(scenarioSource)
		.where(and(eq(scenarioSource.language, language), eq(scenarioSource.native, native), inArray(scenarioSource.scenarioId, ids)));
	return new Map(rows.filter((r) => READY.includes(r.state)).map((r) => [r.scenarioId, r]));
}

/** Where the learner is with each scenario: a piece being written or revised, or one finished. */
async function progressOf(userId: string) {
	const rows = await db
		.select({ scenarioId: piece.scenarioId, id: piece.id, state: piece.state })
		.from(piece)
		.where(and(eq(piece.userId, userId), isNotNull(piece.scenarioId)))
		.orderBy(desc(piece.createdAt));
	const out = new Map<string, { state: ScenarioProgress; open?: string; written?: string }>();
	for (const r of rows) {
		const p = out.get(r.scenarioId as string) ?? { state: "new" as ScenarioProgress };
		if ((r.state === "writing" || r.state === "revising") && !p.open) p.open = r.id;
		if (r.state === "finished" && !p.written) p.written = r.id;
		p.state = p.open ? "open" : p.written ? "written" : "new";
		out.set(r.scenarioId as string, p);
	}
	return out;
}

type Offered = { row: Row; version: ExchangeVersion | TranslationVersion; source?: Source };
async function offered(u: Reader, language: string, ids?: string[]): Promise<Offered[]> {
	const rows = await published(ids);
	const sources = await sourcesFor(
		language,
		u.nativeLanguage,
		rows.filter((r) => r.kind === "translation").map((r) => r.id),
	);
	return rows.flatMap((row) => {
		const version = (row.versions as Record<string, ExchangeVersion | TranslationVersion>)[language];
		if (!live(version)) return [];
		if (row.kind !== "translation") return [{ row, version }];
		const source = sources.get(row.id);
		return source ? [{ row, version, source }] : [];
	});
}

function cardOf({ row, version }: Offered, progress: ScenarioProgress): ScenarioCard {
	return {
		id: row.id,
		kind: row.kind as ScenarioKind,
		place: row.place as Place,
		site: SITE_OF[row.place as Place],
		minutes: row.minutes,
		title: version.title,
		line: version.line,
		state: progress,
		publishedAt: (row.publishedAt ?? row.createdAt).getTime(),
	};
}

async function issuesWith(ids: Set<string>) {
	const issues = await db.select().from(issue).orderBy(desc(issue.date));
	const links = await db.select().from(issueScenario).orderBy(asc(issueScenario.position));
	return issues.map((i) => ({ ...i, scenarios: links.filter((l) => l.issueId === i.id && ids.has(l.scenarioId)).map((l) => l.scenarioId) }));
}

/** The library: the current issue, the rest of what is offered ranked for this learner, and the back issues. */
export async function libraryOf(u: Reader, language: string, uiLang: string, now = new Date()): Promise<Library> {
	const [all, progress] = await Promise.all([offered(u, language), progressOf(u.id)]);
	const cards = new Map(all.map((o) => [o.row.id, cardOf(o, progress.get(o.row.id)?.state ?? "new")]));
	const issues = (await issuesWith(new Set(cards.keys()))).filter((i) => i.scenarios.length && Date.parse(`${i.date}T12:00:00Z`) <= now.getTime());
	const local = (l: unknown) => {
		const m = l as Record<string, string>;
		return m[uiLang] ?? m.en ?? Object.values(m)[0] ?? "";
	};
	const issueCard = (i: (typeof issues)[number]): IssueCard => ({
		id: i.id,
		date: i.date,
		title: local(i.title),
		line: local(i.line),
		tone: i.tone,
		deep: i.deep,
		scenarios: i.scenarios.map((id) => cards.get(id) as ScenarioCard),
	});
	const current = issues[0] && isCurrent(issues[0].date, now) ? issueCard(issues[0]) : undefined;
	const inIssue = new Set(current?.scenarios.map((c) => c.id));
	return {
		...(current ? { issue: current } : {}),
		pool: rank([...cards.values()].filter((c) => !inIssue.has(c.id))),
		past: issues.filter((i) => i.id !== current?.id).map(issueCard),
	};
}

/** The shelf's two scenarios. */
export async function shelfScenariosOf(u: Reader, language: string, now = new Date()): Promise<ScenarioCard[]> {
	const lib = await libraryOf(u, language, "en", now);
	return shelfOf(lib.issue?.scenarios ?? [], lib.pool);
}

/** A scenario's own page, in the language the learner is working in; null when it is not offered to them. */
export async function scenarioViewOf(u: Reader, id: string, language: string): Promise<ScenarioView | null> {
	const [o] = await offered(u, language, [id]);
	if (!o) return null;
	const p = (await progressOf(u.id)).get(id);
	const card = cardOf(o, p?.state ?? "new");
	const extra = { ...(p?.open ? { openPiece: p.open } : {}), ...(p?.written ? { writtenPiece: p.written } : {}) };
	if (o.row.kind === "translation" && o.source) {
		const v = o.version as TranslationVersion;
		const situation: Situation = {
			kind: "translate",
			brief: o.source.title,
			source: o.source.text,
			sourceLang: o.source.native,
			glossary: o.source.glossary as Extract<Situation, { kind: "translate" }>["glossary"],
			where: v.where,
			readers: v.readers,
		};
		return { ...card, ...extra, ...(v.introduction ? { introduction: v.introduction } : {}), situationLang: o.source.native, situation };
	}
	const v = o.version as ExchangeVersion;
	const situation = situationOf(o.row.place as ExchangePlace, v.opening, v.people[0]?.name);
	if (!situation) return null;
	return {
		...card,
		...extra,
		...(v.introduction ? { introduction: v.introduction } : {}),
		situationLang: language,
		situation,
		scene: { you: v.you, people: v.people.map(({ name, who }) => ({ name, who })), goals: v.goals },
	};
}
