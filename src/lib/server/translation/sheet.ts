import { and, eq, inArray } from "drizzle-orm";
import { LEARNABLE } from "#lib/constants.ts";
import type { ScenarioView } from "#lib/scenario/types.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import type { TranslationVersion } from "#lib/scenario/versions.ts";
import { db } from "#lib/server/db/index.ts";
import { piece, scenario, scenarioSource } from "#lib/server/db/schema.ts";
import type { Lang } from "#lib/server/revision/draft.ts";
import { scenarioViewOf } from "#lib/server/scenario/scenarios.ts";

/*
 * The translation sheet. The learner writes on it as long as they like: the draft is the piece's text (`writing`), saved
 * as they type, so it is there on another device and on the shelf. "Done" starts the revision on the same piece, and
 * the server hands it the source the sheet showed and the original, which never reaches the page (the passes compare
 * the learner's version with it).
 */
type SheetUser = { id: string; nativeLanguage?: string | null; tutorLanguage: string };

export type SheetView = {
	scenario: ScenarioView;
	/** The learner's piece of it, while it is on the sheet (null before anything is written). */
	pieceId: string | null;
	draft: string;
	/** The piece has gone into its revision: the page sends the learner there. */
	revising: boolean;
};

async function openPieceOf(userId: string, scenarioId: string) {
	const [row] = await db
		.select({ id: piece.id, text: piece.text, state: piece.state, kind: piece.kind })
		.from(piece)
		.where(and(eq(piece.userId, userId), eq(piece.scenarioId, scenarioId), inArray(piece.state, ["writing", "revising"])));
	return row ?? null;
}

export async function sheetOf(u: SheetUser, scenarioId: string, language: string): Promise<SheetView | null> {
	const view = await scenarioViewOf(u, scenarioId, language);
	if (view?.situation.kind !== "translate") return null;
	const open = await openPieceOf(u.id, scenarioId);
	return { scenario: view, pieceId: open?.id ?? null, draft: open?.text ?? "", revising: open?.state === "revising" };
}

/** The source this learner translates from: the scenario's, in the language learnt and their own, once it is ready. */
async function sourceFor(scenarioId: string, language: string, native: string) {
	const [row] = await db
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
		);
	return row ?? null;
}

/**
 * Keeps the sheet's draft: the piece is created with the first words (the plan typed on the scenario page as its
 * background) and its text replaced after. A piece already in its revision is left alone.
 */
export async function saveSheet(u: SheetUser, input: { scenarioId: string; language: string; text: string; plan?: string }) {
	const native = u.nativeLanguage ?? "en";
	const found = await sourceFor(input.scenarioId, input.language, native);
	if (!found || !(LEARNABLE as readonly string[]).includes(input.language)) return null;
	const v = (found.s.versions as Record<string, TranslationVersion>)[input.language];
	return db.transaction(async (tx) => {
		const [open] = await tx
			.select({ id: piece.id, state: piece.state })
			.from(piece)
			.where(and(eq(piece.userId, u.id), eq(piece.scenarioId, input.scenarioId), inArray(piece.state, ["writing", "revising"])))
			.for("update");
		if (open) {
			if (open.state === "writing") await tx.update(piece).set({ text: input.text }).where(eq(piece.id, open.id));
			return { id: open.id, created: false };
		}
		if (!input.text.trim()) return null;
		const [p] = await tx
			.insert(piece)
			.values({
				userId: u.id,
				language: input.language,
				kind: "translation",
				scenarioId: input.scenarioId,
				sourceId: found.src.id,
				place: SITE_OF.translation,
				title: v?.title ?? "",
				text: input.text,
				background: input.plan?.trim() || null,
				tutorLanguage: u.tutorLanguage === "target" ? input.language : native,
				state: "writing",
			})
			.onConflictDoNothing()
			.returning({ id: piece.id });
		return p ? { id: p.id, created: true } : null;
	});
}

/** What the revision of a translation piece is handed: the source it was written from, the original, the scenario. */
export async function translationFor(userId: string, pieceId: string) {
	const [row] = await db
		.select({ p: piece, s: scenario, src: scenarioSource })
		.from(piece)
		.innerJoin(scenario, eq(scenario.id, piece.scenarioId))
		.innerJoin(scenarioSource, eq(scenarioSource.id, piece.sourceId))
		.where(and(eq(piece.id, pieceId), eq(piece.userId, userId), eq(piece.kind, "translation")));
	if (!row) return null;
	const v = (row.s.versions as Record<string, TranslationVersion>)[row.p.language];
	if (!v) return null;
	return {
		translation: {
			source: row.src.text,
			original: v.original,
			glossary: row.src.glossary as { term: string; shown: string; gloss: string }[],
			context: v.introduction,
			where: v.where,
			readers: v.readers,
			target: row.p.language as Lang,
		},
		background: [v.introduction, row.p.background && `My plan: ${row.p.background}`].filter(Boolean).join("\n\n"),
		scenario: { id: row.s.id, title: v.title, site: SITE_OF.translation },
	};
}
