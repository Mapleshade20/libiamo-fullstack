import { learner } from "#lib/server/guard.ts";
import { LANGS, type Lang, normLang } from "#lib/server/revision/draft.ts";
import { type Handed, handedWhole, heldPiece, ownDraft, pageSetup, StartBody } from "#lib/server/revision/handover.ts";
import { pieceFor, startRevision } from "#lib/server/revision/store.ts";
import { sourceKind } from "#lib/server/writing/source.ts";
import { dev } from "$app/env";

/*
 * Starts the revision of a piece (server/revision/handover.ts): the learner's own draft, or one of their open pieces the
 * server holds (`pieceId`: a translation's sheet, a scenario's conversation). Answers the piece's id, which every action
 * then names, and the setup its page opens with (the one `resume` gives).
 */
export async function POST({ request }) {
	const u = learner();
	const raw = await request.json().catch(() => null);
	const parsed = StartBody.safeParse(raw);
	if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
	const b = parsed.data;
	let from: Handed | null;
	if (b.pieceId) {
		from = await heldPiece(u, b.pieceId);
		if (!from) return Response.json({ error: "No such piece." }, { status: 404 });
	} else {
		const whole = dev ? await handedWhole(raw, b) : null;
		if (whole === "noScenario") return Response.json({ error: "No such scenario." }, { status: 400 });
		from = whole ?? ownDraft(b);
	}
	const { text, source } = from.input;
	if (!text) return Response.json({ error: "empty draft" }, { status: 400 });
	// Any text is fine; a capture that does not read (a broken copy) is refused rather than taken as text.
	if (source && from.kind === "own" && sourceKind(source) === "broken")
		return Response.json({ error: "capture does not read", code: "badSource" }, { status: 400 });
	// A piece kept from before Chinese became "zh-CN" still says "zh".
	const native = normLang(b.learner);
	const input = {
		...from.input,
		title: from.scenario?.title || undefined,
		detail: b.detail ?? "more",
		learner: (LANGS.includes(native as Lang) ? native : "en") as Lang,
		feedback: b.feedback ?? "native",
	};
	const id = await startRevision(u, input, {
		language: from.language,
		kind: from.kind,
		scenarioId: from.scenario?.id,
		title: from.scenario?.title || undefined,
		place: from.scenario?.site || undefined,
		pieceId: b.pieceId,
	});
	const p = await pieceFor(u.id, id);
	if (!p) return Response.json({ error: "No such piece." }, { status: 404 });
	return Response.json({ id, setup: pageSetup(input, p) });
}
