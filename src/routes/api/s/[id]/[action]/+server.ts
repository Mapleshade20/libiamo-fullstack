import { learner } from "#lib/server/guard.ts";
import { stopOf } from "#lib/server/llm/transport.ts";
import type { RevisionSession } from "#lib/server/revision/revision.ts";
import {
	act,
	bookmark,
	dropRevision,
	fileNotes,
	finishPiece,
	openRevision,
	pieceFor,
	reloadRevision,
	updatePiece,
} from "#lib/server/revision/store.ts";
import { NoteAsk, StandIn } from "#lib/server/writing/learned.ts";
import { dev } from "$app/env";

// Each action is one step of the revision page's flow (src/lib/session/session.svelte.ts); `id` is the piece's.
// biome-ignore lint/suspicious/noExplicitAny: request bodies are checked by the revision's methods.
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
	end: (s, b) => s.end(b.notes ? NoteAsk.safeParse(b.notes).data : undefined),
	replay: (s, b) => s.replay(Number(b.turn), String(b.text ?? "")),
};

const UUID = /^[0-9a-f-]{36}$/;

export async function POST({ params, request }) {
	const u = learner();
	const p = UUID.test(params.id) ? await pieceFor(u.id, params.id) : null;
	if (!p) return Response.json({ error: "No such piece." }, { status: 404 });
	// Coming back to a finished piece is coming back to its page.
	if (params.action === "resume" && p.state === "finished") return Response.json({ finished: true });
	const h = await openRevision(u, params.id);
	if (!h) return Response.json({ error: "This revision is gone. Start again." }, { status: 404 });
	// Where the page was, with what it was started from; and the page's bookmark. Neither is a step on the tape.
	if (params.action === "resume") {
		const i = h.session.input;
		const setup = {
			text: i.text,
			background: i.background,
			source: i.source,
			detail: i.detail,
			learner: i.learner,
			feedback: i.feedback,
			lang: p.language,
			exchange: i.exchange,
			translation: i.translation,
			scenario: p.scenarioId ? { id: p.scenarioId, title: p.title, site: p.place } : undefined,
		};
		return Response.json({ setup, ...h.session.resume() });
	}
	if (params.action === "progress") {
		try {
			bookmark(h, await request.json());
			return Response.json({});
		} catch (e) {
			return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
		}
	}
	// Development only: the revision thrown away and loaded again from its snapshot (lab/replay.mjs --reload).
	if (params.action === "reload" && dev) {
		reloadRevision(h);
		return Response.json({});
	}
	const fn = ACTIONS[params.action];
	if (!fn) return Response.json({ error: "unknown action" }, { status: 404 });
	const b = await request.json().catch(() => ({}));
	try {
		const out = await act(params.id, h, params.action, b, async (s) => (await fn(s, b)) ?? {});
		if (params.action === "scene") {
			const sc = h.session.scene;
			await updatePiece(params.id, { title: sc.title || undefined, place: sc.site || sc.platform, language: sc.target });
		}
		if (params.action === "end") {
			// The piece is finished: what its page shows is on its row from now on. Its notebook entries are written next,
			// on the server; what pass 2 reworked stands in until they are.
			const e = out as Awaited<ReturnType<RevisionSession["end"]>>;
			const ask = h.session.noteAsk;
			const asking = !!ask && ask.items.length + ask.p1.length > 0;
			await finishPiece(u, params.id, {
				final: e.text,
				closing: e.closing || null,
				leftovers: e.issues.map((x) => ({ quote: x.quote, note: x.note })),
				reader: h.session.scene?.reader ?? null,
				authentic: h.session.input.translation?.original ?? null,
				learned: StandIn.safeParse(b.learned).data ?? [],
				notesRequestedAt: asking ? new Date() : null,
			});
			// Nothing to file: the revision is not needed again (a page that sends no request, a replay, asks `notes` itself).
			if (asking) void fileNotes(u, params.id);
			else if (ask) await dropRevision(params.id);
		}
		return Response.json(out);
	} catch (e) {
		console.error(e);
		// What stopped a model call, as the page shows it: no key, the key refused, or a failure a retry may fix.
		return Response.json({ error: String((e as Error)?.message ?? e), code: stopOf(e) }, { status: 500 });
	}
}
