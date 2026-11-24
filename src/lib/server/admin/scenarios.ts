import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { type ExchangePlace, langName, type Place, type ScenarioKind, type ScenarioStatus, type SourceState, type Urgency } from "#lib/constants.ts";
import { blankVersion } from "#lib/scenario/blank.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import { live, type TranslationVersion, type Version, versionProblems, versionsSchema } from "#lib/scenario/versions.ts";
import { type InboxSuggestion, suggestionFor } from "#lib/server/admin/inbox.ts";
import { db } from "#lib/server/db/index.ts";
import { issueScenario, piece, scenario, scenarioSource, suggestion, work } from "#lib/server/db/schema.ts";
import { sourceIdentity } from "#lib/server/translation/identity.ts";
import { kickSources, queueSources } from "#lib/server/translation/runner.ts";
import { isByLine, unitsOf } from "#lib/translation/blocks.ts";

/*
 * Scenarios as the admin edits them: the row whole, its versions validated by kind and place on every save, a
 * translation's sources with their state. Publishing a translation queues a source for every learner language that
 * has none (server/translation/runner.ts). Once learners have written in a scenario, its kind and place stay.
 */
export type AdminScenarioRow = {
	id: string;
	kind: ScenarioKind;
	place: Place;
	site: string;
	status: ScenarioStatus;
	title: string;
	line: string;
	languages: string[];
	minutes: number;
	publishedAt: string | null;
	updatedAt: string;
	written: number;
	/** Sources an admin has to look at (checker notes, names to confirm, failed). */
	toCheck: number;
};

export type AdminSource = {
	id: string;
	generation: string;
	language: string;
	native: string;
	state: SourceState;
	title: string;
	text: string;
	glossary: { term: string; shown: string; gloss: string }[];
	notes: unknown;
	madeAt: string | null;
};

export type ScenarioDraft = {
	id: string;
	kind: ScenarioKind;
	place: Place;
	status: ScenarioStatus;
	minutes: number;
	urgency: Urgency | null;
	maxTurns: number | null;
	workId: string | null;
	versions: Record<string, Version>;
};

export type AdminScenario = ScenarioDraft & {
	publishedAt: string | null;
	written: number;
	sources: AdminSource[];
	works: { id: string; title: string }[];
	/** The learner's suggestion it was made from. */
	from: Omit<InboxSuggestion, "scenario"> | null;
};

const firstOf = (versions: Record<string, Version>) => versions.en ?? Object.values(versions)[0];

async function writtenCounts(ids?: string[]) {
	const rows = await db
		.select({ id: piece.scenarioId, n: count() })
		.from(piece)
		.where(and(eq(piece.state, "finished"), ids ? inArray(piece.scenarioId, ids) : sql`${piece.scenarioId} is not null`))
		.groupBy(piece.scenarioId);
	return new Map(rows.map((r) => [r.id as string, r.n]));
}

/** Pieces of a scenario at all, finished or not: once there is one, where it happens is fixed. */
async function anyPiece(id: string) {
	const [r] = await db.select({ n: count() }).from(piece).where(eq(piece.scenarioId, id));
	return r.n > 0;
}

export async function adminScenarios(): Promise<AdminScenarioRow[]> {
	const [rows, written, checks] = await Promise.all([
		db.select().from(scenario).orderBy(desc(scenario.createdAt)),
		writtenCounts(),
		db
			.select({ id: scenarioSource.scenarioId, n: count() })
			.from(scenarioSource)
			.where(inArray(scenarioSource.state, ["notes", "failed"]))
			.groupBy(scenarioSource.scenarioId),
	]);
	const toCheck = new Map(checks.map((r) => [r.id, r.n]));
	return rows.map((r) => {
		const versions = r.versions as Record<string, Version>;
		const v = firstOf(versions);
		return {
			id: r.id,
			kind: r.kind as ScenarioKind,
			place: r.place as Place,
			site: SITE_OF[r.place as Place],
			status: r.status as ScenarioStatus,
			title: v?.title ?? "",
			line: v?.line ?? "",
			languages: Object.keys(versions),
			minutes: r.minutes,
			publishedAt: r.publishedAt?.toISOString() ?? null,
			updatedAt: r.updatedAt.toISOString(),
			written: written.get(r.id) ?? 0,
			toCheck: toCheck.get(r.id) ?? 0,
		};
	});
}

export async function adminScenario(id: string): Promise<AdminScenario | null> {
	const [row] = await db.select().from(scenario).where(eq(scenario.id, id));
	if (!row) return null;
	const [sources, written, works, from] = await Promise.all([
		db.select().from(scenarioSource).where(eq(scenarioSource.scenarioId, id)).orderBy(scenarioSource.language, scenarioSource.native),
		writtenCounts([id]),
		db.select({ id: work.id, title: work.title }).from(work).orderBy(work.title),
		suggestionFor(id),
	]);
	return {
		id: row.id,
		kind: row.kind as ScenarioKind,
		place: row.place as Place,
		status: row.status as ScenarioStatus,
		minutes: row.minutes,
		urgency: (row.urgency as Urgency | null) ?? null,
		maxTurns: row.maxTurns,
		workId: row.workId,
		versions: row.versions as Record<string, Version>,
		publishedAt: row.publishedAt?.toISOString() ?? null,
		written: written.get(id) ?? 0,
		works,
		from,
		sources: sources.map((s) => ({
			id: s.id,
			generation: s.generation,
			language: s.language,
			native: s.native,
			state: s.state as SourceState,
			title: s.title,
			text: s.text,
			glossary: s.glossary as AdminSource["glossary"],
			notes: s.notes,
			madeAt: s.madeAt?.toISOString() ?? null,
		})),
	};
}

export class ScenarioError extends Error {}

/**
 * Saves a scenario whole. `publish` publishes it (a translation's missing sources are queued); a published scenario
 * saved stays published, and either needs a language learners are offered it in. A new id must be free; an existing
 * scenario with pieces keeps its kind and place. What is wrong is said a line each, in the page's words.
 */
export async function saveScenario(input: ScenarioDraft, opts: { isNew: boolean; publish: boolean; by: string }) {
	const problems = [
		...(/^[a-z0-9-]{2,60}$/.test(input.id) ? [] : ["Id: 2 to 60 lowercase letters, digits and hyphens"]),
		...(Number.isInteger(input.minutes) && input.minutes >= 1 && input.minutes <= 120 ? [] : ["Minutes: a whole number from 1 to 120"]),
	];
	const versions = versionsSchema(input.kind, input.place).safeParse(input.versions);
	if (!versions.success) problems.push(...versionProblems(versions.error.issues, (l) => langName(l, "en")));
	if (problems.length || !versions.success) throw new ScenarioError(problems.join("\n"));
	if (!Object.keys(versions.data).length) throw new ScenarioError("A scenario needs at least one language.");
	if ((input.kind === "translation") !== (input.place === "translation"))
		throw new ScenarioError("A translation happens on the sheet, and only a translation does.");
	const [was] = await db.select().from(scenario).where(eq(scenario.id, input.id));
	if (opts.isNew && was) throw new ScenarioError(`There is already a scenario called ${input.id}.`);
	if (!opts.isNew && !was) throw new ScenarioError("No such scenario.");
	if (was && (was.place !== input.place || was.kind !== input.kind) && (await anyPiece(input.id)))
		throw new ScenarioError("Learners have written in this scenario, so where it happens cannot change.");
	const status: ScenarioStatus = opts.publish
		? "published"
		: (was?.status as ScenarioStatus | undefined) === "published"
			? "published"
			: (input.status ?? "draft");
	if (status === "published" && !Object.values(versions.data).some(live))
		throw new ScenarioError("Every language is a draft, so no learner would find it: make one live (or withdraw the scenario).");
	const set = {
		kind: input.kind,
		place: input.place,
		status,
		minutes: input.minutes,
		urgency: input.kind === "exchange" ? (input.urgency ?? "medium") : null,
		maxTurns: input.kind === "exchange" ? input.maxTurns : null,
		workId: input.workId,
		versions: versions.data,
		...(status === "published" && !was?.publishedAt ? { publishedAt: new Date() } : {}),
	};
	await db
		.insert(scenario)
		.values({ id: input.id, ...set, createdBy: opts.by })
		.onConflictDoUpdate({ target: scenario.id, set });
	if (status === "published" && input.kind === "translation") await queueSources(input.id);
}

/** Takes a scenario off the library; pieces already written in it stay theirs. */
export async function withdrawScenario(id: string) {
	await db.update(scenario).set({ status: "withdrawn" }).where(eq(scenario.id, id));
}

/** Deletes a draft nobody has written in. */
export async function deleteScenario(id: string) {
	if (await anyPiece(id)) throw new ScenarioError("Learners have written in this scenario; withdraw it instead.");
	await db.transaction(async (tx) => {
		// A suggestion it was made from waits again.
		await tx.update(suggestion).set({ status: "pending", scenarioId: null, resolvedAt: null }).where(eq(suggestion.scenarioId, id));
		await tx.delete(issueScenario).where(eq(issueScenario.scenarioId, id));
		await tx.delete(scenario).where(eq(scenario.id, id));
	});
}

/** Makes a source again (the original changed, or the names were confirmed since). */
export async function remakeSource(sourceId: string, generation: string) {
	const [row] = await db
		.select({ src: scenarioSource, s: scenario })
		.from(scenarioSource)
		.innerJoin(scenario, eq(scenario.id, scenarioSource.scenarioId))
		.where(eq(scenarioSource.id, sourceId));
	if (!row) return;
	const v = (row.s.versions as Record<string, TranslationVersion>)[row.src.language];
	if (!v) throw new ScenarioError("This source no longer has a version.");
	await db
		.update(scenarioSource)
		.set({ state: "pending", notes: null, generation: randomUUID(), inputHash: sourceIdentity(v, row.s.workId) })
		.where(and(eq(scenarioSource.id, sourceId), eq(scenarioSource.generation, generation)));
	kickSources();
}

export type SourceEdit = Pick<AdminSource, "title" | "text" | "glossary">;

/**
 * The admin has read the source and vouches for it, in their own wording when they edited it: kept under a new
 * generation (a sheet showing the old one is refused when sent, and reloads) and marked edited, so making it again warns.
 */
export async function confirmSource(sourceId: string, generation: string, edit?: SourceEdit) {
	if (edit) await checkEdit(sourceId, edit);
	const [done] = await db
		.update(scenarioSource)
		.set(edit ? { ...edit, state: "confirmed", notes: { edited: true }, generation: randomUUID() } : { state: "confirmed" })
		.where(
			and(
				eq(scenarioSource.id, sourceId),
				eq(scenarioSource.generation, generation),
				inArray(scenarioSource.state, ["checked", "notes", "confirmed"]),
			),
		)
		.returning({ id: scenarioSource.id });
	if (!done) throw new ScenarioError("The source changed since this page loaded: look at it again.");
}

/** An edited source keeps the original's layout (the sheet pairs them), and each term is in both texts. */
async function checkEdit(sourceId: string, e: SourceEdit) {
	const [row] = await db
		.select({ src: scenarioSource, s: scenario })
		.from(scenarioSource)
		.innerJoin(scenario, eq(scenario.id, scenarioSource.scenarioId))
		.where(eq(scenarioSource.id, sourceId));
	const v = row && (row.s.versions as Record<string, TranslationVersion>)[row.src.language];
	if (!row?.src.text || !v || row.src.inputHash !== sourceIdentity(v, row.s.workId))
		throw new ScenarioError("This source is not current: make it again.");
	const byLine = isByLine(v.original);
	const n = unitsOf(v.original).units.length;
	const problems = [
		e.title ? "" : "It needs a title.",
		isByLine(e.text) === byLine && unitsOf(e.text).units.length === n ? "" : `Keep the original's ${n} ${byLine ? "lines" : "paragraphs"}.`,
		...e.glossary.map((g) =>
			!g.term || !g.shown || !g.gloss
				? "Each term needs how the source shows it and what it means."
				: !v.original.toLowerCase().includes(g.term.toLowerCase())
					? `"${g.term}" is not in the original.`
					: e.text.includes(g.shown)
						? ""
						: `"${g.shown}" is not in the source.`,
		),
	].filter(Boolean);
	if (problems.length) throw new ScenarioError([...new Set(problems)].join(" "));
}

/** A free scenario id from a title: its words, lowercased, numbered when taken. */
export async function freeId(base: string) {
	const stem =
		base
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40) || "scenario";
	const taken = new Set(
		(
			await db
				.select({ id: scenario.id })
				.from(scenario)
				.where(sql`${scenario.id} like ${`${stem}%`}`)
		).map((r) => r.id),
	);
	if (!taken.has(stem) && stem.length >= 2) return stem;
	for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/**
 * A draft scenario from a learner's suggestion, in its language: what they wanted to do as its title and first goal, whom
 * they were writing to as the first person. A suggestion from elsewhere happens where the admin says.
 */
export async function scenarioFromSuggestion(suggestionId: string, by: string, chosen?: ExchangePlace) {
	const [s] = await db.select().from(suggestion).where(eq(suggestion.id, suggestionId));
	if (!s) throw new ScenarioError("No such suggestion.");
	const place = s.place === "other" ? chosen : (s.place as ExchangePlace);
	if (!place) throw new ScenarioError("Say where it happens.");
	const id = await freeId(s.purpose);
	const purpose = s.purpose.slice(0, 300);
	const version = blankVersion("exchange", place, purpose);
	version.goals = [purpose];
	if (s.who) version.people[0].who = s.who.slice(0, 300);
	await db
		.insert(scenario)
		.values({ id, kind: "exchange", place, status: "draft", minutes: 10, urgency: "medium", versions: { [s.language]: version }, createdBy: by });
	await db.update(suggestion).set({ status: "live", scenarioId: id, resolvedAt: new Date() }).where(eq(suggestion.id, suggestionId));
	return id;
}
