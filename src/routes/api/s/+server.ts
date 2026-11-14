import { LEARNABLE } from "#lib/constants.ts";
import { learner } from "#lib/server/guard.ts";
import { LANGS, type Lang, normLang } from "#lib/server/revision/draft.ts";
import { startRevision } from "#lib/server/revision/store.ts";
import { sourceKind } from "#lib/server/writing/source.ts";

/*
 * Starts the revision of a piece from what the page handed over: a new piece of the learner's writing, or a fresh
 * revision of one of their unfinished pieces (`pieceId`). Answers the piece's id, which every action then names.
 */
export async function POST({ request }) {
	const u = learner();
	const b = await request.json();
	// A piece kept from before Chinese became "zh-CN" still says "zh".
	b.learner = normLang(b.learner);
	if (b.translation) b.translation.target = normLang(b.translation.target);
	const text = String(b.text ?? "").trim();
	if (!text) return Response.json({ error: "empty draft" }, { status: 400 });
	const source = String(b.source ?? "").trim();
	// Any text is fine; a capture that does not read (a broken copy) is refused rather than taken as text.
	if (sourceKind(source) === "broken") return Response.json({ error: "capture does not read", code: "badSource" }, { status: 400 });
	// A finished scenario's conversation (src/lib/server/revision/scenario/exchange.ts), checked for its shape only.
	const ex = b.exchange;
	const exchange =
		ex && typeof ex === "object" && Array.isArray(ex.transcript) && Array.isArray(ex.before) && ex.scene && typeof ex.lang === "string"
			? ex
			: undefined;
	const tr = b.translation;
	const translation =
		tr && typeof tr.source === "string" && typeof tr.original === "string" && LANGS.includes(tr.target)
			? {
					source: tr.source,
					original: tr.original,
					target: tr.target as Lang,
					context: String(tr.context ?? ""),
					where: typeof tr.where === "string" ? tr.where : undefined,
					readers: typeof tr.readers === "string" ? tr.readers : undefined,
					glossary: Array.isArray(tr.glossary) ? tr.glossary : [],
				}
			: undefined;
	const lang = [translation?.target, exchange?.lang, b.lang].find((l) => (LEARNABLE as readonly string[]).includes(l));
	const scenario = b.scenario && typeof b.scenario.id === "string" ? b.scenario : null;
	const id = await startRevision(
		u,
		{
			exchange,
			translation,
			title: typeof scenario?.title === "string" ? scenario.title : undefined,
			text,
			background: String(b.background ?? "").trim() || undefined,
			source: source || undefined,
			detail: b.detail === "needed" ? "needed" : "more",
			learner: (LANGS.includes(b.learner) ? b.learner : "en") as Lang,
			feedback: b.feedback === "target" ? "target" : "native",
		},
		{
			language: lang,
			kind: translation ? "translation" : exchange ? "scenario" : "own",
			scenarioId: scenario?.id,
			title: typeof scenario?.title === "string" ? scenario.title : undefined,
			place: typeof scenario?.site === "string" ? scenario.site : undefined,
			pieceId: typeof b.pieceId === "string" && /^[0-9a-f-]{36}$/.test(b.pieceId) ? b.pieceId : undefined,
		},
	);
	return Response.json({ id });
}
