import { error } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import { LEARNABLE } from "#lib/constants.ts";
import type { ScenarioView } from "#lib/scenario/types.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import { live, type TranslationVersion } from "#lib/scenario/versions.ts";
import { db } from "#lib/server/db/index.ts";
import { piece, scenario, scenarioSource } from "#lib/server/db/schema.ts";
import type { Lang } from "#lib/server/revision/draft.ts";
import { takePlan } from "#lib/server/scenario/plans.ts";
import { Assignment, sourceIdentity } from "./identity.ts";

type SheetUser = { id: string; nativeLanguage?: string | null; tutorLanguage: string };
type Writer = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const openFor = (userId: string, scenarioId: string) =>
	and(eq(piece.userId, userId), eq(piece.scenarioId, scenarioId), inArray(piece.state, ["writing", "revising"]));
export type SheetView = {
	scenario: ScenarioView;
	language: string;
	binding: { sourceId: string; generation: string };
	pieceId: string | null;
	draft: string;
	revising: boolean;
};

function view(id: string, a: Assignment): ScenarioView {
	return {
		id,
		kind: "translation",
		place: "translation",
		site: SITE_OF.translation,
		minutes: a.minutes,
		title: a.version.title,
		line: a.version.line,
		state: "new",
		publishedAt: a.publishedAt,
		introduction: a.version.introduction,
		situationLang: a.native,
		situation: {
			kind: "translate",
			brief: a.title,
			source: a.source,
			sourceLang: a.native,
			glossary: a.glossary,
			where: a.version.where,
			readers: a.version.readers,
		},
	};
}

async function sourceFor(w: Writer, scenarioId: string, language: string, native: string) {
	const [row] = await w
		.select({ s: scenario, src: scenarioSource })
		.from(scenario)
		.innerJoin(scenarioSource, eq(scenarioSource.scenarioId, scenario.id))
		.where(
			and(
				eq(scenario.id, scenarioId),
				eq(scenario.status, "published"),
				eq(scenario.kind, "translation"),
				eq(scenarioSource.language, language),
				eq(scenarioSource.native, native),
				inArray(scenarioSource.state, ["checked", "confirmed"]),
			),
		)
		.for("share");
	if (!row) return null;
	const version = (row.s.versions as Record<string, TranslationVersion>)[language];
	if (!live(version) || row.src.inputHash !== sourceIdentity(version, row.s.workId)) return null;
	return Assignment.parse({
		version,
		language,
		native,
		sourceId: row.src.id,
		generation: row.src.generation,
		title: row.src.title,
		minutes: row.s.minutes,
		publishedAt: (row.s.publishedAt ?? row.s.createdAt).getTime(),
		source: row.src.text,
		glossary: row.src.glossary,
	});
}

/** Existing drafts keep their assignment, even after edits, withdrawal or a language switch. */
export async function sheetOf(u: SheetUser, scenarioId: string, language: string): Promise<SheetView | null> {
	const [open] = await db.select().from(piece).where(openFor(u.id, scenarioId));
	const a = open ? Assignment.parse(open.assignment) : await sourceFor(db, scenarioId, language, u.nativeLanguage ?? "en");
	if (!a) return null;
	return {
		scenario: view(scenarioId, a),
		language: a.language,
		binding: { sourceId: a.sourceId, generation: a.generation },
		pieceId: open?.id ?? null,
		draft: open?.text ?? "",
		revising: open?.state === "revising",
	};
}

/** The first save must refer to the source displayed; later saves use the immutable assignment. */
export async function saveSheet(u: SheetUser, input: { scenarioId: string; language: string; text: string; sourceId: string; generation: string }) {
	if (!(LEARNABLE as readonly string[]).includes(input.language)) return null;
	return db.transaction(async (tx) => {
		const [open] = await tx.select().from(piece).where(openFor(u.id, input.scenarioId)).for("update");
		const a = open ? Assignment.parse(open.assignment) : await sourceFor(tx, input.scenarioId, input.language, u.nativeLanguage ?? "en");
		if (!a || a.language !== input.language || a.sourceId !== input.sourceId || a.generation !== input.generation)
			error(409, "The assignment changed. Reload it before saving.");
		if (open) {
			if (open.state === "writing") await tx.update(piece).set({ text: input.text }).where(eq(piece.id, open.id));
			return { id: open.id, created: false };
		}
		if (!input.text.trim()) return null;
		const [p] = await tx
			.insert(piece)
			.values({
				userId: u.id,
				language: a.language,
				kind: "translation",
				scenarioId: input.scenarioId,
				sourceId: a.sourceId,
				assignment: a,
				place: SITE_OF.translation,
				title: a.version.title,
				text: input.text,
				background: await takePlan(tx, u.id, input.scenarioId, a.language),
				tutorLanguage: u.tutorLanguage === "target" ? a.language : a.native,
				state: "writing",
			})
			.onConflictDoNothing()
			.returning({ id: piece.id });
		if (!p) error(409, "This scenario was opened in another tab. Reload before saving.");
		return { id: p.id, created: true };
	});
}

/** Only this server-held assignment supplies the original to the revision. */
export async function translationFor(userId: string, pieceId: string) {
	const [p] = await db
		.select()
		.from(piece)
		.where(and(eq(piece.id, pieceId), eq(piece.userId, userId), eq(piece.kind, "translation")));
	if (!p) return null;
	const a = Assignment.parse(p.assignment);
	const v = a.version;
	return {
		translation: {
			source: a.source,
			original: v.original,
			glossary: a.glossary,
			context: v.introduction,
			where: v.where,
			readers: v.readers,
			target: a.language as Lang,
		},
		background: [v.introduction, p.background && `My plan: ${p.background}`].filter(Boolean).join("\n\n"),
		scenario: { id: p.scenarioId, title: v.title, site: SITE_OF.translation },
		lang: a.language,
	};
}
