import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { LEARNABLE } from "#lib/constants.ts";
import { db } from "#lib/server/db/index.ts";
import { piece, scenario } from "#lib/server/db/schema.ts";
import { afterOf } from "#lib/server/exchange/after.ts";
import { LANGS, type Lang, normLang } from "#lib/server/revision/draft.ts";
import type { RevisionInput } from "#lib/server/revision/revision.ts";
import { translationFor } from "#lib/server/translation/sheet.ts";
import { MAX_CHARS } from "#lib/server/writing/gate.ts";
import type { Setup } from "#lib/session/types.ts";

/*
 * What starts a revision (`POST /api/s`) and what its page is given. A page sends either the learner's own draft (the
 * home page's box) or a piece the server already holds (a translation's sheet, a scenario's conversation), whose text,
 * conversation, source and original come from the database, never from the page. The page is answered with the same
 * `Setup` that `resume` gives a reload, so opening a revision and coming back to it show the same thing; neither has the
 * translation's original.
 */

const PIECE = /^[0-9a-f-]{36}$/;
const learnable = (l: unknown): l is string => (LEARNABLE as readonly string[]).includes(l as string);

export const StartBody = z.object({
	text: z.string().max(MAX_CHARS).optional(),
	background: z.string().max(8000).optional(),
	// A page captured with one of the scripts can be long; it is context, read with every call.
	source: z.string().max(100_000).optional(),
	detail: z.enum(["needed", "more"]).optional(),
	learner: z.string().max(10).optional(),
	feedback: z.enum(["native", "target"]).optional(),
	lang: z.string().max(10).optional(),
	pieceId: z.string().regex(PIECE).optional(),
});
export type StartBody = z.infer<typeof StartBody>;

export type Handed = {
	input: Pick<RevisionInput, "text" | "background" | "source" | "exchange" | "translation">;
	kind: "own" | "scenario" | "translation";
	language?: string;
	scenario?: { id: string; title: string; site: string };
};

/** The draft the learner typed: their own writing. */
export function ownDraft(b: StartBody): Handed {
	return {
		input: { text: (b.text ?? "").trim(), background: b.background?.trim() || undefined, source: b.source?.trim() || undefined },
		kind: "own",
		language: learnable(b.lang) ? b.lang : undefined,
	};
}

/**
 * One of the learner's open pieces the server holds whole: a translation sent from its sheet, or a scenario's
 * conversation once its place has closed. Null when it is not theirs, not open, or (a conversation) still being played.
 */
export async function heldPiece(u: { id: string; name: string }, pieceId: string): Promise<Handed | null> {
	const [p] = await db
		.select({ kind: piece.kind, scenarioId: piece.scenarioId })
		.from(piece)
		.where(and(eq(piece.id, pieceId), eq(piece.userId, u.id), inArray(piece.state, ["writing", "revising"])));
	if (!p?.scenarioId) return null;
	if (p.kind === "translation") {
		const t = await translationFor(u.id, pieceId);
		if (!t) return null;
		return {
			input: { text: t.text.trim(), background: t.background || undefined, translation: t.translation },
			kind: "translation",
			language: t.lang,
			scenario: { id: p.scenarioId, title: t.scenario.title, site: t.scenario.site },
		};
	}
	if (p.kind !== "scenario") return null;
	const a = await afterOf(u, p.scenarioId);
	if (!a || a.pieceId !== pieceId || a.open) return null;
	const h = a.handoff;
	return {
		input: { text: h.text.trim(), background: h.background || undefined, source: h.source || undefined, exchange: h.exchange },
		kind: "scenario",
		language: a.language,
		scenario: h.scenario,
	};
}

/**
 * Development only: a recorded session (lab/baseline, `case replay`) hands its conversation or translation over whole,
 * as the lab did. Its scenario must exist (a piece names it). Null when the body hands nothing over.
 */
export async function handedWhole(raw: Record<string, unknown>, b: StartBody): Promise<Handed | "noScenario" | null> {
	const ex = raw.exchange as Handed["input"]["exchange"] | undefined;
	const exchange =
		ex && typeof ex === "object" && Array.isArray(ex.transcript) && Array.isArray(ex.before) && ex.scene && typeof ex.lang === "string"
			? ex
			: undefined;
	// biome-ignore lint/suspicious/noExplicitAny: a recorded body, checked field by field below.
	const tr = raw.translation as any;
	const target = normLang(tr?.target);
	const translation =
		tr && typeof tr.source === "string" && typeof tr.original === "string" && LANGS.includes(target)
			? {
					source: tr.source,
					original: tr.original,
					target: target as Lang,
					context: String(tr.context ?? ""),
					where: typeof tr.where === "string" ? tr.where : undefined,
					readers: typeof tr.readers === "string" ? tr.readers : undefined,
					glossary: Array.isArray(tr.glossary) ? tr.glossary : [],
				}
			: undefined;
	if (!exchange && !translation) return null;
	const sc = raw.scenario as { id?: unknown; title?: unknown; site?: unknown } | undefined;
	let named: Handed["scenario"];
	if (sc && typeof sc.id === "string") {
		const [row] = await db.select({ id: scenario.id }).from(scenario).where(eq(scenario.id, sc.id));
		if (!row) return "noScenario";
		named = { id: row.id, title: String(sc.title ?? ""), site: String(sc.site ?? "") };
	}
	const own = ownDraft(b);
	return {
		input: { ...own.input, exchange, translation },
		kind: translation ? "translation" : "scenario",
		language: [translation?.target, exchange?.lang, b.lang].find(learnable),
		scenario: named,
	};
}

/** What a revision's page is given, on opening it and on coming back to it: never the translation's original. */
export function pageSetup(input: RevisionInput, p: { language: string; scenarioId: string | null; title: string; place: string }): Setup {
	const tr = input.translation;
	return {
		text: input.text,
		background: input.background,
		source: input.source,
		detail: input.detail,
		learner: input.learner,
		feedback: input.feedback,
		lang: p.language,
		exchange: input.exchange as Setup["exchange"],
		translation: tr && {
			source: tr.source,
			glossary: tr.glossary,
			context: tr.context,
			where: tr.where,
			readers: tr.readers,
			target: tr.target,
		},
		scenario: p.scenarioId ? { id: p.scenarioId, title: p.title, site: p.place } : undefined,
	};
}
