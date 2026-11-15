// Reproducing a case in development (docs/design/2026-11-11-session-records.md):
//
//   pnpm case pull <piece>                  copies a piece's record into cases/<piece>/ (git-ignored) and seeds
//                                           cases/cache/ with its recorded replies, keyed as the transport keys requests
//   pnpm case replay <origin> <piece>...    plays each case's tape against a server answering from cases/cache
//   pnpm case replay <origin> --all|--open  every pulled case, or those with a case still open
//
// `pull` reads CASE_DATABASE_URL (production, read only), else DATABASE_URL. Replay on a server started with
// LLM_CACHE_DIR=cases/cache (not cache-only: a prompt changed since gets a fresh call, on the account's key) and
// COOKIE set to a session cookie of an account with a key (lab/account.mjs). A call whose prompt is unchanged gets its
// recorded reply, so the replay costs nothing until the code differs; it stops at the first step whose answer differs
// from the tape and shows both. Calls of learners who do not help improve Libiamo kept no words: those cannot be
// seeded, and replay calls the provider for them.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const ROOT = new URL("../cases/", import.meta.url).pathname;
const CACHE = join(ROOT, "cache");
const [command, ...args] = process.argv.slice(2);
const UUID = /^[0-9a-f-]{36}$/;

/** The key server/llm/cache.ts gives a request: model, effort, sample, messages. */
const cacheHash = (k) =>
	createHash("sha256")
		.update(JSON.stringify({ model: k.model, effort: k.effort, sample: k.sample, messages: k.messages }))
		.digest("hex")
		.slice(0, 24);

async function pull(id) {
	if (!UUID.test(id)) throw new Error(`not a piece id: ${id}`);
	const sql = postgres(process.env.CASE_DATABASE_URL || process.env.DATABASE_URL, { max: 1 });
	try {
		const [p] = await sql`select id, language, kind, scenario_id, place, title, state, sha, created_at from piece where id = ${id}`;
		if (!p) throw new Error(`no piece ${id}`);
		const steps = await sql`select seq, action, body, response, error, ms, at from piece_step where piece_id = ${id} order by seq`;
		const calls = await sql`
			select c.tag, c.model, c.effort, c.state, c.messages, c.output, c.step_seq, c.prompt_tokens, c.completion_tokens, c.cost_usd, c.latency_ms, p.text as system
			from llm_call c left join llm_prompt p on p.hash = c.prompt_hash
			where c.piece_id = ${id} order by c.created_at`;
		const cases = await sql`select id, step_seq, note, status, commit from session_case where piece_id = ${id} order by id`;
		const dir = join(ROOT, id);
		mkdirSync(dir, { recursive: true });
		// The tape in lab/replay.mjs's format; the first step is what /api/s is handed (a new piece, in the piece's language).
		const lines = steps.map((s) => {
			const body =
				s.action === "create"
					? { ...s.body, lang: p.language, ...(p.scenario_id ? { scenario: { id: p.scenario_id, title: p.title, site: p.place } } : {}) }
					: s.body;
			return JSON.stringify({
				t: s.at.getTime(),
				seq: s.seq,
				action: s.action,
				body,
				out: s.response,
				...(s.error ? { error: s.error } : {}),
				ms: s.ms,
			});
		});
		writeFileSync(join(dir, "session.jsonl"), `${lines.join("\n")}\n`);
		writeFileSync(join(dir, "piece.json"), `${JSON.stringify({ ...p, cases }, null, "\t")}\n`);
		let seeded = 0;
		let wordless = 0;
		for (const c of calls) {
			if (!Array.isArray(c.messages) || c.output == null || c.state === "failed") {
				wordless += c.messages ? 0 : 1;
				continue;
			}
			const messages = c.system ? [{ role: "system", content: c.system }, ...c.messages] : c.messages;
			const key = { model: c.model, effort: c.effort ?? undefined, sample: 0, messages };
			const file = join(CACHE, c.tag.replaceAll("/", "_"), `${cacheHash(key)}.json`);
			mkdirSync(join(CACHE, c.tag.replaceAll("/", "_")), { recursive: true });
			const usage = { input: c.prompt_tokens ?? 0, output: c.completion_tokens ?? 0 };
			writeFileSync(
				file,
				JSON.stringify({ ...key, result: { text: c.output, usage, ms: c.latency_ms ?? 0, costUsd: c.cost_usd ?? 0 }, finish: null }, null, "\t"),
			);
			seeded++;
		}
		console.log(
			`${id}: ${steps.length} steps, ${seeded} replies seeded${wordless ? `, ${wordless} calls without words` : ""}, ${cases.length} cases → cases/${id}/`,
		);
	} finally {
		await sql.end();
	}
}

const normal = (v) => JSON.parse(JSON.stringify(v ?? {}).replace(/"c\d+"/g, '"c#"'));
function firstDiff(a, b, path = "") {
	if (isDeepStrictEqual(a, b)) return null;
	if (a && b && typeof a === "object" && typeof b === "object") {
		for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
			const d = firstDiff(a[k], b[k], `${path}/${k}`);
			if (d) return d;
		}
	}
	return { path: path || "/", prod: a, now: b };
}

async function replay(origin, id) {
	const file = join(ROOT, id, "session.jsonl");
	if (!existsSync(file)) {
		console.log(`${id}: not pulled (pnpm case pull ${id})`);
		return false;
	}
	const post = async (path, body) => {
		const r = await fetch(`${origin}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", cookie: process.env.COOKIE ?? "" },
			body: JSON.stringify(body ?? {}),
		});
		return { status: r.status, json: await r.json().catch(() => null) };
	};
	const steps = readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const create = steps.find((s) => s.action === "create");
	const made = create && (await post("/api/s", create.body));
	if (!made?.json?.id) {
		console.log(`${id}: could not start (${made?.status} ${JSON.stringify(made?.json)})`);
		return false;
	}
	let same = 0;
	for (const s of steps) {
		if (s.action === "create" || s.error) continue;
		const now = await post(`/api/s/${made.json.id}/${s.action}`, s.body);
		const d =
			now.status !== 200
				? { path: "status", prod: 200, now: `${now.status} ${JSON.stringify(now.json)}` }
				: firstDiff(normal(s.out), normal(now.json));
		if (d) {
			console.log(`${id}: ${same} steps as in production, then step ${s.seq} (${s.action}) differs at ${d.path}`);
			console.log(`  production: ${JSON.stringify(d.prod)?.slice(0, 600)}`);
			console.log(`  now:        ${JSON.stringify(d.now)?.slice(0, 600)}`);
			console.log(`  replayed as piece ${made.json.id}: open /live/${made.json.id} to read it`);
			return false;
		}
		same++;
	}
	console.log(`${id}: all ${same} steps as in production`);
	return true;
}

if (command === "pull" && args.length) {
	for (const id of args) await pull(id);
} else if (command === "replay" && args.length >= 2) {
	const [origin, ...rest] = args;
	const pulled = existsSync(ROOT) ? readdirSync(ROOT).filter((d) => UUID.test(d)) : [];
	const open = (d) => JSON.parse(readFileSync(join(ROOT, d, "piece.json"), "utf8")).cases.some((c) => c.status === "open");
	const ids = rest[0] === "--all" ? pulled : rest[0] === "--open" ? pulled.filter(open) : rest;
	let bad = 0;
	for (const id of ids) if (!(await replay(origin, id))) bad++;
	process.exit(bad ? 1 : 0);
} else {
	console.error("usage: pnpm case pull <piece>... | pnpm case replay <origin> <piece>...|--all|--open");
	process.exit(2);
}
