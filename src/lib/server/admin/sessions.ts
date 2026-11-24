import { and, asc, count, desc, eq, inArray, ne, type SQL, sql, sum } from "drizzle-orm";
import type { CaseRow, RecordedCall, RecordedStep, SessionRow, SessionView, Signal, SignalKind } from "#lib/admin/records.ts";
import { unmark } from "#lib/review/faces.ts";
import { db } from "#lib/server/db/index.ts";
import { llmCall, llmPrompt, note, piece, pieceStep, reading, sessionCase, user } from "#lib/server/db/schema.ts";

/*
 * Session records (docs/design/2026-11-11-session-records.md): every piece that went into its revision, read from its
 * tape (`piece_step`) and its calls (`llm_call`), with signals derived from them and no model call; and collecting from
 * a reading, read from its calls alone while they are kept. Learners who do not help improve Libiamo are not listed
 * (their calls keep only numbers). A flag on a piece's step is a case; while a case is open, its piece's calls outlive
 * the thirty days (server/llm/records.ts).
 */
type Step = typeof pieceStep.$inferSelect;
// biome-ignore lint/suspicious/noExplicitAny: a step's body and response are the protocol's JSON, read defensively here
type Json = any;

const SLOW_MS = 8000;
/** A learner idle this long in an unfinished revision has left it. */
const LEFT_AFTER_MS = 60 * 60_000;

const text = (v: unknown) => (typeof v === "string" ? v : "");
const items = (doc: Json): string[] =>
	Array.isArray(doc) ? doc.flat().flatMap((x: Json) => (x && typeof x === "object" && typeof x.item === "string" ? [x.item] : [])) : [];

/** What one step was to the learner: a label, and the lines they read or wrote. */
export function readStep(s: Pick<Step, "action" | "body" | "response">): Pick<RecordedStep, "label" | "lines"> {
	const b = (s.body ?? {}) as Json;
	const r = (s.response ?? {}) as Json;
	const stop = text(b.id) ? ` ${text(b.id)}` : "";
	switch (s.action) {
		case "create":
			return {
				label: "Submitted",
				lines: [{ who: "me", text: text(b.text) }, ...(text(b.background) ? [{ who: "card" as const, text: `Note: ${b.background}` }] : [])],
			};
		case "scene":
			return {
				label: b.correction ? "Scene, corrected" : "Scene",
				lines: [
					...(text(b.correction) ? [{ who: "me" as const, text: text(b.correction) }] : []),
					{ who: "card", text: `${[r.site, r.community, r.reader && `read by ${r.reader}`].filter(Boolean).join(" · ")}\n${text(r.title)}` },
				],
			};
		case "pass1": {
			const all = items(r.doc);
			return { label: "Pass 1", lines: [{ who: "card", text: `${all.length} marks` }] };
		}
		case "pass1done": {
			const own = Object.values((b.own ?? {}) as Record<string, string>);
			const kept = Array.isArray(b.keep) ? b.keep.length : 0;
			return {
				label: "Pass 1 done",
				lines: [
					...(own.length ? [{ who: "me" as const, text: own.join("\n\n") }] : []),
					...(kept ? [{ who: "card" as const, text: `Kept ${kept} as written` }] : []),
				],
			};
		}
		case "overview": {
			const stops = Array.isArray(r.stops) ? r.stops : [];
			return { label: "Pass 2", lines: [{ who: "card", text: stops.map((x: Json) => `${x.id} · ${text(x.label)}`).join("\n") || "No stops" }] };
		}
		case "overviewReply":
			return { label: "Pass 2 begins", lines: text(b.said) ? [{ who: "me", text: text(b.said) }] : [] };
		case "material": {
			// The stop as it opened: the reader's reaction, what the tutor asked for, and the version it holds up.
			const meant = Array.isArray(b.meanings) ? b.meanings.filter((m: unknown) => typeof m === "string") : [];
			return {
				label: `Stop${stop}${meant.length ? " · another reading" : ""}`,
				lines: [
					...(meant.length ? [{ who: "me" as const, text: `I meant: ${meant.join("; ")}` }] : []),
					...(text(r.reader) ? [{ who: "reader" as const, text: text(r.reader) }] : []),
					...(text(r.prompt) ? [{ who: "tutor" as const, text: text(r.prompt) }] : []),
					// The reference's brackets mark its key words for the learner's page.
					...(text(r.ref) ? [{ who: "card" as const, text: [text(r.ref).replace(/[[\]]/g, ""), text(r.construct)].filter(Boolean).join("\n") }] : []),
				],
			};
		}
		case "hint":
			return { label: `Stop${stop} · hint`, lines: [{ who: "tutor", text: [text(r.plan), text(r.example)].filter(Boolean).join("\n\n") }] };
		case "pieces":
			return {
				label: `Stop${stop} · pieces`,
				lines: [{ who: "tutor", text: (Array.isArray(r) ? r : []).map((p: Json) => `${text(p.piece)}: ${text(p.gloss)}`).join("\n\n") }],
			};
		case "recall":
			return {
				label: `Stop${stop} · ${r.pass ? "recalled" : "try"}`,
				lines: [{ who: "me", text: text(b.attempt) }, ...(text(r.tutor) ? [{ who: "tutor" as const, text: text(r.tutor) }] : [])],
			};
		case "grade":
			return {
				label: `Stop${stop} · ${r.pass ? "passed" : "try"}`,
				lines: [
					{ who: "me", text: text(b.attempt) },
					...(text(r.success) || text(r.tutor) ? [{ who: "tutor" as const, text: text(r.success) || text(r.tutor) }] : []),
				],
			};
		case "own":
			return {
				label: `Stop${stop} · said it themselves`,
				lines: [{ who: "me", text: text(b.said) }, ...(text(r.reply) ? [{ who: "tutor" as const, text: text(r.reply) }] : [])],
			};
		case "question":
			return {
				label: `Stop${stop} · question`,
				lines: [
					{ who: "me", text: text(b.q) },
					{ who: "tutor", text: text(r.answer) },
				],
			};
		case "apply":
			return { label: `Stop${stop} · ${b.self ? "applied" : "took the tutor's"}`, lines: [{ who: "me", text: text(b.final) }] };
		case "keep":
			return { label: `Stop${stop} · kept as is`, lines: [] };
		case "replay":
			return {
				label: "Said again to the reader",
				lines: [{ who: "me", text: text(b.text) }, ...(text(r.text) ? [{ who: "reader" as const, text: text(r.text) }] : [])],
			};
		case "notes":
			return { label: "Notebook entries", lines: [{ who: "card", text: `${Object.keys(r ?? {}).length} entries` }] };
		case "end":
			return {
				label: "End",
				lines: [
					{ who: "card", text: text(r.text) },
					...(Array.isArray(r.issues) && r.issues.length ? [{ who: "card" as const, text: `Lost points: ${r.issues.length}` }] : []),
					...(text(r.closing) ? [{ who: "tutor" as const, text: text(r.closing) }] : []),
				],
			};
		case "resetP2":
			return { label: "Pass 2 again", lines: [] };
		default:
			return { label: s.action, lines: [] };
	}
}

/** Signals from the tape alone (the learner's pushback), with the calls' (the system's struggles). */
export function signalsOf(
	steps: Pick<Step, "action" | "body" | "response" | "ms">[],
	/** `slowestMs`: the slowest step of a session whose steps are not given (collecting: its calls). */
	o: { finished: boolean; lastAt: number; now: number; failedCalls: number; cost: number; medianCost: number; slowestMs?: number },
): Signal[] {
	const n = (a: string) => steps.filter((s) => s.action === a).length;
	const out: Signal[] = [];
	const add = (kind: SignalKind, k: number) => k > 0 && out.push(k > 1 ? { kind, n: k } : { kind });
	add("kept", n("keep"));
	add("own", n("own"));
	add("question", n("question"));
	// Failed tries in a row at one stop.
	let run = 0;
	let worst = 0;
	let at = "";
	for (const s of steps) {
		if (s.action !== "grade" && s.action !== "recall") continue;
		const id = text((s.body as Json)?.id);
		const pass = !!(s.response as Json)?.pass;
		run = id === at && !pass ? run + 1 : pass ? 0 : 1;
		at = id;
		worst = Math.max(worst, run);
	}
	if (worst >= 3) out.push({ kind: "tries", n: worst });
	if (steps.some((s) => s.action === "apply" && !(s.body as Json)?.self)) out.push({ kind: "answer" });
	if (!o.finished && o.now - o.lastAt > LEFT_AFTER_MS) out.push({ kind: "left" });
	add("failed", o.failedCalls);
	const end = steps.find((s) => s.action === "end");
	const issues = (end?.response as Json)?.issues;
	if (Array.isArray(issues) && issues.length) out.push({ kind: "lost" });
	const slowest = Math.max(o.slowestMs ?? 0, ...steps.map((s) => s.ms ?? 0));
	if (slowest > SLOW_MS) out.push({ kind: "slow", n: Math.round(slowest / 1000) });
	if (o.medianCost > 0 && o.cost > 3 * o.medianCost) out.push({ kind: "cost" });
	return out;
}

const stopsOf = (response: unknown) => {
	const stops = (response as Json)?.stops;
	return Array.isArray(stops) ? stops.length : 0;
};

const KIND: Record<string, SessionRow["kind"]> = { own: "own", scenario: "scenario", translation: "translation" };

type Scope = { limit?: number; ids?: string[] };
const median = (xs: number[]) => {
	const sorted = xs.toSorted((a, b) => a - b);
	return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/** Every session, newest first: the pieces that went into a revision, and collecting from readings. */
export async function sessions(o: Scope = {}, now = new Date()): Promise<SessionRow[]> {
	const [pieces, readings] = await Promise.all([pieceSessions(o, now), readingSessions(o)]);
	return [...pieces, ...readings].toSorted((a, b) => b.at.localeCompare(a.at)).slice(0, o.limit ?? 200);
}

/** The pieces that went into a revision, newest first, from learners who help improve Libiamo. */
async function pieceSessions(o: Scope, now: Date): Promise<SessionRow[]> {
	const rows = await db
		.select({ p: piece, learner: user.name, native: user.nativeLanguage })
		.from(piece)
		.innerJoin(user, eq(user.id, piece.userId))
		.where(
			and(
				ne(piece.state, "writing"),
				eq(user.helpImprove, true),
				o.ids ? inArray(piece.id, o.ids) : undefined,
				sql`exists (select 1 from ${pieceStep} where ${pieceStep.pieceId} = ${piece.id})`,
			),
		)
		.orderBy(desc(piece.updatedAt))
		.limit(o.limit ?? 200);
	if (!rows.length) return [];
	const ids = rows.map((r) => r.p.id);
	const length = (doc: SQL) => sql<number | null>`case when jsonb_typeof(${doc}) = 'array' then jsonb_array_length(${doc}) end`;
	const [slim, calls, cases] = await Promise.all([
		// Only what the list's signals read of each step (its documents stay in the database): which stop, whether it
		// passed or was the learner's own, how many issues or stops.
		db
			.select({
				pieceId: pieceStep.pieceId,
				action: pieceStep.action,
				ms: pieceStep.ms,
				at: pieceStep.at,
				stop: sql<string | null>`${pieceStep.body}->>'id'`,
				// The body is what the page sent: compared, never cast, so a stray value cannot fail the list.
				self: sql<boolean | null>`${pieceStep.body}->'self' = 'true'::jsonb`,
				pass: sql<boolean | null>`(${pieceStep.response}->>'pass')::boolean`,
				issues: length(sql`${pieceStep.response}->'issues'`),
				stops: length(sql`${pieceStep.response}->'stops'`),
			})
			.from(pieceStep)
			.where(inArray(pieceStep.pieceId, ids))
			.orderBy(asc(pieceStep.pieceId), asc(pieceStep.seq)),
		db
			.select({
				pieceId: llmCall.pieceId,
				n: count(),
				cost: sum(llmCall.costUsd),
				failed: sql<number>`count(*) filter (where ${llmCall.state} = 'failed')::int`,
				kept: sql<number>`count(${llmCall.messages})::int`,
			})
			.from(llmCall)
			.where(inArray(llmCall.pieceId, ids))
			.groupBy(llmCall.pieceId),
		db
			.select({ pieceId: sessionCase.pieceId, n: count() })
			.from(sessionCase)
			.where(and(inArray(sessionCase.pieceId, ids), eq(sessionCase.status, "open")))
			.groupBy(sessionCase.pieceId),
	]);
	// The steps as signalsOf reads them, rebuilt from those fields.
	const list = (n: number | null) => (n === null ? undefined : Array.from({ length: n }, () => 0));
	const steps = slim.map((s) => ({
		pieceId: s.pieceId,
		action: s.action,
		ms: s.ms,
		at: s.at,
		body: { id: s.stop ?? undefined, self: s.self ?? undefined },
		response: { pass: s.pass ?? undefined, issues: list(s.issues), stops: list(s.stops) },
	}));
	const callsOf = new Map(calls.map((c) => [c.pieceId as string, c]));
	const casesOf = new Map(cases.map((c) => [c.pieceId, c.n]));
	const stepsOf = Map.groupBy(steps, (s) => s.pieceId);
	const medianCost = median(calls.map((c) => Number(c.cost ?? 0)));
	return rows.map(({ p, learner, native }) => {
		const st = stepsOf.get(p.id) ?? [];
		const c = callsOf.get(p.id);
		const first = st[0]?.at.getTime() ?? p.createdAt.getTime();
		const last = st.at(-1)?.at.getTime() ?? first;
		const overview = st.findLast((s) => s.action === "overview");
		const cost = Number(c?.cost ?? 0);
		return {
			id: p.id,
			learner,
			lang: p.language,
			native: native ?? "",
			kind: KIND[p.kind] ?? "own",
			site: p.place,
			title: p.title,
			at: new Date(first).toISOString(),
			minutes: Math.max(1, Math.round((last - first) / 60_000)),
			stops: stopsOf(overview?.response),
			calls: c?.n ?? 0,
			cost,
			finished: p.state === "finished",
			signals: signalsOf(st, { finished: p.state === "finished", lastAt: last, now: now.getTime(), failedCalls: c?.failed ?? 0, cost, medianCost }),
			callsKept: (c?.kept ?? 0) > 0,
			sha: p.sha ?? "",
			cases: casesOf.get(p.id) ?? 0,
		};
	});
}

/**
 * Collecting from what learners read, newest first: each reading of a learner who helps improve Libiamo while it has
 * calls kept (they go after thirty days, and the reading with them from this list), every one with its words. A call
 * made while they did not help is recorded without them but still names its reading: such a reading is never shown,
 * or what they read and kept then would be, read from the reading and the notebook.
 */
async function readingSessions(o: Scope): Promise<SessionRow[]> {
	const rows = await db
		.select({ r: reading, learner: user.name, native: user.nativeLanguage })
		.from(reading)
		.innerJoin(user, eq(user.id, reading.userId))
		.where(
			and(
				eq(user.helpImprove, true),
				o.ids ? inArray(reading.id, o.ids) : undefined,
				sql`exists (select 1 from ${llmCall} where ${llmCall.readingId} = ${reading.id})`,
				sql`not exists (select 1 from ${llmCall} where ${llmCall.readingId} = ${reading.id} and ${llmCall.messages} is null)`,
			),
		)
		.orderBy(desc(reading.createdAt))
		.limit(o.limit ?? 200);
	if (!rows.length) return [];
	const ids = rows.map((r) => r.r.id);
	const [calls, notes] = await Promise.all([
		db
			.select({
				readingId: llmCall.readingId,
				n: count(),
				cost: sum(llmCall.costUsd),
				failed: sql<number>`count(*) filter (where ${llmCall.state} = 'failed')::int`,
				kept: sql<number>`count(${llmCall.messages})::int`,
				last: sql<string>`max(${llmCall.createdAt})`,
				slowest: sql<number>`coalesce(max(${llmCall.latencyMs}), 0)::int`,
			})
			.from(llmCall)
			.where(inArray(llmCall.readingId, ids))
			.groupBy(llmCall.readingId),
		db
			.select({ readingId: note.readingId, n: count() })
			.from(note)
			.where(and(inArray(note.readingId, ids), sql`${note.deletedAt} is null`))
			.groupBy(note.readingId),
	]);
	const callsOf = new Map(calls.map((c) => [c.readingId as string, c]));
	const keptOf = new Map(notes.map((n) => [n.readingId as string, n.n]));
	const medianCost = median(calls.map((c) => Number(c.cost ?? 0)));
	return rows.map(({ r, learner, native }) => {
		const c = callsOf.get(r.id);
		const cost = Number(c?.cost ?? 0);
		const last = c?.last ? new Date(c.last).getTime() : r.createdAt.getTime();
		const line = r.text.trim().split("\n")[0] ?? "";
		return {
			id: r.id,
			learner,
			lang: r.language,
			native: native ?? "",
			kind: "collect" as const,
			site: r.place ?? "Pasted",
			title: line.length > 90 ? `${line.slice(0, 90)}…` : line,
			at: r.createdAt.toISOString(),
			minutes: Math.max(1, Math.round((last - r.createdAt.getTime()) / 60_000)),
			stops: keptOf.get(r.id) ?? 0,
			calls: c?.n ?? 0,
			cost,
			finished: true,
			signals: signalsOf([], { finished: true, lastAt: last, now: last, failedCalls: c?.failed ?? 0, cost, medianCost, slowestMs: c?.slowest }),
			callsKept: (c?.kept ?? 0) > 0,
			sha: "",
			cases: 0,
		};
	});
}

type CallRow = { c: typeof llmCall.$inferSelect; system: string | null };
/** The calls as the session page shows them, timed from `t0`. */
function recordedCalls(calls: CallRow[], t0: number): RecordedCall[] {
	return calls.map(({ c, system }, i) => {
		const messages = Array.isArray(c.messages) ? (c.messages as RecordedCall["messages"]) : [];
		return {
			id: i + 1,
			purpose: c.purpose || c.tag,
			tag: c.tag,
			model: c.model,
			effort: c.effort ?? "",
			state: c.state as RecordedCall["state"],
			// A call starts when it was written minus how long it took.
			at: Math.max(0, (c.createdAt.getTime() - (c.latencyMs ?? 0) - t0) / 1000),
			ms: c.latencyMs ?? 0,
			tokens: { input: c.promptTokens ?? 0, output: c.completionTokens ?? 0 },
			cost: c.costUsd ?? 0,
			messages: system && messages.length ? [{ role: "system", content: system }, ...messages] : messages,
			output: c.output ?? "",
			...(c.error ? { error: c.error } : {}),
		};
	});
}

/**
 * One collecting call as a step: what was highlighted and what came back (server/notebook/collect.ts `explain`, whose
 * prompt lists the highlights as `1. "words"`), or the learner's question and the answer (`ask`).
 */
export function readCollectCall(
	c: Pick<typeof llmCall.$inferSelect, "tag" | "messages" | "output" | "error">,
): Pick<RecordedStep, "label" | "lines"> {
	const messages = (Array.isArray(c.messages) ? c.messages : []) as { role: string; content: string }[];
	const asked = messages.findLast((m) => m.role === "user")?.content ?? "";
	const failed = c.error ? [{ who: "card" as const, text: `Failed: ${c.error}` }] : [];
	if (!messages.length) return { label: c.tag, lines: [{ who: "card", text: "Its words were not kept" }] };
	if (c.tag === "collect/ask")
		return { label: "Question", lines: [{ who: "me", text: asked }, ...(c.output ? [{ who: "tutor" as const, text: c.output }] : []), ...failed] };
	if (c.tag !== "collect/explain")
		return { label: c.tag, lines: [{ who: "me", text: asked }, ...(c.output ? [{ who: "tutor" as const, text: c.output }] : []), ...failed] };
	// The list after the passage (not lines of the passage that look alike); a highlight may run over lines.
	const head = "Highlights:\n";
	const from = asked.lastIndexOf(head);
	const listed = from < 0 ? "" : asked.slice(from + head.length).split("\n\nFor each highlight")[0];
	const marked = listed
		.split(/\n(?=\d+\. ")/)
		.map((l) => l.match(/^\d+\. "([\s\S]*)"$/)?.[1])
		.filter((x) => x !== undefined);
	let items: Json[] = [];
	try {
		const out = c.output ?? "";
		const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
		if (Array.isArray(parsed?.items)) items = parsed.items;
	} catch {
		// Shown as it came.
	}
	// The page sets each paragraph ("\n\n") apart and runs single lines together.
	const filled = items.length
		? items.flatMap((it) => [`${text(it.phrase)}: ${text(it.meaning)}`, text(it.why), unmark(text(it.example)).text].filter(Boolean)).join("\n\n")
		: (c.output ?? "");
	return {
		label: marked.length === 1 ? "Highlighted 1" : `Highlighted ${marked.length}`,
		lines: [
			...(marked.length ? [{ who: "me" as const, text: marked.join(" · ") }] : []),
			...(filled ? [{ who: "tutor" as const, text: filled }] : []),
			...failed,
		],
	};
}

/** One session: its row, its steps as the learner saw them, every call (system prompts from `llm_prompt`). */
export async function sessionOf(id: string): Promise<SessionView | null> {
	const [row] = await sessions({ ids: [id] });
	if (!row) return null;
	return row.kind === "collect" ? collectingOf(row) : revisionOf(row);
}

/** Collecting from a reading: what was pasted, each call as a step, and the phrases it left in the notebook. */
async function collectingOf(row: SessionRow): Promise<SessionView | null> {
	const [[r], calls, notes] = await Promise.all([
		db.select({ text: reading.text, at: reading.createdAt }).from(reading).where(eq(reading.id, row.id)),
		db
			.select({ c: llmCall, system: llmPrompt.text })
			.from(llmCall)
			.leftJoin(llmPrompt, eq(llmPrompt.hash, llmCall.promptHash))
			.where(eq(llmCall.readingId, row.id))
			.orderBy(asc(llmCall.createdAt)),
		db
			.select({ phrase: note.phrase, meaning: note.meaning, deletedAt: note.deletedAt })
			.from(note)
			.where(eq(note.readingId, row.id))
			.orderBy(asc(note.id)),
	]);
	if (!r) return null;
	const t0 = r.at.getTime();
	const callRecords = recordedCalls(calls, t0);
	const steps: RecordedStep[] = [
		{ id: "pasted", at: 0, label: "Pasted", lines: [{ who: "me", text: r.text }], calls: [] },
		...calls.map(({ c }, i): RecordedStep => {
			const ms = c.latencyMs ?? 0;
			return {
				id: String(i + 1),
				at: callRecords[i].at,
				...readCollectCall(c),
				calls: [i + 1],
				...(ms > 1000 ? { wait: ms / 1000 } : {}),
				...(ms > SLOW_MS ? { signals: ["slow" as const] } : {}),
			};
		}),
	];
	if (notes.length)
		steps.push({
			id: "kept",
			at: callRecords.at(-1)?.at ?? 0,
			label: "In the notebook",
			lines: [{ who: "card", text: notes.map((n) => `${n.phrase}: ${n.meaning}${n.deletedAt ? " (removed)" : ""}`).join("\n") }],
			calls: [],
		});
	return { ...row, reader: "Reader", callRecords, steps };
}

/** A piece's revision: its tape, its calls and its cases. */
async function revisionOf(row: SessionRow): Promise<SessionView> {
	const pieceId = row.id;
	const [steps, calls, cases] = await Promise.all([
		db.select().from(pieceStep).where(eq(pieceStep.pieceId, pieceId)).orderBy(asc(pieceStep.seq)),
		db
			.select({ c: llmCall, system: llmPrompt.text })
			.from(llmCall)
			.leftJoin(llmPrompt, eq(llmPrompt.hash, llmCall.promptHash))
			.where(eq(llmCall.pieceId, pieceId))
			.orderBy(asc(llmCall.createdAt)),
		db
			.select({ c: sessionCase, by: user.name })
			.from(sessionCase)
			.leftJoin(user, eq(user.id, sessionCase.createdBy))
			.where(eq(sessionCase.pieceId, pieceId))
			.orderBy(asc(sessionCase.id)),
	]);
	const t0 = steps[0]?.at.getTime() ?? 0;
	const recorded = recordedCalls(calls, t0);
	const callIds = (seq: number) => calls.flatMap(({ c }, i) => (c.stepSeq === seq ? [i + 1] : []));
	const scene = steps.findLast((s) => s.action === "scene");
	return {
		...row,
		reader: text((scene?.response as Json)?.reader) || "Reader",
		callRecords: recorded,
		steps: steps.map((s) => {
			const kase = cases.find((x) => x.c.stepSeq === s.seq);
			return {
				id: String(s.seq),
				at: (s.at.getTime() - t0) / 1000,
				...readStep(s),
				calls: callIds(s.seq),
				...(s.ms && s.ms > 1000 ? { wait: s.ms / 1000 } : {}),
				...(s.ms && s.ms > SLOW_MS ? { signals: ["slow" as const] } : {}),
				...(kase ? { flag: { note: kase.c.note, by: kase.by ?? "", at: kase.c.createdAt.toISOString(), case: kase.c.id } } : {}),
			};
		}),
	};
}

export async function openCase(pieceId: string, stepSeq: number, note: string, by: string) {
	const [row] = await db.insert(sessionCase).values({ pieceId, stepSeq, note, createdBy: by }).returning({ id: sessionCase.id });
	return row.id;
}

export async function setCase(id: number, status: CaseRow["status"], commit: string | null) {
	await db
		.update(sessionCase)
		.set({ status, commit: status === "fixed" ? commit : null, closedAt: status === "open" ? null : new Date() })
		.where(eq(sessionCase.id, id));
}

export async function cases(): Promise<CaseRow[]> {
	const rows = await db
		.select({ c: sessionCase, by: user.name, title: piece.title, action: pieceStep.action, body: pieceStep.body })
		.from(sessionCase)
		.innerJoin(piece, eq(piece.id, sessionCase.pieceId))
		.leftJoin(user, eq(user.id, sessionCase.createdBy))
		.leftJoin(pieceStep, and(eq(pieceStep.pieceId, sessionCase.pieceId), eq(pieceStep.seq, sessionCase.stepSeq)))
		.orderBy(desc(sessionCase.id));
	return rows.map(({ c, by, title, action, body }) => ({
		id: c.id,
		session: c.pieceId,
		title,
		step: String(c.stepSeq ?? ""),
		stepLabel: action ? readStep({ action, body, response: null }).label : "The session",
		note: c.note,
		by: by ?? "",
		at: c.createdAt.toISOString(),
		status: c.status as CaseRow["status"],
		...(c.commit ? { commit: c.commit } : {}),
	}));
}
