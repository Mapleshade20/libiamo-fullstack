import { learner } from "#lib/server/guard.ts";
import { stopOf } from "#lib/server/llm/transport.ts";
import { RevisionSession } from "#lib/server/revision/revision.ts";
import { logSession, sessions } from "#lib/server/sessions.ts";
import { dev } from "$app/env";

// Each action is one step of the session page's flow; see src/session/live.ts.
// biome-ignore lint/suspicious/noExplicitAny: request bodies are checked by the session's methods.
const ACTIONS: Record<string, (s: RevisionSession, b: any) => unknown> = {
	scene: (s, b) => s.inferScene(b.correction || undefined),
	start: (s) => s.start(),
	pass1: (s, b) => s.pass1(b.detail === "needed" || b.detail === "more" ? b.detail : undefined),
	pass1done: (s, b) => s.pass1Done(b.own ?? {}, Array.isArray(b.keep) ? b.keep : []),
	overview: (s) => s.overview(),
	overviewReply: (s, b) => s.overviewReply(b.said ?? null),
	material: (s, b) => s.material(b.id, b.meanings),
	pieces: (s, b) => s.pieces(b.id),
	hint: (s, b) => s.hint(b.id),
	recall: (s, b) => s.recall(b.id, b.attempt),
	notes: (s, b) => s.notes(b.items, b.p1),
	own: (s, b) => s.ownReading(b.id, Number(b.k ?? 0), b.said),
	grade: (s, b) => s.grade(b.id, b.attempt),
	question: (s, b) => s.question(b.id, b.mine ?? null, b.q),
	apply: (s, b) => s.apply(b.id, b.final, !!b.self),
	keep: (s, b) => s.keep(b.id),
	resetP2: (s) => s.resetP2(),
	end: (s) => s.end(),
	replay: (s, b) => s.replay(Number(b.turn), String(b.text ?? "")),
};

export async function POST({ params, request }) {
	const u = learner();
	const held = sessions.get(params.id);
	const s = held?.owner === u.id ? held.session : null;
	if (!s) return Response.json({ error: "This session is gone (the server may have restarted). Start again." }, { status: 404 });
	// Development only: the revision thrown away and loaded again from its snapshot (lab/replay.mjs --reload).
	if (params.action === "reload" && dev) {
		held!.session = RevisionSession.restore(JSON.parse(JSON.stringify(s.snapshot())), s.ai);
		return Response.json({});
	}
	const fn = ACTIONS[params.action];
	if (!fn) return Response.json({ error: "unknown action" }, { status: 404 });
	const b = await request.json().catch(() => ({}));
	const t0 = Date.now();
	try {
		const out = (await fn(s, b)) ?? {};
		logSession(params.id, { t: t0, ms: Date.now() - t0, action: params.action, body: b, out });
		return Response.json(out);
	} catch (e) {
		console.error(e);
		logSession(params.id, { t: Date.now(), action: params.action, error: String(e) });
		// What stopped a model call, as the page shows it: no key, the key refused, or a failure a retry may fix.
		return Response.json({ error: String((e as Error)?.message ?? e), code: stopOf(e) }, { status: 500 });
	}
}
