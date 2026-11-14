import type { Caller, CallResult } from "#lib/server/llm/caller.ts";
import type { Draft } from "../fixtures/types.ts";
import { type Finding, s3, s3Split } from "../pass1/strategies.ts";
import { type Analysis, config, sentences, spotRange, t2 } from "../pass2/analyze.ts";
import { freshNative } from "../pass2/fresh.ts";
import { judgeSpots } from "../pass2/judge.ts";
import { vetFormulation } from "../pass2/vet.ts";
import { analysisBase, type Base, rebase } from "./base.ts";

/** judged: spots the judge found the tutor wrong about, which are not shown. */
export type Detection = {
	findings: Finding[];
	analysis: Analysis;
	native: string;
	calls: CallResult[];
	dropped: { problem: string; why: string }[];
	judged?: { words: string; why: string }[];
};

/**
 * Pass 1 (native-first rewrite + labels) and the pass-2 analysis run on the draft in parallel. The analysis decides
 * routing: a pass-1 change inside a pass-2 spot is absorbed by it. Optional changes, and spots the judge rates "could
 * be better", are kept as tier "better", for writers who asked to see more.
 */
export async function detect(
	d: Draft,
	ai: Caller,
	sample: number,
	opts: { absorb?: boolean; fresh?: boolean; vet?: boolean; judge?: boolean; p1text?: boolean; rebase?: boolean } = {},
): Promise<Detection> {
	config.stage = opts.p1text ? "pass1" : "draft";
	// v4 compares against pass 1's native version, so the analysis waits for it; earlier versions run in parallel.
	// v4+ compare the draft against a fluent version: pass 1's edited native, or (fresh) one written from the points alone.
	const compare = config.task === "v4" || config.task === "v5" || config.task === "v6";
	const [p1, fresh] = await Promise.all([s3(d, ai, sample), compare && opts.fresh ? freshNative(d, ai, sample) : null]);
	// p1text: pass 2 reads the draft with pass 1's changes made (base.ts); its ranges are taken back to the draft.
	const base: Pick<Base, "text" | "inv" | "left"> = opts.p1text ? analysisBase(d, p1.artifacts.rewrite) : { text: d.text, inv: (p) => p, left: [] };
	const da = { ...d, text: base.text };
	const p2 = await t2(da, base.text, ai, sample, undefined, compare ? (fresh?.fresh ?? p1.artifacts.native) : undefined, base.left);
	const ss = sentences(base.text, d.target);
	const vetted =
		opts.vet && fresh
			? await vetFormulation(da, ss, p2.analysis, fresh.fresh, ai, sample)
			: { analysis: p2.analysis, dropped: [] as { problem: string; why: string }[], call: undefined };
	p2.analysis = vetted.analysis;
	const judged = opts.judge ? await judgeSpots(da, p2.analysis.spots, ai, sample) : null;
	if (judged) p2.analysis = { ...p2.analysis, spots: judged.spots };
	// rebase: the draft's spots moved onto the pass-1 text (what a live session shows), then scored back on the draft.
	let at = { text: base.text, ss, inv: base.inv };
	if (opts.rebase && !opts.p1text) {
		const b = analysisBase(d, p1.artifacts.rewrite);
		const r = await rebase(d, b, p2.analysis, ai);
		p2.analysis = r.analysis;
		p2.calls.push(...r.calls);
		at = { text: b.text, ss: sentences(b.text, d.target), inv: b.inv };
	}
	const spots: Finding[] = p2.analysis.spots.map((s) => {
		const [a, b] = spotRange(at.text, at.ss, s);
		const [from, to] = a < 0 ? [a, b] : [at.inv(a, "from"), at.inv(b, "to")];
		return { from, to, before: d.text.slice(from, to), pass: 2, kind: "spot", note: s.problem };
	});
	const inSpot = (f: Finding) => spots.some((s) => s.from >= 0 && f.from < s.to && f.to > s.from);
	const findings: Finding[] = [...spots];
	for (const f of betterTier(p1.findings)) {
		if (opts.absorb && inSpot(f)) continue;
		findings.push(f);
	}
	findings.sort((a, b) => a.from - b.from);
	return {
		findings,
		analysis: p2.analysis,
		native: fresh?.fresh ?? p1.artifacts.native ?? "",
		calls: [...p1.calls, ...(fresh ? [fresh.call] : []), ...p2.calls, ...(vetted.call ? [vetted.call] : []), ...(judged?.calls ?? [])],
		dropped: vetted.dropped,
		judged: judged?.wrong,
	};
}

/** Optional pass-1 changes stay as tier "better"; optional spans of any other kind go. */
const betterTier = (findings: Finding[]) =>
	findings.filter((f) => !f.optional || (f.pass === 1 && f.after !== undefined)).map((f) => (f.optional ? { ...f, tier: "better" as const } : f));

/**
 * The same detection as `detect` (stacked, fresh native), split so a session can start pass 1 as soon as its rewrite is
 * labelled while the pass-2 analysis is still running.
 */
export function detectSplit(d: Draft, ai: Caller, sample: number, opts: { judge?: boolean } = {}) {
	config.stage = "draft";
	const p1 = s3Split(d, ai, sample);
	const pass1 = p1.done.then((r) => ({ findings: betterTier(r.findings), calls: r.calls }));
	const base = p1.rewrite.then((rw) => analysisBase(d, rw.pass1));
	// The analysis reads the draft as written, told which spans pass 1 left for it; then it is rebased on the pass-1
	// text the learner will see (base.ts). All of it runs while the learner is still in pass 1.
	const pass2 = Promise.all([freshNative(d, ai, sample), base]).then(async ([fresh, b]) => {
		const p2 = await t2(d, d.text, ai, sample, undefined, fresh.fresh, b.left);
		// The judge looks at the spots while the learner is still in pass 1, so nobody waits for it.
		const judged = opts.judge ? await judgeSpots(d, p2.analysis.spots, ai, sample, b.left) : null;
		const r = await rebase(d, b, judged ? { ...p2.analysis, spots: judged.spots } : p2.analysis, ai);
		return {
			analysis: r.analysis,
			base: b,
			native: fresh.fresh,
			judged: judged?.wrong ?? [],
			verdicts: judged?.all ?? [],
			calls: [fresh.call, ...p2.calls, ...(judged?.calls ?? []), ...r.calls],
		};
	});
	// Neither may reject unobserved while the other is awaited.
	pass1.catch(() => {});
	pass2.catch(() => {});
	base.catch(() => {});
	return { pass1, pass2, base };
}
