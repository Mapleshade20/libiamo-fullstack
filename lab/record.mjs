// Records the replay baseline: plays each case in lab/baseline/cases.json against a running server as the session page
// would (src/lib/session/session.svelte.ts), with a scripted learner whose choices rotate so that between them the cases
// take every branch of the protocol. Each session's steps go to lab/baseline/sessions/<case>.jsonl, and the server
// writes the replies to its cache, which is the baseline's:
//
//   LLM_CACHE_DIR=lab/baseline/cache ORIGIN=http://127.0.0.1:5180 pnpm dev --port 5180
//   COOKIE="better-auth.session_token=..." node lab/record.mjs http://127.0.0.1:5180 [case ...]
//
// It spends (about four cents a case on Claude Haiku): every call the cache does not hold reaches the provider. A
// prompt changed on purpose means recording the cases again (delete lab/baseline/cache first, or it keeps stale replies).
//
// The scripted learner takes THINK seconds (default 45) to write each version, as a real one does: what the page
// prepares meanwhile in the background (the next spot's material) is then ready before they go on, as it is in a replay,
// where every reply comes from the cache at once. Without it the two can ask in a different order, and a replay differs.
import { readFileSync, writeFileSync } from "node:fs";

const [origin, ...only] = process.argv.slice(2);
if (!origin) {
	console.error("usage: node lab/record.mjs <origin> [case ...]");
	process.exit(2);
}
const THINK = Number(process.env.THINK ?? 45) * 1000;
const think = () => new Promise((r) => setTimeout(r, THINK));
const cases = JSON.parse(readFileSync(new URL("./baseline/cases.json", import.meta.url), "utf8"));
const SEP = "* * *";
const plain = (s) => String(s ?? "").replace(/\[([^\]]+)\]/g, "$1");
const norm = (x) =>
	x
		.trim()
		.replace(/\s+/g, " ")
		.replace(/[.!?…。！？]+$/, "")
		.replace(/’/g, "'")
		.toLowerCase();

async function post(path, body) {
	const r = await fetch(`${origin}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", cookie: process.env.COOKIE ?? "" },
		body: JSON.stringify(body ?? {}),
	});
	const v = await r.json().catch(() => null);
	if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(v)?.slice(0, 300)}`);
	return v;
}

/** The post as the page holds it: the text of an item, and the whole text. */
const atomText = (a, carried) => (typeof a === "string" ? a : a.carry ? (carried[a.carry] ?? a.text) : a.choice ? a.choice[0] : "");
const segText = (s, carried) =>
	typeof s === "string" ? s : s.item ? s.parts.map((a) => atomText(a, carried)).join("") : (carried[s.carry] ?? s.text);
const itemText = (doc, id, carried) => {
	for (const para of doc ?? []) for (const s of para) if (typeof s === "object" && s.item === id) return segText(s, carried);
	return null;
};
const docText = (doc, carried) => (doc ?? []).map((p) => p.map((s) => segText(s, carried)).join("")).join("\n\n");

/** What the learner says, in their language. */
const SAY = {
	"zh-CN": { q: "为什么不能保留我原来的说法？", again: "我再试一次。" },
	en: { q: "Why can't I keep what I wrote?", again: "Let me try again." },
};

async function play(c, seed) {
	const b = c.body;
	const say = SAY[b.learner] ?? SAY.en;
	const created = { ...b, background: b.background ?? "", detail: b.detail ?? "needed", noCache: false };
	const { id } = await post("/api/s", created);
	const tape = [{ action: "create", body: created }];
	const api = async (action, body = {}) => {
		const out = await post(`/api/s/${id}/${action}`, body);
		tape.push({ action, body, out });
		return out;
	};
	const log = (...x) => console.log(`  ${c.name}:`, ...x);
	const carried = {};

	/* The scene, corrected once when the case says so. */
	await api("scene");
	if (c.correction) await api("scene", { correction: c.correction });

	/* Pass 1: each card answered in turn; fixes rotate through right, revealed and kept. */
	const p1 = await api("pass1", { detail: b.detail ?? "needed" });
	const kept = new Set();
	const outcomes = [];
	let turn = seed;
	for (const [i, st] of p1.stops.entries()) {
		const o = {};
		outcomes[i] = o;
		if (st.kind === "choice") Object.assign(o, { self: true, ok: turn++ % 3 !== 2 });
		else if (st.kind === "fix") {
			const r = turn++ % 3;
			const right = Object.entries(st.answers ?? {}).find(([, v]) => v.ok)?.[0];
			if (r === 0 && right) {
				carried[st.item] = right;
				Object.assign(o, { self: true, ok: true });
			} else if (r === 2) {
				kept.add(st.item);
				o.kept = true;
			} else Object.assign(o, { self: false, ok: null });
		} else if (st.kind === "replace" || st.kind === "link") {
			if (turn++ % 4 === 3) {
				kept.add(st.item);
				o.kept = true;
			}
		} else if (st.kind === "defer") o.deferred = true;
		else if (st.kind === "tick") o.kept = true;
	}
	const done1 = await api("pass1done", { own: { ...carried }, keep: [...kept] });
	let doc = done1.doc;
	log(`pass 1: ${p1.stops.length} stops, ${Object.keys(carried).length} own, ${kept.size} kept`);

	/* Pass 2's plan. */
	await api("resetP2");
	const scenario = !!(b.exchange || b.translation);
	const ov = await api("overview");
	const landed = ov.turns ?? [];
	const plan = await api("overviewReply", { said: scenario ? null : (c.said ?? null) });
	doc = plan.doc;
	const spots = plan.stops;
	log(`pass 2: ${spots.length} spots`);

	/* Each spot: how the learner goes about it rotates (seed + its index). */
	const BEHAVIOURS = ["pass", "help", "struggle", "reading", "own", "keep"];
	const results = {};
	for (const [n, S] of spots.entries()) {
		if (itemText(doc, S.id, carried) === null) continue;
		const before = itemText(doc, S.id, carried);
		const how = BEHAVIOURS[(seed + n) % BEHAVIOURS.length];
		let M = await api("material", { id: S.id });
		if (M.doc) doc = M.doc;
		await think();
		const meanings = S.parts.map((p) => p.readings[0]?.meaning ?? p.problem);
		let changed = false;
		let keepIt = false;
		for (const [k, part] of S.parts.entries()) {
			if (b.translation || part.mode === "given") continue;
			const open = part.mode !== "one" && !part.readings.length;
			if (how === "keep" && !open) {
				keepIt = true;
				break;
			}
			if (how === "own" || open) {
				const said = part.readings.at(-1)?.meaning ?? part.problem;
				const r = await api("own", { id: S.id, k, said });
				if (r.fine) {
					keepIt = true;
					break;
				}
				meanings[k] = r.reading;
				changed = true;
			} else if (how === "reading" && part.readings.length > 1) {
				meanings[k] = part.readings[1].meaning;
				changed = true;
			}
		}
		if (keepIt) {
			results[S.id] = { kept: true };
			doc = (await api("keep", { id: S.id })).doc;
			log(`${S.id} ${how}: kept`);
			continue;
		}
		if (changed) {
			M = await api("material", { id: S.id, meanings });
			if (M.doc) doc = M.doc;
		}
		let text = "";
		let gave = false;
		let self = true;
		let tries = 0;
		let hinted = false;
		const grade = async (attempt) => {
			const g = await api("grade", { id: S.id, attempt });
			if (!g.pass) tries++;
			return g;
		};
		const ref = () => {
			const r = plain(M.ref);
			return /⟨[^⟩]*⟩/.test(r) ? r.replace(/⟨([^⟩]*)⟩/g, "$1") : r;
		};
		if (how === "help") {
			// Both hints, a look at the pieces, then the answer given.
			hinted = true;
			await api("hint", { id: S.id });
			await api("pieces", { id: S.id });
			await api("hint", { id: S.id });
			text = ref();
			gave = true;
			self = false;
		} else if (how === "struggle") {
			// The first words again, twice (the second failure brings the first hint), then a question, then the reference.
			const first = M.orig || before || "";
			const g1 = await grade(first);
			if (!g1.pass) {
				const g2 = await grade(first);
				if (!g2.pass) {
					hinted = true;
					await api("hint", { id: S.id });
				}
			}
			const ans = await api("question", { id: S.id, mine: first, q: say.q });
			if (ans.kind === "meaning") {
				M = await api("material", { id: S.id, meanings: [ans.meaning] });
				if (M.doc) doc = M.doc;
				await grade(first);
			} else if (ans.kind === "ref") M = { ...M, ref: ans.ref };
			if (ans.kind === "keep") {
				results[S.id] = { kept: true };
				doc = (await api("keep", { id: S.id })).doc;
				log(`${S.id} ${how}: kept after asking`);
				continue;
			}
			text = ref();
		} else {
			// Writes the reference (or an alternative) and keeps their own.
			const alt = M.alts?.[0] ? plain(M.alts[0]) : null;
			text = (n % 2 && alt) || ref();
			const g = await grade(text);
			if (!g.pass) text = ref();
		}
		const out = await api("apply", { id: S.id, final: text, self });
		doc = out.newDoc;
		results[S.id] = { text, self, gave, tries, hinted, before, orig: M.orig ?? undefined, construct: M.construct };
		log(`${S.id} ${how}: applied${gave ? " (given)" : ""}${tries ? `, ${tries} failed` : ""}`);
	}

	/* Say it again: the parts that took most help, up to three. */
	const offTurns = new Set(landed.filter((t) => !t.ok && t.cause !== "reader").map((t) => t.t));
	const inOff = (sid) => offTurns.has(spots.find((s) => s.id === sid)?.who?.turn ?? -1);
	const help = (r) => (r.gave || r.skipped ? 3 : 0) + (r.tries ?? 0) + (r.hinted ? 1 : 0);
	const picks = Object.entries(results)
		.filter(([, r]) => r.text && (r.orig || r.before) && !r.kept && help(r) > 0)
		.sort(([a, x], [z, y]) => help(y) - help(x) || Number(inOff(z)) - Number(inOff(a)))
		.slice(0, 3);
	for (const [i, [sid, r]] of picks.entries()) {
		if (i === 2) continue; // skipped
		const said = i === 0 ? (r.orig || r.before).trim() : `${r.text.trim().replace(/[.。]$/, "")}!`;
		if (norm(said) === norm(r.text)) continue;
		await api("recall", { id: sid, attempt: said });
	}

	/* A scenario's first rewritten turn that went off, answered again. */
	if (b.exchange) {
		const rewritten = new Set(
			Object.entries(results)
				.filter(([, r]) => r.text && !r.kept)
				.map(([sid]) => spots.find((s) => s.id === sid)?.who?.turn),
		);
		const t = landed.find((x) => !x.ok && x.cause !== "reader" && rewritten.has(x.t))?.t;
		const text = t ? (docText(doc, carried).split(`\n\n${SEP}\n\n`)[t - 1]?.trim() ?? "") : "";
		if (t && text) await api("replay", { turn: t, text });
	}

	/* The end, and the notes. */
	await api("end");
	const done = spots.flatMap((s) => (results[s.id] ? [{ id: s.id, ...results[s.id] }] : []));
	const own = done.filter((r) => r.text && r.self && !r.skipped);
	const given = done.filter((r) => r.text && (r.gave || r.skipped));
	const p1items = p1.stops.flatMap((st, i) => {
		const o = outcomes[i] ?? {};
		if (o.kept || o.deferred || st.kind === "quiet" || st.kind === "tick" || st.kind === "defer") return [];
		if ((st.kind === "fix" || st.kind === "choice") && o.self && o.ok) return [];
		return st.kind === "group" ? (st.parts ?? []).map((p) => p.item) : [st.item];
	});
	if (own.length + given.length + p1items.length)
		await api("notes", { items: [...own, ...given].map((r) => ({ id: r.id, orig: r.orig || r.before || "", final: r.text ?? "" })), p1: p1items });
	writeFileSync(new URL(`./baseline/sessions/${c.name}.jsonl`, import.meta.url), tape.map((x) => `${JSON.stringify(x)}\n`).join(""));
}

let failed = 0;
for (const [i, c] of cases.entries()) {
	if (only.length && !only.includes(c.name)) continue;
	const t0 = Date.now();
	try {
		await play(c, i);
		console.log(`${c.name}: recorded (${Math.round((Date.now() - t0) / 1000)} s)`);
	} catch (e) {
		failed++;
		console.log(`${c.name}: FAILED ${e.message}`);
	}
}
process.exit(failed ? 1 : 0);
