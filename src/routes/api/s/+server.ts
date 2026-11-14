import { learner } from "#lib/server/guard.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import { Lanes } from "#lib/server/llm/lanes.ts";
import { logSession, sessions } from "#lib/server/sessions.ts";
import { sourceKind } from "#model/context/source.ts";
import { LANGS, type Lang, normLang } from "#model/fixtures/types.ts";
import { LiveSession } from "#model/session/live.ts";

// Starts a live session from what the home page handed over.
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
	// A finished scenario's conversation (src/scenario/exchange.ts), checked for its shape only.
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
	const id = new Date().toISOString().replace(/[:.]/g, "-");
	const ai = await learnerCaller({ user: u, lanes: new Lanes(), fresh: !!b.noCache });
	sessions.set(id, {
		owner: u.id,
		session: new LiveSession(
			{
				exchange,
				translation,
				title: typeof b.scenario?.title === "string" ? b.scenario.title : undefined,
				text,
				background: String(b.background ?? "").trim() || undefined,
				source: source || undefined,
				detail: b.detail === "needed" ? "needed" : "more",
				learner: (LANGS.includes(b.learner) ? b.learner : "en") as Lang,
				feedback: b.feedback === "target" ? "target" : "native",
			},
			ai,
		),
	});
	logSession(id, { t: Date.now(), action: "create", body: b });
	return Response.json({ id });
}
