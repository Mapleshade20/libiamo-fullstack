import type { Caller } from "#lib/server/llm/caller.ts";
import type { Draft } from "#lib/server/revision/draft.ts";
import { type Finding, rewritePass1 } from "#lib/server/revision/pass1/rewrite.ts";
import { analyze } from "#lib/server/revision/pass2/analyze.ts";
import { freshNative } from "#lib/server/revision/pass2/fresh.ts";
import { judgeSpots } from "#lib/server/revision/pass2/judge.ts";
import { analysisBase, rebase } from "#lib/server/revision/pipeline/base.ts";

/** Optional pass-1 changes stay as tier "better"; optional spans of any other kind go. */
const betterTier = (findings: Finding[]) =>
	findings.filter((f) => !f.optional || (f.pass === 1 && f.after !== undefined)).map((f) => (f.optional ? { ...f, tier: "better" as const } : f));

/**
 * Pass 1 (a native-first rewrite, labelled) and the pass-2 analysis of the draft, split so a revision can start pass 1
 * as soon as its rewrite is labelled while the analysis is still running. Optional pass-1 changes are kept as tier
 * "better", for writers who asked to see more.
 */
export function detectSplit(d: Draft, ai: Caller, sample: number, opts: { judge?: boolean } = {}) {
	const p1 = rewritePass1(d, ai, sample);
	const pass1 = p1.done.then((r) => ({ findings: betterTier(r.findings), calls: r.calls }));
	const base = p1.rewrite.then((rw) => analysisBase(d, rw.pass1));
	// The analysis reads the draft as written, told which spans pass 1 left for it; then it is rebased on the pass-1
	// text the learner will see (base.ts). All of it runs while the learner is still in pass 1.
	const pass2 = Promise.all([freshNative(d, ai, sample), base]).then(async ([fresh, b]) => {
		const p2 = await analyze(d, d.text, ai, sample, fresh.fresh, b.left);
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
