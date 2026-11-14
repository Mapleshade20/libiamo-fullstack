// Replays sessions the rehearsal lab recorded (runs/live/<id>.jsonl) against a running server and compares every
// step's response with the recorded one. Run the server with the lab's call cache, read only, so nothing is spent:
//
//   LLM_CACHE_DIR=../rehearsal-lab/runs/cache LLM_CACHE_ONLY=1 pnpm dev --port 5180
//   node lab/replay.mjs http://127.0.0.1:5180 ../rehearsal-lab/runs/live/<id>.jsonl ...
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";

const [origin, ...files] = process.argv.slice(2);
if (!origin || !files.length) {
	console.error("usage: node lab/replay.mjs <origin> <session.jsonl>...");
	process.exit(2);
}

/** Ids of loose chips come from a counter the whole process shares (`c12`), so they differ between runs. */
const normal = (v) => JSON.parse(JSON.stringify(v ?? {}).replace(/"c\d+"/g, '"c#"'));
const post = async (path, body) => {
	const r = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
	return { status: r.status, json: await r.json().catch(() => null) };
};
/** Where two values first differ, as a path. */
function firstDiff(a, b, path = "") {
	if (isDeepStrictEqual(a, b)) return null;
	if (a && b && typeof a === "object" && typeof b === "object") {
		for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
			const d = firstDiff(a[k], b[k], `${path}/${k}`);
			if (d) return d;
		}
	}
	return `${path || "/"}: recorded ${JSON.stringify(a)?.slice(0, 160)} · now ${JSON.stringify(b)?.slice(0, 160)}`;
}

let failed = 0;
for (const file of files) {
	const steps = readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const create = steps.find((s) => s.action === "create");
	if (!create) {
		console.log(`${basename(file)}: no create step, skipped`);
		continue;
	}
	const made = await post("/api/s", { ...create.body, noCache: false });
	if (!made.json?.id) {
		console.log(`${basename(file)}: could not start (${made.status} ${JSON.stringify(made.json)})`);
		failed++;
		continue;
	}
	let same = 0;
	let problem = null;
	for (const s of steps) {
		if (s.action === "create") continue;
		// A step that failed when it was recorded says nothing about now.
		if (s.error) continue;
		const now = await post(`/api/s/${made.json.id}/${s.action}`, s.body);
		const diff = now.status !== 200 ? `status ${now.status} ${JSON.stringify(now.json)?.slice(0, 200)}` : firstDiff(normal(s.out), normal(now.json));
		if (diff) {
			problem = `step ${same + 1} (${s.action}) ${diff}`;
			break;
		}
		same++;
	}
	if (problem) failed++;
	console.log(`${basename(file)}: ${problem ? `DIFFERS at ${problem}` : `${same} steps identical`}`);
}
process.exit(failed ? 1 : 0);
