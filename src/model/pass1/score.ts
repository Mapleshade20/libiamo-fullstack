import { type Fixture, goldRange } from "../fixtures/types.ts";
import type { Finding } from "./strategies.ts";

export type GoldResult = { id: string; route: "p1" | "p2"; optional: boolean; status: "ok" | "wrong-pass" | "missed"; found: Finding[] };
export type Score = { gold: GoldResult[]; extras: Finding[]; p1: string; p2: string; wrongPass: number };

const overlaps = (f: Finding, [s, e]: [number, number]) => f.from >= 0 && f.from < e && f.to > s;

export function score(fx: Fixture, findings: Finding[]): Score {
	const used = new Set<Finding>();
	const gold = fx.gold.map((g) => {
		const range = goldRange(fx.draft.text, g);
		const found = findings.filter((f) => overlaps(f, range));
		for (const f of found) used.add(f);
		const want = g.route === "p1" ? 1 : 2;
		const status = !found.length ? "missed" : found.some((f) => f.pass === want) ? "ok" : "wrong-pass";
		return { id: g.id, route: g.route, optional: !!g.optional, status, found } satisfies GoldResult;
	});
	const tally = (route: "p1" | "p2") => {
		const all = gold.filter((g) => g.route === route && !g.optional);
		return `${all.filter((g) => g.status === "ok").length}/${all.length}`;
	};
	return {
		gold,
		extras: findings.filter((f) => !used.has(f)),
		p1: tally("p1"),
		p2: tally("p2"),
		wrongPass: gold.filter((g) => g.status === "wrong-pass").length,
	};
}
