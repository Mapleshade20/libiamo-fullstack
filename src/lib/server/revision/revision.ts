import catalog from "#lib/i18n/catalog/ui.json";
import type { Caller } from "#lib/server/llm/caller.ts";
import {
	answerQuestion,
	briefFor,
	closingReaction,
	contentCheck,
	explainRef,
	hintFor,
	inferScene,
	notesFor,
	overviewReply,
	ownReading,
	pieceNotes,
} from "#lib/server/revision/calls.ts";
import { type Draft, LANG_NAMES, type Lang, replyIn } from "#lib/server/revision/draft.ts";
import { applyEdits, scopeOf } from "#lib/server/revision/edits.ts";
import type { Finding } from "#lib/server/revision/pass1/rewrite.ts";
import { type Analysis, readBack, sentences, spotRange } from "#lib/server/revision/pass2/analyze.ts";
import { feedback, grade, placeAt } from "#lib/server/revision/pass2/grade.ts";
import { markKeys } from "#lib/server/revision/pass2/keys.ts";
import { type Outline, outline } from "#lib/server/revision/pass2/map.ts";
import { type Material, material, pieceOwnership, trimSame, vetMaterial } from "#lib/server/revision/pass2/material.ts";
import { analysisBase, type Base, rebase } from "#lib/server/revision/pipeline/base.ts";
import { detectSplit } from "#lib/server/revision/pipeline/detect.ts";
import { repeats, residue } from "#lib/server/revision/residue.ts";
import { type Case, pass1Exchange, replyTo, SEP, turnAt } from "#lib/server/revision/scenario/exchange.ts";
import { analyzeExchange, type ExchangeAnalysis } from "#lib/server/revision/scenario/pass2.ts";
import { replayReply } from "#lib/server/revision/scenario/replay.ts";
import { analyzeTranslation, pass1Translation, type Translation } from "#lib/server/revision/translation.ts";
import { parseSource, plainSource, renderSource, type Source, sourceGist, withoutDraft } from "#lib/server/writing/source.ts";
import { words } from "#lib/text/words.ts";
import { blockAt, blocksOf } from "#lib/translation/blocks.ts";

/** The interface strings the page and the server share, per app language (scripts/i18n.ts). */
const UI: Record<string, Record<string, string>> = catalog;
export const tr = (lang: string, key: string, vars: Record<string, string | number> = {}) =>
	(UI[lang]?.[key] ?? UI.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/**
 * The playable demo's server side. The browser page is rehearsal.html with its hand-written content replaced by these
 * calls, so the page keeps driving the session (pacing, cards, typing) and the server only answers each step.
 */

/** The page's post format (rehearsal.html's DOC): paragraphs of plain text and items. */
type Part = string | { hole: string } | { choice: string[] };
type Seg = string | { item: string; parts: Part[]; revised?: boolean };
type Doc = Seg[][];
type Span = { id: string; from: number; to: number; part?: Part; revised?: boolean };

/** Hesitations ("a / b") the writer left and passages still in their own script show as the demo's chips, wherever they are. */
type Marks = { choices: string[]; hole: string | null };
const SCRIPTS: Partial<Record<Lang, string[]>> = {
	"zh-CN": ["Han"],
	ja: ["Hiragana", "Katakana", "Han"],
	ko: ["Hangul"],
	ru: ["Cyrillic"],
	el: ["Greek"],
	ar: ["Arabic"],
	fa: ["Arabic"],
};
/** A run of the writer's own script, when it is not the target's (a Latin-script writer's passages are found by pass 2). */
function holePattern(learner: Lang, target: Lang): string | null {
	const own = SCRIPTS[learner];
	const theirs = SCRIPTS[target] ?? ["Latin"];
	if (!own || own.some((x) => theirs.includes(x))) return null;
	const cls = `[${own.map((x) => `\\p{Script=${x}}`).join("")}]`;
	return `${cls}(?:[${own.map((x) => `\\p{Script=${x}}`).join("")}\\p{P}\\s]*${cls})?`;
}
function atoms(str: string, marks?: Marks): Part[] {
	if (!marks || !str) return [str];
	const alts = [
		...marks.choices.filter((c) => c.includes("/")).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
		...(marks.hole ? [marks.hole] : []),
	];
	if (!alts.length) return [str];
	const out: Part[] = [];
	let pos = 0;
	for (const m of str.matchAll(new RegExp(alts.join("|"), "gu"))) {
		if (m.index > pos) out.push(str.slice(pos, m.index));
		out.push(m[0].includes("/") ? { choice: m[0].split("/").map((x) => x.trim()) } : { hole: m[0] });
		pos = m.index + m[0].length;
	}
	if (pos < str.length) out.push(str.slice(pos));
	return out.filter((x) => x !== "");
}

function toDoc(text: string, spans: Span[], marks: Marks, chips: { n: number }): Doc {
	const doc: Doc = [];
	let start = 0;
	for (const para of text.split("\n\n")) {
		const end = start + para.length;
		const segs: Seg[] = [];
		let pos = start;
		for (const s of [...spans].sort((a, b) => a.from - b.from)) {
			if (s.from < pos || s.from < start || s.to > end) continue;
			if (s.from > pos) segs.push(...loose(text.slice(pos, s.from), marks, chips));
			segs.push({ item: s.id, parts: s.part ? [s.part] : atoms(text.slice(s.from, s.to), marks), ...(s.revised ? { revised: true } : {}) });
			pos = s.to;
		}
		if (pos < end) segs.push(...loose(text.slice(pos, end), marks, chips));
		doc.push(segs);
		start = end + 2;
	}
	return doc;
}

/** Plain text outside items: a chip there becomes an item of its own (the page draws chips only inside items), numbered
 *  through the revision so no two documents it sends share one. */
function loose(str: string, marks: Marks, chips: { n: number }): Seg[] {
	return atoms(str, marks).map((p) => (typeof p === "string" ? p : { item: `c${++chips.n}`, parts: [p] }));
}

/**
 * mode "given": nothing to ask, the meaning is known (a translation's source; a formulation spot, whose meaning is what the
 * words already say: 2026-11-10, a stop asking which way to restructure offered "ask only one question", which deleted
 * the writer's other questions).
 */
type PartQ = { problem: string; question?: string; mode: "one" | "ask" | "given"; readings: { label: string; meaning: string }[] };
/** What a formulation spot means, for the calls that write and grade it. */
/** A reading the learner taps: a label that names nothing ("A", "B") shows the reading itself (2026-11-10: "Yes | B"). */
const tappable = (r: { label: string; meaning: string }) => (/^\W*[A-Za-z0-9]?\W*$/.test(r.label) ? { ...r, label: r.meaning } : r);
const AS_WRITTEN = "Everything this passage says now: every point, question, hedge and feeling in it stays; only how it is put changes.";
type Stop = {
	id: string;
	from: number;
	to: number;
	parts: PartQ[];
	label: string;
	done?: boolean;
	gone?: boolean;
	m?: Material;
	reading?: string;
	problem?: string;
	history: { text: string; feedback: string }[];
	round: number;
	seen: Set<number>;
	ticks: number[];
	/** The material call whose result this stop is using (the others become discarded once it is done). */
	used?: string;
	/** Grades by normalised attempt: the same words always get the same answer. */
	graded: Map<string, GradeOut>;
	/** The post just before this stop's version went in, for grading the retrieval at the end against the same text. */
	textAt?: string;
};
type GradeOut =
	| {
			pass: true;
			success: string;
			ticks: number[];
			own: string | null;
			choices: { n: number; mine?: string | null; verdict: string; note?: string | null }[];
			extra: { mine: string; ref: string; ok?: boolean; note: string }[];
	  }
	| { pass: false; reader: string | null; tutor: string; round: number; repaired: string | null };

/** feedback: whether everything for the writer is in their own language or in the one they are writing in. */
/** source: context the writer imported (a capture from the page, or any text); see src/context/source.ts. */
/** detail "more": also what is fine as written but could be put better (tier "better", shown as optional). Default "needed" (2026-11-10: the optional tier is where the noise is). */
/** No level: told one, the models judged no better and a high one made them nitpick (E10 by level, 2026-10-30). */
/** exchange: a finished scenario's conversation (src/scenario/exchange.ts); then `text` is its learner turns joined by separator lines. */
/** translation: a translation scenario (src/translate/passes.ts); `text` is the learner's translation into `target`. */
export type RevisionInput = {
	exchange?: Omit<Case, "id" | "notes">;
	translation?: Translation & { target: Lang };
	title?: string;
	text: string;
	background?: string;
	source?: string;
	detail?: "needed" | "more";
	learner: Lang;
	feedback: "native" | "target";
};

export class RevisionSession {
	d!: Draft;
	scene!: Awaited<ReturnType<typeof inferScene>>;
	private det?: ReturnType<typeof detectSplit>;
	private p1: (Finding & { after: string; id: string })[] = [];
	/** The pass-1 changes the writer took (not those they kept their own words for), and the answers they came from. */
	private applied: (Finding & { after: string; id: string })[] = [];
	private p1args?: string;
	private defers: (Finding & { id: string })[] = [];
	pass1Text = "";
	private map: (p: number, side: "from" | "to") => number = (p) => p;
	/** The pass-1 text back to the draft. */
	private unmap: (p: number, side: "from" | "to") => number = (p) => p;
	private rb?: Promise<string>;
	private analysis?: Analysis;
	/** The text pass 2 read (the draft with every pass-1 change made) and the way back to the draft. */
	private base?: Base;
	text = "";
	private stops: Stop[] = [];
	private initial: Stop[] = [];
	private marks: Marks = { choices: [], hole: null };
	private chips = { n: 0 };
	private revised: { from: number; to: number }[] = [];
	private materials = new Map<string, Promise<Material>>();
	private ends = new Map<string, Promise<{ issues: Awaited<ReturnType<typeof contentCheck>>; closing: string }>>();
	learned: { construct: string; self: boolean }[] = [];
	private decided: string[] = [];
	private detN = 0;
	/** The import without the writer's own draft, and the brief every later call reads instead of it. */
	readonly source?: Source;
	private brief?: Promise<string | undefined>;
	/** The reply to "yes, that's it", prepared with the read-back. */
	private outline?: Promise<Outline>;
	/** A scenario's conversation, and how each turn landed (pass 2's overview for it). */
	private ex?: Case;
	private landed?: ExchangeAnalysis["turns"];
	constructor(
		public input: RevisionInput,
		/** Who pays for the revision's calls, and its background lane. */
		readonly ai: Caller,
	) {
		if (input.exchange) this.ex = { id: "scenario", notes: "", ...input.exchange };
		const source = input.source?.trim() ? (parseSource(input.source) ?? plainSource(input.source)) : null;
		if (source) this.source = withoutDraft(source, input.text);
	}
	/** The import itself, for the calls that answer the writer: what they say about their source must be checkable. */
	private get imported() {
		return this.source ? renderSource(this.source) : undefined;
	}
	private get more() {
		return this.input.detail === "more";
	}
	/** "Optional: " before a note, spaced the way the interface language spaces it. */
	private get opt() {
		const o = this.t("optional");
		return /[\s：]$/.test(o) ? o : `${o} `;
	}
	/** The writer's interface language: known once the scene says what they are writing in. */
	get ui(): Lang {
		return this.d?.feedback ?? this.input.learner;
	}
	private t(key: string, vars?: Record<string, string | number>) {
		return tr(this.ui, key, vars);
	}

	/** C0, or C0 again from the note as the writer rewrote it (the page sends the whole note, not an addition). */
	async inferScene(correction?: string) {
		if (this.ex) return this.scenarioScene();
		if (this.input.translation) return this.translationScene();
		const background = (correction ?? this.input.background) || undefined;
		// The brief is read while the scene card is up; it does not change with the scene, so a correction keeps it.
		if (this.source && !this.brief) {
			const src = renderSource(this.source);
			this.brief = briefFor(this.input.text, this.input.background, src, this.ai.for("brief")).catch(() => undefined);
		}
		const imported = this.source ? `\nImported as context: ${this.source.label}\n${sourceGist(this.source)}` : "";
		this.scene = await inferScene(
			this.input.text,
			`${background ?? ""}${imported}`.trim() || undefined,
			this.input.learner,
			this.input.feedback,
			this.ai.for("scene"),
		);
		// The rewritten note replaces the old one only once the scene it gave is in.
		if (correction) this.input.background = background;
		const s = this.scene;
		const feedback = this.input.feedback === "target" ? s.target : this.input.learner;
		this.d = {
			id: "live",
			title: this.input.title,
			text: this.input.text,
			background,
			target: s.target,
			learner: this.input.learner,
			feedback,
			level: "",
			scene: { platform: s.platform, audience: s.audience, purpose: s.purpose },
		};
		// Detection starts as soon as the scene is known, while the writer reads the scene card; a corrected scene starts it again.
		this.det = undefined;
		this.analysis = undefined;
		const n = ++this.detN;
		this.ai.lanes?.discard((p) => p.startsWith("detect #") && p !== `detect #${n}`);
		this.start(this.ai.for(`detect #${n}`));
		return { ...s, ui: feedback };
	}

	/** A scenario knows its scene: nothing to infer. The reader is whoever answered the first turn. */
	private scenarioScene() {
		const c = this.ex as Case;
		const target = c.lang as Lang;
		const feedback = this.input.feedback === "target" ? target : this.input.learner;
		const reader = replyTo(c, 1)?.author ?? c.scene.cast[0]?.name ?? "reader";
		const scene = {
			site: c.scene.platform,
			community: c.scene.where,
			reader,
			title: this.input.title ?? "",
			platform: `${c.scene.platform} (${c.scene.where})`,
			audience: c.scene.cast.map((p) => `${p.name}, ${p.who}`).join("; "),
			purpose: `${c.scene.you}. ${c.scene.goals.join("; ")}`,
			target: target as "en",
		};
		this.scene = scene;
		this.d = {
			id: "live",
			title: this.input.title,
			text: this.input.text,
			background: this.input.background,
			target,
			learner: this.input.learner,
			feedback,
			level: "",
			scene: { platform: scene.platform, audience: scene.audience, purpose: scene.purpose },
		};
		this.det = undefined;
		this.start(this.ai.for("detect #1"));
		return { ...scene, ui: feedback };
	}

	/** A translation scenario: the place is the authentic text's, the purpose to say what the source says. */
	private translationScene() {
		const t = this.input.translation as NonNullable<RevisionInput["translation"]>;
		const feedback = this.input.feedback === "target" ? t.target : this.input.learner;
		// The prompts read "Where it will be posted: …", "Who will read it: …": the scenario says both (older handoffs only had the brief).
		const scene = {
			site: "Translate",
			community: t.where ?? t.context,
			reader: "reader",
			title: this.input.title ?? "",
			platform: t.where ?? t.context,
			audience: t.readers ?? "people who read it there",
			purpose: `${t.context.replace(/[.\s]+$/, "")}. A translation: say in ${LANG_NAMES[t.target]} what the source says`,
			target: t.target as "en",
		};
		this.scene = scene;
		const glossary = t.glossary.length ? `Given names and terms: ${t.glossary.map((g) => g.term).join(", ")}.` : "";
		this.d = {
			id: "live",
			title: this.input.title,
			text: this.input.text,
			background: [`A translation of this source: ${t.source}`, glossary].filter(Boolean).join("\n"),
			target: t.target,
			learner: this.input.learner,
			feedback,
			level: "",
			scene: { platform: scene.platform, audience: scene.audience, purpose: scene.purpose },
		};
		this.det = undefined;
		this.start(this.ai.for("detect #1"));
		return { ...scene, ui: feedback };
	}

	/** Pass 1 and the pass-2 analysis start together, once the brief on any import is ready. */
	start(ai: Caller = this.ai.for("pass1")) {
		if (this.det) return;
		if (this.ex) return this.startScenario(ai);
		if (this.input.translation) {
			const t = this.input.translation;
			const p1 = pass1Translation(this.d, t, ai);
			const pass1 = p1.done.then((r) => ({
				findings: r.findings
					.filter((f) => !f.optional || (f.pass === 1 && f.after !== undefined))
					.map((f) => (f.optional ? { ...f, tier: "better" as const } : f)),
			}));
			// The analysis reads the draft, told what pass 1 left for it, then is rebased on the pass-1 text (base.ts).
			const pass2 = p1.rewrite.then(async (rw) => {
				const base = analysisBase(this.d, rw.pass1);
				const a = await analyzeTranslation(this.d, t, ai.for("analysis"), base.left);
				return { analysis: (await rebase(this.d, base, a, ai.for("analysis"))).analysis, base };
			});
			pass1.catch(() => {});
			pass2.catch(() => {});
			this.det = { pass1, pass2 } as unknown as ReturnType<typeof detectSplit>;
			pass2.then(
				(p) => {
					this.analysis = p.analysis;
					this.base = p.base;
				},
				() => {},
			);
			return;
		}
		const d = this.d;
		const ready = (this.brief ?? Promise.resolve(undefined)).then((brief) => {
			if (brief) Object.assign(d, { brief, replyTo: replyIn(brief) });
			// Pass-2 spots go past a judge (judge.ts) before anyone sees them.
			const det = detectSplit(d, ai, 0, { judge: true });
			// The map's outline is its own call over the same text pass 2 reads, made while the writer is in pass 1.
			this.outline = det.base.then((b) => outline({ ...d, text: b.text }, sentences(b.text, d.target), ai.for("outline"))).then((r) => r.value);
			this.outline.catch(() => {});
			return det;
		});
		this.det = { pass1: ready.then((x) => x.pass1), pass2: ready.then((x) => x.pass2), base: ready.then((x) => x.base) };
		this.det.pass1.catch(() => {});
		this.det.pass2.then(
			(p) => {
				this.analysis = p.analysis;
				this.base = p.base;
			},
			() => {},
		);
	}

	/** A scenario's exchange: pass 1 per turn as said at that moment, then the analysis that first judges how each turn landed (Q1, Q2). */
	private startScenario(ai: Caller) {
		const c = this.ex as Case;
		const p1 = pass1Exchange(c, ai, this.d);
		const pass1 = p1.done.then((r) => ({
			findings: r.findings
				.filter((f) => !f.optional || (f.pass === 1 && f.after !== undefined))
				.map((f) => (f.optional ? { ...f, tier: "better" as const } : f)),
		}));
		const pass2 = p1.rewrite.then(async (r) => {
			const base = analysisBase(this.d, r.pass1);
			const a = await analyzeExchange(c, this.d.text, r.native, ai.for("analysis"), true, this.d, "draft", base.left);
			this.landed = a.analysis.turns;
			const rb = await rebase(this.d, base, a.analysis as Analysis, ai.for("analysis"));
			return { analysis: rb.analysis, base };
		});
		pass1.catch(() => {});
		pass2.catch(() => {});
		this.det = { pass1, pass2 } as unknown as ReturnType<typeof detectSplit>;
		pass2.then(
			(p) => {
				this.analysis = p.analysis;
				this.base = p.base;
			},
			() => {},
		);
	}

	/** How each turn landed, with the reply that shows it, for the page's "how it went". */
	private howItWent() {
		const c = this.ex as Case;
		return (this.landed ?? []).map((t) => {
			const r = replyTo(c, t.t);
			return { t: t.t, ok: t.outcome === "as meant", cause: t.cause, why: t.why, by: r?.author ?? null, reply: r?.text ?? null };
		});
	}
	/** The person a stop's turn was said to, and their real reply when the stop is why that turn went off. */
	private readerFor(from: number, stop?: string) {
		const c = this.ex;
		if (!c) return null;
		const n = turnAt(this.pass1Text || this.d.text, from);
		const r = replyTo(c, n);
		const off = this.landed?.find((t) => t.t === n && t.outcome === "off" && t.cause === "wording");
		// The real reply opens the first stop of that turn only; the others get their own reader line.
		const first = this.stops.find((s) => turnAt(this.pass1Text || this.d.text, s.from) === n);
		return { turn: n, name: r?.author ?? null, line: off && r && (!stop || first?.id === stop) ? r.text : null };
	}

	/** detail: what the writer chose on the scene card; it holds for pass 2 as well. */
	async pass1(detail?: "needed" | "more") {
		if (detail) this.input.detail = detail;
		this.start();
		// Writers who asked only for what needs changing do not see the optional ones; the others see them marked.
		const all = (await this.det!.pass1).findings
			.filter((f) => this.more || !f.tier)
			.map((f) => (f.tier ? { ...f, note: `${this.opt}${f.note}` } : f));
		// A new pass 1 (a corrected scene) means the answers are to new changes, even if they look the same.
		this.p1args = undefined;
		this.p1 = all
			.filter((f): f is Finding & { after: string } => f.pass === 1 && f.after !== undefined)
			.sort((a, b) => a.from - b.from)
			.map((f, i) => ({ ...f, id: `p${i + 1}` }));
		this.defers = all.filter((f) => f.pass === 2 && f.from >= 0).map((f, i) => ({ ...f, id: `d${i + 1}` }));
		const stops: unknown[] = [];
		const spans: Span[] = [];
		let deferred = 0;
		for (const f of [...this.p1, ...this.defers].sort((a, b) => a.from - b.from)) {
			const label = f.before || "∅";
			// A span left for pass 2 is explained there; here it is marked, and the first one says what the mark means.
			if (f.pass === 2) {
				spans.push({ id: f.id, from: f.from, to: f.to });
				stops.push({ item: f.id, kind: "defer", label, note: deferred++ ? "" : this.t("deferOnce") });
				continue;
			}
			const p = f as Finding & { after: string; id: string };
			const options =
				p.kind === "hesitation"
					? p.before
							.split("/")
							.map((x) => x.trim())
							.filter(Boolean)
					: [];
			const answer = options.findIndex((o) => o.toLowerCase() === p.after.toLowerCase());
			// An optional change (the original was fine) is shown, never set as an exercise or a quiz: "on/in" with both
			// natural used to tell a learner who picked "in" to use "on".
			if (p.tier) {
				spans.push({ id: p.id, from: p.from, to: p.to });
				stops.push({ item: p.id, kind: "replace", label, to: p.after, note: p.note });
			} else if (options.length > 1 && answer >= 0) {
				spans.push({ id: p.id, from: p.from, to: p.to, part: { choice: options } });
				stops.push({
					item: p.id,
					kind: "choice",
					label,
					answer,
					prompt: this.t("pickOne", { o: options.join(" / ") }),
					note: p.note,
					wrongNote: `${this.useThis(p.after)} ${p.note}`,
				});
			} else if (p.try || p.kind === "hole") {
				const hole = p.kind === "hole" && !!p.before;
				spans.push({ id: p.id, from: p.from, to: p.to, ...(hole ? { part: { hole: p.before } } : {}) });
				const norm = (x: string) =>
					x
						.trim()
						.replace(/[.!?]+$/, "")
						.replace(/’/g, "'")
						.toLowerCase();
				const answers = Object.fromEntries([p.after, ...(p.accept ?? [])].map((a) => [norm(a), { ok: true, note: p.note }]));
				const prompt = `${p.prompt ?? (p.kind === "hole" ? this.t("hole") : this.t("fixHere"))} ${this.t("tryIt")}`.trim();
				stops.push({
					item: p.id,
					kind: "fix",
					label,
					initial: hole ? "" : p.before,
					to: p.after,
					hole,
					prompt,
					answers,
					note: p.note,
					wrongNote: `${this.useThis(p.after)} ${p.note}`,
				});
			} else if (p.kind === "mechanics") {
				// Spelling, accents, capitals, punctuation the learner cannot try: typed in without a card of their own.
				spans.push({ id: p.id, from: p.from, to: p.to });
				stops.push({ item: p.id, kind: "quiet", label, to: p.after, note: p.note });
			} else {
				spans.push({ id: p.id, from: p.from, to: p.to });
				stops.push({ item: p.id, kind: "replace", label, to: p.after, note: p.note });
			}
		}
		this.marks = {
			choices: [...this.defers, ...this.p1].map((f) => f.before).filter((b) => b.includes("/")),
			hole: holePattern(this.d.learner, this.d.target),
		};
		return { doc: toDoc(this.d.text, spans, this.marks, this.chips), stops };
	}
	private useThis(x: string) {
		return this.t("useThisWord", { x: x.replace(/[.。]$/, "") });
	}

	/** The learner's own pass-1 answers go into the text pass 2 starts from; turned-down changes do not. */
	pass1Done(own: Record<string, string>, keep: string[] = []) {
		// The same answers again (the page asks once on leaving pass 1 and once entering pass 2) change nothing, and the
		// reader's read-back already under way is kept.
		const args = JSON.stringify([own, [...keep].sort()]);
		if (args === this.p1args && this.rb) return { text: this.pass1Text, doc: toDoc(this.pass1Text, [], this.marks, this.chips) };
		this.p1args = args;
		// Changes the writer turned down (they know better, e.g. a name from canon) leave their words as they were.
		this.applied = this.p1.filter((f) => !keep.includes(f.id));
		const edits = this.applied.map((f) => ({ from: f.from, to: f.to, after: own[f.id]?.trim() || f.after }));
		const r = applyEdits(this.d.text, edits);
		this.pass1Text = r.text;
		this.map = r.map;
		this.unmap = r.inv;
		this.text = r.text;
		// A scenario has no read-back: how the turns landed is already known.
		this.rb =
			this.ex || this.input.translation
				? Promise.resolve("")
				: readBack(this.d, this.pass1Text, this.ai.for("read-back"), 0).then((c) => c.text.trim());
		this.rb.catch(() => {});
		const det = this.det;
		if (det && !this.ex && !this.input.translation) {
			det.pass2
				.then((p2) => {
					if (this.det !== det || this.text !== this.pass1Text) return;
					this.base = p2.base;
					this.plan(p2.analysis, null);
				})
				.catch(() => {});
		}
		return { text: this.pass1Text, doc: toDoc(this.pass1Text, [], this.marks, this.chips) };
	}

	/** The reader's read-back, and the plan as it stands before the learner says whether it was right. */
	async overview() {
		if (this.ex || this.input.translation) {
			const p2 = await this.det!.pass2;
			this.base = p2.base;
			return { reader: "", turns: this.ex ? this.howItWent() : [], stops: this.plan(p2.analysis, null).stops };
		}
		const [rb, p2] = await Promise.all([this.rb!, this.det!.pass2]);
		this.base = p2.base;
		const plan = this.plan(p2.analysis, null);
		return { reader: rb, stops: plan.stops };
	}

	async overviewReply(said: string | null) {
		const p2 = await this.det!.pass2;
		if (this.ex || this.input.translation) return { reply: "", ...this.plan(p2.analysis, null) };
		// Without an outline (the call failed) the analysis's own flat map stands in.
		const ol = await this.outline?.catch(() => undefined);
		// "Yes, that's it" needs no call: a tutor's summary written for it said things the stops then did not
		// (2026-11-10: "the praise around it sets it right" about a spot it went on to fix).
		if (said === null) {
			const p = this.plan(p2.analysis, null, ol);
			return { reply: this.t(p.stops.length ? "agreedReply" : "agreedNone", { n: p.stops.length }), ...p };
		}
		const rb = await this.rb!;
		const ov = await overviewReply(this.d, this.pass1Text, rb, p2.analysis.gist, said, this.ai.for("overviewReply"));
		return { reply: ov.reply, ...this.plan(p2.analysis, ov.newSpot ?? null, ol) };
	}

	private plan(analysis: Analysis, newSpot: { where: string; problem: string; reading: string } | null, ol?: Outline) {
		this.analysis = analysis;
		const p2 = { analysis };
		const d = this.d;
		// Pass 2 read pass 1's full rewrite (base); its positions go back to the draft, then to the text as the writer
		// left it after pass 1 (they may have kept their own words or answered in their own way).
		const base: Pick<Base, "text" | "inv"> = this.base ?? { text: d.text, inv: (p) => p };
		const ss = sentences(base.text, d.target);
		const now = (p: number, side: "from" | "to") => this.map(base.inv(p, side), side);
		// Only changes the writer took count as fixing a spot; one they turned down left the words as they were.
		const applied = this.applied;
		const wordsIn = (x: string, base: number) => words(x, base);
		// A spot whose stumbling words pass 1 already rewrote, or whose named words are gone, has nothing left to ask.
		const fixed = (quote?: string | null, problem = "") => {
			// Pass 2 read the pass-1 text: nothing it found there was fixed before it looked.
			if (this.base) return false;
			const at = quote ? d.text.indexOf(quote) : -1;
			if (at < 0) return false;
			const ws = wordsIn(quote!, at);
			const inHunk = (w: { from: number; to: number }) => applied.some((f) => f.from <= w.from && w.to <= f.to);
			if (ws.length && ws.every(inHunk)) return true;
			const named = Array.from(problem.matchAll(/['‘"“«「]([^'’"”»」]{2,40})['’"”»」]/g), (m) => m[1].trim().toLowerCase());
			return ws.some(inHunk) && named.some((n) => d.text.toLowerCase().includes(n) && !this.pass1Text.toLowerCase().includes(n));
		};
		// In a translation what is meant is the source, word for word: the analysis's own account of it drifted
		// ("海盐奶泡" became "a light sea-salt foam") and the reference followed. The paragraph (or line) the spot sits in
		// is paired with the source's (src/translate/blocks.ts), and that is the meaning the passes work from.
		const tr = this.input.translation;
		const byLine = !!tr && !/\n\s*\n/.test(tr.source);
		const srcBlocks = tr ? blocksOf(tr.source, byLine) : [];
		const meantAt = (at: number) => {
			if (!tr || !srcBlocks.length) return tr?.source ?? "";
			const b = srcBlocks[Math.min(blockAt(this.pass1Text, at, byLine), srcBlocks.length - 1)];
			return tr.source.slice(b.from, b.to);
		};
		const asMeant = (p: PartQ, at: number): PartQ =>
			tr ? { ...p, mode: "given", question: undefined, readings: [{ label: this.t("trSource"), meaning: meantAt(at) }] } : p;
		const found = p2.analysis.spots
			.filter((s) => this.more || !s.tier)
			.map((s) => (s.tier ? { ...s, problem: `${this.opt}${s.problem}` } : s))
			.map((s) => {
				const [from, to] = spotRange(base.text, ss, s);
				const q: PartQ =
					s.kind === "formulation"
						? { problem: s.problem, mode: "given", readings: [{ label: "", meaning: AS_WRITTEN }] }
						: { problem: s.problem, question: s.question ?? undefined, mode: s.mode, readings: s.readings.map(tappable) };
				return {
					from: now(from, "from"),
					to: now(to, "to"),
					ok: from >= 0 && !fixed(s.quote, s.problem),
					quote: s.quote ?? "",
					part: asMeant(q, now(from, "from")),
				};
			})
			.filter((s) => s.ok && !!this.pass1Text.slice(s.from, s.to).trim());
		// A span pass 1 left for pass 2 that no spot covers is still the writer's to decide: it becomes a stop of its own,
		// with pass 1's note as the problem (in a translation the source says what is meant).
		for (const f of this.defers) {
			const from = this.map(f.from, "from");
			const to = this.map(f.to, "to");
			if (found.some((x) => x.from < to && x.to > from) || !this.pass1Text.slice(from, to).trim()) continue;
			found.push({ from, to, ok: true, quote: f.before, part: asMeant({ problem: f.note, mode: "ask", readings: [] }, from) });
		}
		if (newSpot && this.pass1Text.includes(newSpot.where)) {
			const at = this.pass1Text.indexOf(newSpot.where);
			found.push({
				from: at,
				to: at + newSpot.where.length,
				ok: true,
				quote: newSpot.where,
				part: { problem: newSpot.problem, mode: "one", readings: [{ label: this.t("yes"), meaning: newSpot.reading }] },
			});
		}
		// Units: spots that overlap in any way, nested ones too, become one stop with several problems, rewritten once.
		// Stops never overlap, so putting one stop's version in never swallows another's words (2026-11-10: a phrase stop
		// inside a sentence stop came first, its reference rewrote the whole sentence, and the sentence's own problems
		// were then asked about words that were gone).
		const ordered: { from: number; to: number; quote: string; parts: PartQ[] }[] = [];
		for (const f of [...found].sort((x, y) => x.from - y.from || y.to - x.to)) {
			const g = ordered.at(-1);
			if (g && f.from < g.to) {
				g.to = Math.max(g.to, f.to);
				g.parts.push(f.part);
				g.quote = "";
				continue;
			}
			ordered.push({ from: f.from, to: f.to, quote: f.quote, parts: [f.part] });
		}
		const stops: Stop[] = ordered.map((g, i) => {
			const q = g.quote || this.pass1Text.slice(g.from, g.to);
			return {
				id: `s${i + 1}`,
				from: g.from,
				to: g.to,
				parts: g.parts,
				label: q.length > 26 ? `${q.slice(0, 24)}…` : q,
				history: [],
				round: 0,
				seen: new Set(),
				ticks: [],
				graded: new Map(),
			};
		});
		this.stops = stops;
		this.initial = stops.map((s) => ({ ...s, parts: s.parts, history: [], seen: new Set(), ticks: [], graded: new Map() }));
		// Every stop's material is prepared now, in order, one at a time in the background lane, so moving on rarely waits.
		for (const s of stops) this.prefetch(s);

		// The page's map highlights items: the stops plus the pieces of sentences outside them.
		const frags: Span[] = [];
		for (const s of sentences(this.pass1Text, d.target)) {
			if (s.text === SEP) continue;
			let pos = s.from;
			for (const st of shown(stops)
				.filter((x) => x.to > s.from && x.from < s.to)
				.sort((a, b) => a.from - b.from)) {
				if (st.from > pos && this.pass1Text.slice(pos, st.from).trim()) frags.push({ id: `f${frags.length + 1}`, from: pos, to: st.from });
				pos = Math.max(pos, st.to);
			}
			if (pos < s.to && this.pass1Text.slice(pos, s.to).trim()) frags.push({ id: `f${frags.length + 1}`, from: pos, to: s.to });
		}
		// Trim fragment edges to their words so items never swallow the spaces between them.
		for (const f of frags) {
			while (f.from < f.to && /\s/.test(this.pass1Text[f.from])) f.from++;
			while (f.to > f.from && /\s/.test(this.pass1Text[f.to - 1])) f.to--;
		}
		const items: Span[] = [...shown(stops).map((s) => ({ id: s.id, from: s.from, to: s.to })), ...frags];
		const rangesOf = (ids: number[]) => ss.filter((x) => ids.includes(x.id)).map((x) => [now(x.from, "from"), now(x.to, "to")]);
		const hlOf = (ids: number[]) => {
			const rs = rangesOf(ids);
			return items.filter((it) => rs.some(([a, b]) => it.from < b && it.to > a)).map((it) => it.id);
		};
		// A node needs fixing when a stop falls in its own sentences; the note is the start of that stop's problem.
		const fixIn = (ids: number[]) => {
			const rs = rangesOf(ids);
			return stops.find((st) => rs.some(([a, b]) => st.from < b && st.to > a));
		};
		const firstSentence = (x: string) => x.match(/^.*?[。！？.!?](?=\s|$)/u)?.[0] ?? x;
		// own: the sentences whose stops this row answers for (a point leaves those its parts list to them).
		const row = (
			n: { text: string; sentences: number[]; missing?: boolean; note?: string | null },
			depth: number,
			kind?: string,
			hl?: string[],
			own = n.sentences,
		) => {
			const fix = n.missing ? undefined : fixIn(own);
			return {
				depth,
				kind,
				what: n.text,
				st: n.missing ? "miss" : fix ? "fix" : undefined,
				note: n.missing ? (n.note ?? "") : fix ? firstSentence(fix.parts[0].problem) : "",
				hl: hl ?? hlOf(n.sentences),
			};
		};
		const map = ol?.points.length
			? ol.points.flatMap((p) => {
					const inParts = p.parts.flatMap((x) => x.sentences);
					return [
						row(
							p,
							0,
							undefined,
							hlOf([...p.sentences, ...inParts]),
							p.sentences.filter((n) => !inParts.includes(n)),
						),
						...p.parts.map((x) => row(x, 1, this.t(`kind${x.kind[0].toUpperCase()}${x.kind.slice(1)}`))),
					];
				})
			: p2.analysis.map.map((r) => {
					// Whether a step needs fixing, and why, comes from the stops as rebased, not from the analysis's own note on the draft.
					const fix = r.status === "missing" ? undefined : fixIn(r.sentences);
					return {
						depth: 0,
						kind: undefined,
						what: `${r.role}：${r.what}`,
						st: r.status === "missing" ? "miss" : fix ? "fix" : undefined,
						note: r.status === "missing" ? (r.note ?? "") : fix ? firstSentence(fix.parts[0].problem) : "",
						hl: hlOf(r.sentences),
					};
				});
		return {
			map,
			stops: stops.map((s) => ({ id: s.id, label: s.label, parts: s.parts, who: this.readerFor(s.from) })),
			doc: toDoc(this.pass1Text, items, this.marks, this.chips),
		};
	}

	/** Whether a reference drops words of the writer's outside the stop (its sentence, when it replaces that). */
	private outside(m: Material, text: string, stop: Stop) {
		const at = text.indexOf(m.replaces, Math.max(0, stop.from - m.replaces.length));
		if (at < 0) return true;
		const kept = new Set(words(plainRef(m.ref)).map((w) => w.w));
		return words(m.replaces, at).some((w) => (w.to <= stop.from || w.from >= stop.to) && !kept.has(w.w));
	}

	/** The passages pass 1 left for the writer: no version may carry them back. */
	private get left() {
		return this.defers.map((f) => f.before).filter((x) => x.trim());
	}

	private prep(stop: Stop, meanings: string[]) {
		const text = this.text;
		const anchor = text.slice(stop.from, stop.to).trim();
		const own = sentences(text, this.d.target).filter((x) => x.from < stop.to && x.to > stop.from);
		const sentence = own.map((x) => x.text).join(" ") || anchor;
		// The reference replaces the stop's words, or the whole sentences they are in when no other stop is there.
		const [wFrom, wTo] = own.length ? [Math.min(stop.from, own[0].from), Math.max(stop.to, own.at(-1)!.to)] : [stop.from, stop.to];
		// Once a stop has its material, what it replaces is settled: another reading rewrites the same words.
		const wide = !stop.m && this.stops.every((o) => o === stop || o.done || o.gone || o.to <= wFrom || o.from >= wTo);
		const many = stop.parts.length > 1;
		const problem = many ? stop.parts.map((p, i) => `${i + 1}. ${p.problem}`).join("\n") : stop.parts[0].problem;
		const reading = many ? meanings.map((x, i) => `${i + 1}. ${x}`).join("\n") : meanings[0];
		// Keyed by what the material is about, so a rewrite elsewhere in the post does not throw it away.
		const key = `${stop.id}\u0000${reading}\u0000${anchor}\u0000${sentence}`;
		const purpose = `material ${stop.id} · ${reading}`;
		return {
			anchor,
			problem,
			reading,
			key,
			purpose,
			make: (bg: boolean) =>
				(async (ai: Caller) => {
					const spot = { sentences: sentence, phrase: anchor, problem, reading, mode: stop.parts[0].mode, wide };
					const around = text.slice(0, stop.from) + text.slice(stop.to);
					// The rest of its paragraph: a reference must not say again what is said right next to it.
					const pFrom = text.lastIndexOf("\n\n", stop.from) + 1;
					const pEnd = text.indexOf("\n\n", stop.to);
					const near = text.slice(pFrom, stop.from) + "\n" + text.slice(stop.to, pEnd < 0 ? text.length : pEnd);
					// Code checks what the model wrote before anyone sees it: it replaces what it may (the stop, or its sentences when
					// allowed), and it carries nothing left in the writer's language. Otherwise it is asked once more, told why.
					const wrong = (m: Material) => {
						const at = text.indexOf(m.replaces, Math.max(0, wFrom - m.replaces.length));
						const end = at + m.replaces.length;
						if (!m.replaces.trim() || at < 0 || at > stop.from || end < stop.to || at < (wide ? wFrom : stop.from) || end > (wide ? wTo : stop.to))
							return `replaces must be exactly "${anchor}"${wide ? `, or the whole of "${sentence}"` : ""}; it was "${m.replaces}".`;
						const r = residue(m.ref, this.d, this.left, around);
						if (r) return `ref still has "${r}", left as the writer wrote it: write it in ${LANG_NAMES[this.d.target]}, as the writer means it.`;
						const said = repeats(plainRef(m.ref), m.replaces, near);
						return said ? `ref says "${said}" again, which the post already says right next to it: say it once.` : null;
					};
					let m = (await material(this.d, text, spot, ai, 0, this.input.translation?.original)).value;
					const bad = wrong(m);
					if (bad) {
						const again = (await material(this.d, text, spot, ai, 0, this.input.translation?.original, bad)).value;
						if (!wrong(again)) m = again;
						else if (wrong(m)?.startsWith("replaces")) m = { ...m, replaces: anchor };
					}
					m = { ...m, alts: m.alts.filter((a) => !residue(a, this.d, this.left, around)) };
					// The reasons the reference gives against the writer's own words are checked before anyone sees them, when it
					// changed words outside the stop (inside it, changing them is the point); the vet's version is used only if it
					// carries nothing back (it once put "愤怒" back into "hurt and angry").
					if (this.outside(m, text, stop)) {
						const v = (await vetMaterial(this.d, text, spot, m, ai, 0)).value;
						if (!residue(v.ref, this.d, this.left, around)) m = { ...v, alts: v.alts.filter((a) => !residue(a, this.d, this.left, around)) };
					}
					m = trimSame(m, text, stop.from, stop.to);
					// The gate: the reference is graded as if the learner had written it. A likely mistake it "makes" itself is
					// a wrong check and goes; a reference that leaves something out or has an error is written once more, told
					// what. 2026-11-10: "…a slow burn, and it works, so when…" lost the causal link; "hurt and 愤怒" kept Chinese.
					const check = async (x: Material) => {
						const g = (
							await grade(this.d, text, { reading, problem, material: x, attempt: plainRef(x.ref) }, ai, {
								strategy: ai.grader,
							})
						).value;
						const hit = new Set((g.hits ?? []).flatMap((h, i) => (h ? [i] : [])));
						const faults = [
							...(g.missing ?? []).map((x) => `it leaves out ${x}`),
							...g.errors.map((e) => `"${e.words}" should be "${e.fix}" (${e.why})`),
							...(g.meaning_ok ? [] : [`it does not say what the writer means: ${g.reads_as ?? ""}`]),
						];
						return { m: { ...x, checks: x.checks.filter((_, i) => !hit.has(i)) }, faults };
					};
					const first = await check(m);
					if (!first.faults.length) return first.m;
					const fixed = (x: Material) => (x.replaces === m.replaces ? x : null);
					const again = fixed(
						(
							await material(
								this.d,
								text,
								{ ...spot, phrase: m.replaces, wide: false },
								ai,
								0,
								this.input.translation?.original,
								`the reference was graded as if a learner had written it: ${first.faults.join("; ")}.`,
							)
						).value,
					);
					if (!again || wrong(again)) return first.m;
					const second = await check(
						trimSame({ ...again, alts: again.alts.filter((a) => !residue(a, this.d, this.left, around)) }, text, stop.from, stop.to),
					);
					return second.faults.length <= first.faults.length ? second.m : first.m;
				})(bg ? this.ai.ahead(purpose) : this.ai.for(purpose)),
		};
	}
	/** bg: a guess at what comes next (the background lane); otherwise the learner is waiting, and a queued guess for it goes now. */
	private fetch(stop: Stop, meanings: string[], bg = false) {
		const p = this.prep(stop, meanings);
		let m = this.materials.get(p.key);
		if (!m) {
			m = p.make(bg);
			m.catch(() => this.materials.delete(p.key));
			this.materials.set(p.key, m);
		} else if (!bg) this.ai.lanes?.promote((x) => x === p.purpose);
		return { ...p, m };
	}
	private prefetch(stop?: Stop) {
		if (!stop || stop.gone || stop.done) return;
		this.fetch(
			stop,
			stop.parts.map((p) => p.readings[0]?.meaning ?? p.problem),
			true,
		);
	}

	/** C5 for a stop and the readings the learner confirmed; prepares what comes next while they write. */
	async material(id: string, meanings?: string[]) {
		const stop = this.stops.find((s) => s.id === id);
		if (!stop) throw new Error(`no stop ${id}`);
		const means = meanings ?? stop.parts.map((p) => p.readings[0]?.meaning ?? p.problem);
		const f = this.fetch(stop, means);
		// Other readings are not prepared on a guess (2026-11-10: in a Spanish email with five "ask" stops, the readings
		// nobody chose were a third of the session's cost). Once the learner chooses, its material is written while they
		// write their version: the stop keeps the same words to replace, so nothing on the page has to move.
		// Once the writer has said what they mean, the other readings prepared for this stop are not needed (queued ones never start).
		if (meanings) this.ai.lanes?.discard((x) => x.startsWith(`material ${stop.id} · `) && x !== f.purpose);
		const m = withLivePieces(await f.m);
		Object.assign(stop, {
			m,
			reading: f.reading,
			problem: f.problem,
			used: f.purpose,
			history: [],
			round: 0,
			seen: new Set(),
			ticks: [],
			graded: new Map(),
		});
		this.prefetch(this.stops.find((s) => !s.done && !s.gone && s !== stop && s.from >= stop.to));
		// The marked words become what the reference replaces (more or less than the spot), so the highlight, the struck
		// words while the learner writes and what their version finally replaces are the same stretch.
		let doc: Doc | undefined;
		const at = this.text.indexOf(m.replaces, Math.max(0, stop.from - m.replaces.length));
		const end = at + m.replaces.length;
		const clear = this.stops.every((o) => o === stop || o.done || o.gone || o.to <= at || o.from >= end);
		if (m.replaces.trim() && at >= 0 && at < stop.to && end > stop.from && (at !== stop.from || end !== stop.to) && clear) {
			stop.from = at;
			stop.to = end;
			doc = toDoc(this.text, this.items(), this.marks, this.chips);
		}
		// The page marks the reference's key words; code picks them from the rows and what changed (pass2/keys.ts).
		const keyed = markKeys(m.replaces, m.ref, m.why);
		// In a scenario, the stop that made a turn go off is opened by the real reply that showed it.
		const real = this.readerFor(stop.from, stop.id)?.line;
		// What the learner first wrote for this stretch, before pass 1, for "you first wrote" (the retrieval, the notebook).
		const at1 = this.pass1Text.indexOf(m.replaces);
		const orig = m.replaces && at1 >= 0 ? this.d.text.slice(this.unmap(at1, "from"), this.unmap(at1 + m.replaces.length, "to")).trim() : null;
		return {
			doc,
			orig,
			reader: real ?? m.reader,
			ref: keyed.ref,
			alts: m.alts,
			pieces: m.pieces.map((p) => ({ text: p, own: pieceOwnership(this.text, p) === "own" })),
			construct: m.construct,
			why: keyed.why,
			prompt: m.prompt,
			success: m.success,
		};
	}

	/** What each hint piece of a stop's current material means, with an unrelated example; asked once per set of pieces. */
	private glosses = new Map<string, Promise<Awaited<ReturnType<typeof pieceNotes>>>>();
	async pieces(id: string) {
		const stop = this.stops.find((s) => s.id === id)!;
		const pieces = stop.m?.pieces ?? [];
		const key = pieces.join("\u0000");
		let n = this.glosses.get(key);
		if (!n) {
			n = pieceNotes(this.d, pieces, this.ai.for(`pieces ${id}`), stop.m ? plainRef(stop.m.ref) : undefined);
			n.catch(() => this.glosses.delete(key));
			this.glosses.set(key, n);
		}
		const notes = await n;
		// Matched back by text, in case the model reorders or reformats a piece.
		const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
		// By position only when the model kept to the list; a note for a word that is not a piece is never shown under one.
		const byIndex = notes.length === pieces.length;
		return pieces
			.map((p, i) => notes.find((x) => norm(x.piece) === norm(p)) ?? (byIndex ? notes[i] : null))
			.map((x, i) => ({ piece: pieces[i], gloss: x?.gloss ?? "", example: x?.example ?? "" }));
	}

	/** The two hints for a stop's current material, from the learner's last failed try when there is one; asked once each. */
	private hints = new Map<string, Promise<{ plan: string; example: string }>>();
	async hint(id: string) {
		const stop = this.stops.find((s) => s.id === id)!;
		const m = stop.m!;
		const last = stop.history.at(-1);
		const key = [id, m.ref, last?.text ?? ""].join("\u0000");
		let h = this.hints.get(key);
		if (!h) {
			h = hintFor(
				this.d,
				this.text,
				m,
				{ problem: stop.problem ?? "", reading: stop.reading ?? "", attempt: last?.text, feedback: last?.feedback },
				this.ai.for(`hint ${id}`),
			);
			h.catch(() => this.hints.delete(key));
			this.hints.set(key, h);
		}
		return h;
	}

	/**
	 * The notebook entries for a finished piece. Offered: the pass-2 parts the learner reworked (what they first wrote
	 * and what they settled on) and the pass-1 changes they did not make unaided (`p1`, their ids; spelling, punctuation
	 * and optional changes never are). notesFor says which earn an entry. A pass-1 change is shown in its sentence, as
	 * first written and as pass 1 left it.
	 */
	async notes(items: { id: string; orig: string; final: string }[], p1: string[] = []) {
		const known = items.map((x) => ({ x, st: this.stops.find((s) => s.id === x.id) })).filter((y) => y.st?.m);
		// Only the tutor's notes on words the learner kept: the material's pattern and the rest may be for a version they did not take.
		const kept = (final: string, why: { label: string; note: string }[]) =>
			why
				.filter((w) =>
					final.toLowerCase().includes(
						w.label
							.replace(/⟨[^⟩]*⟩/g, "")
							.trim()
							.toLowerCase(),
					),
				)
				.map((w) => `${w.label}: ${w.note}`);
		const ss = sentences(this.d.text, this.d.target);
		const changes = this.p1.filter((f) => p1.includes(f.id) && f.kind !== "mechanics" && !f.optional && !f.tier && this.applied.includes(f));
		const fromP1 = changes.map((f) => {
			const s = ss.find((x) => x.from <= f.from && f.from <= x.to);
			const orig = s ? s.text : f.before;
			const final = s && this.pass1Text ? this.pass1Text.slice(this.map(s.from, "from"), this.map(s.to, "to")).trim() : f.after;
			return {
				id: f.id,
				orig,
				final,
				was: f.before,
				item: {
					orig,
					final,
					before: f.before,
					after: f.after,
					problem: `${f.before || "∅"} → ${f.after}: ${f.note}`,
					why: [],
					how: "corrected" as const,
				},
			};
		});
		const fromP2 = known.map(({ x, st }) => ({
			id: x.id,
			orig: x.orig,
			final: x.final,
			was: undefined as string | undefined,
			item: {
				orig: x.orig,
				final: x.final,
				before: x.orig,
				after: x.final,
				problem: st!.problem ?? "",
				why: kept(x.final, st!.m!.why),
				how: "rebuilt" as const,
			},
		}));
		const all = [...fromP2, ...fromP1];
		const bodies = await notesFor(
			this.d,
			all.map((a) => a.item),
			this.ai.for("notes"),
		);
		// `was`: a pass-1 change's own words, short enough for "instead of" beside the phrase (orig is its whole sentence).
		return Object.fromEntries(all.map((a, i) => [a.id, { note: bodies[i], orig: a.orig, final: a.final, was: a.was }]));
	}

	async ownReading(id: string, k: number, said: string) {
		const stop = this.stops.find((s) => s.id === id)!;
		const anchor = this.text.slice(stop.from, stop.to).trim();
		const r = await ownReading(this.d, this.text, anchor, stop.parts[k].problem, said, this.ai.for(`reading ${id}`), this.imported);
		// What they said may be what later spots need to know (who a name is): every call from now on reads it.
		this.d.told ??= [];
		this.d.told.push(`About "${anchor.length > 60 ? `${anchor.slice(0, 58)}…` : anchor}": ${said}`);
		return r;
	}

	/** The writer keeps this part as they wrote it: the stop closes and the post does not change. */
	keep(id: string) {
		const stop = this.stops.find((s) => s.id === id)!;
		stop.done = true;
		this.ai.lanes?.discard((x) => x.startsWith(`material ${id} · `));
		this.decided.push(`「${this.text.slice(stop.from, stop.to).trim()}」→ kept as written`);
		this.settled();
		this.prefetch(this.stops.find((s) => !s.done && !s.gone && s.from >= stop.to));
		return { doc: toDoc(this.text, this.items(), this.marks, this.chips) };
	}

	/** R2: the grade and the feedback the page shows. The same words always get the same answer. */
	async grade(id: string, attempt: string): Promise<GradeOut> {
		const stop = this.stops.find((s) => s.id === id)!;
		// Spacing and the final mark never change a grade (the mark is placed for them); case can, so it stays.
		const key = attempt
			.trim()
			.replace(/\s+/g, " ")
			.replace(/[.!?…。！？]+$/, "");
		const seen = stop.graded.get(key);
		if (seen) return seen.pass ? seen : { ...seen, reader: null, tutor: `${this.t("sameAgain")} ${seen.tutor}` };
		const m = stop.m!;
		// The reference (or one of its other versions) word for word passes without a call: the grader is noisy enough to
		// fail it on a check alone (2026-11-10: a learner who pasted the reference was failed seventy times).
		const flat = (x: string) =>
			x
				.trim()
				.replace(/\s+/g, " ")
				.replace(/[’‘]/g, "'")
				.replace(/[“”]/g, '"')
				.replace(/[.!?…。！？]+$/, "");
		// A ⟨placeholder⟩ is something only the writer knows: never a finished version.
		if (/⟨[^⟩]*⟩/.test(attempt)) {
			const out: GradeOut = { pass: false, reader: null, tutor: this.t("fillStill"), round: stop.round, repaired: null };
			return out;
		}
		if ([plainRef(m.ref), ...m.alts].some((x) => flat(x) === flat(attempt))) {
			const out: GradeOut = {
				pass: true,
				success: m.success,
				ticks: m.why.map((_, i) => i),
				own: null,
				choices: m.why.map((w, i) => ({ n: i, mine: w.label, verdict: "same", note: null })),
				extra: [],
			};
			stop.ticks = m.why.map((_, i) => i + 1);
			stop.graded.set(key, out);
			return out;
		}
		const anchor = this.text.slice(stop.from, stop.to).trim();
		const scope = scopeOf(this.text, this.text.includes(m.replaces) ? m.replaces : anchor, attempt);
		const g = (
			await grade(
				this.d,
				this.text,
				{ reading: stop.reading!, problem: stop.problem!, material: { ...m, replaces: scope }, attempt, earlier: stop.history },
				this.ai.for(`grade ${id}`),
				{ strategy: this.ai.grader },
			)
		).value;
		let out: GradeOut;
		if (g.verdict === "pass") {
			stop.ticks = g.ticks;
			out = {
				pass: true,
				success: m.success,
				ticks: g.ticks.map((t) => t - 1),
				own: g.own ?? null,
				choices: (g.choices ?? []).map((c) => ({ ...c, n: c.n - 1 })),
				extra: g.extra ?? [],
			};
		} else {
			stop.round++;
			const fb = feedback(m, g, stop.round);
			const check = g.check ?? -1;
			const reader = fb?.reader && !stop.seen.has(check) ? fb.reader : null;
			stop.seen.add(check);
			const line = fb?.tutor || g.errors.map((e) => `${e.words} → ${e.fix}: ${e.why}`).join("\n") || this.t("checkAgain");
			stop.history.push({ text: attempt, feedback: line });
			const repaired = within(g.repaired?.trim() || "", this.text, scope);
			out = { pass: false, reader, tutor: line, round: stop.round, repaired: repaired && !residue(repaired, this.d, this.left) ? repaired : null };
		}
		stop.graded.set(key, out);
		return out;
	}

	/**
	 * The retrieval before the end: the learner says a part they reworked again from memory. Graded like their try
	 * was, against the same material and the post as it stood then, so another right way passes and a slip is named.
	 */
	async recall(id: string, attempt: string) {
		const stop = this.stops.find((s) => s.id === id);
		if (!stop?.m || !stop.textAt) throw new Error(`no finished stop ${id}`);
		const m = stop.m;
		const at = stop.textAt;
		const scope = scopeOf(at, at.includes(m.replaces) ? m.replaces : at.slice(stop.from, stop.to).trim(), attempt);
		const g = (
			await grade(
				this.d,
				at,
				{ reading: stop.reading ?? "", problem: stop.problem ?? "", material: { ...m, replaces: scope }, attempt, earlier: [] },
				this.ai.for(`recall ${id}`),
				{ strategy: this.ai.grader },
			)
		).value;
		if (g.verdict === "pass") return { pass: true as const };
		const fb = feedback(m, g, 1);
		return { pass: false as const, tutor: fb?.tutor || g.errors.map((e) => `${e.words} → ${e.fix}: ${e.why}`).join("\n") || this.t("checkAgain") };
	}

	/**
	 * R3: 我有疑问. An answer may show the two were not talking about the same thing: then the reference is redone and
	 * explained again, or, when the writer meant something else, the spot starts over from that meaning (the page then
	 * asks for its material and grades their version against it).
	 */
	async question(id: string, mine: string | null, q: string) {
		const stop = this.stops.find((s) => s.id === id)!;
		const a = await answerQuestion(
			this.d,
			this.text,
			stop.m!,
			mine,
			q,
			{ reading: stop.reading ?? "", problem: stop.problem ?? "", history: stop.history },
			this.ai.for(`question ${id}`),
			this.imported,
		);
		// The page shows the answer at once, then asks for the material for the new meaning (and grades again).
		if (a.kind === "meaning" && a.meaning) return { answer: a.answer, kind: a.kind, meaning: a.meaning };
		if (a.kind === "ref" && a.revisedRef) {
			const x = await explainRef(
				this.d,
				this.text,
				stop.m!,
				plainRef(a.revisedRef!),
				mine,
				{ reading: stop.reading ?? "", problem: stop.problem ?? "" },
				this.ai.for(`explain ${id}`),
			);
			stop.m = { ...stop.m!, ref: a.revisedRef, why: x.why, alts: x.alts, construct: x.construct };
			stop.ticks = [];
			const keyed = markKeys(stop.m!.replaces, a.revisedRef, x.why);
			return { answer: a.answer, kind: a.kind, ref: keyed.ref, why: keyed.why, alts: x.alts, construct: x.construct };
		}
		if (a.kind === "keep") return { answer: a.answer, kind: a.kind };
		return { answer: a.answer, kind: "explain" as const };
	}

	private items(extra?: { id: string; from: number; to: number }): Span[] {
		const spans: Span[] = shown(this.stops).map((s) => ({ id: s.id, from: s.from, to: s.to }));
		this.revised.forEach((r, i) => {
			spans.push({ id: `r${i + 1}`, from: r.from, to: r.to, revised: true });
		});
		if (!extra) return spans;
		return [extra, ...spans.filter((s) => s.id !== extra.id && (s.to <= extra.from || s.from >= extra.to))];
	}

	/** Where a version of this stop goes and the post it makes; nothing changes until apply. */
	private place(stop: Stop, final: string) {
		const text = this.text;
		const anchor = text.slice(stop.from, stop.to).trim();
		const m = stop.m;
		const scope = scopeOf(text, m && text.includes(m.replaces) ? m.replaces : anchor, final);
		const at = Math.max(text.indexOf(scope, Math.max(0, stop.from - scope.length)), 0);
		return { anchor, at, end: at + scope.length, ...placeAt(text, at, at + scope.length, final) };
	}

	/** The learner's chosen version goes into the post where it fits; every other range moves with it. */
	apply(id: string, final: string, self: boolean) {
		const stop = this.stops.find((s) => s.id === id)!;
		const text = this.text;
		const p = this.place(stop, final);
		const { at, end } = p;
		const oldDoc = toDoc(text, this.items({ id, from: at, to: end }), this.marks, this.chips);
		const delta = p.text.length - text.length;
		for (const o of this.stops) {
			if (o === stop || o.gone || o.done) continue;
			if (o.to <= at) continue;
			if (o.from >= end) {
				o.from += delta;
				o.to += delta;
			} else if (o.from >= at && o.to <= end) o.gone = true;
			else {
				o.from = Math.min(o.from, at);
				o.to = Math.max(o.to, end) + delta;
			}
		}
		this.revised = this.revised
			.filter((r) => r.to <= at || r.from >= end)
			.map((r) => (r.from >= end ? { from: r.from + delta, to: r.to + delta } : r));
		this.revised.push({ from: p.from, to: p.to });
		stop.done = true;
		stop.textAt = text;
		this.text = p.text;
		// Materials prepared for readings not taken, and for stops this rewrite swallowed, were never used.
		this.ai.lanes?.discard(
			(x) => (x.startsWith(`material ${stop.id} · `) && x !== stop.used) || this.stops.some((o) => o.gone && x.startsWith(`material ${o.id} · `)),
		);
		if (stop.m) this.learned.push({ construct: stop.m.construct, self });
		this.decided.push(this.decision(stop, p.anchor));
		this.settled();
		return {
			oldDoc,
			newDoc: toDoc(p.text, this.items(), this.marks, this.chips),
			gone: this.stops.filter((s) => s.gone).map((s) => s.id),
			text: p.text,
			placed: p.placed,
		};
	}
	private decision(stop: Stop, anchor: string) {
		return `「${anchor}」→ ${stop.reading ?? ""}`;
	}

	/** The closing check and the reader's last reply, for one final text; asked for early, so the end does not wait. */
	private endFor(text: string, decided: string[], bg = false) {
		let e = this.ends.get(text);
		if (e && !bg) this.ai.lanes?.promote((x) => x === endPurpose(text));
		if (!e) {
			const ai = bg ? this.ai.ahead(endPurpose(text)) : this.ai.for(endPurpose(text));
			e = Promise.all([contentCheck(this.d, this.pass1Text, text, decided, ai), this.closing(text, ai)]).then(([issues, c]) => ({ issues, ...c }));
			e.catch(() => this.ends.delete(text));
			this.ends.set(text, e);
		}
		return e;
	}
	/**
	 * A regular's reply to the finished post. A scenario's page ends with how the conversation went on and a translation's
	 * with the authentic text, so neither asks for one (it used to read a whole exchange, separators and all, as one post).
	 */
	private async closing(text: string, ai: Caller) {
		return { closing: this.ex || this.input.translation ? "" : await closingReaction(this.d, text, ai) };
	}
	/**
	 * Once the last stop is settled the post is final: its check and the reader's reply start then, while the learner
	 * says a part again from memory. They used to be prepared for every likely final text, most of them never used.
	 */
	private settled() {
		if (this.stops.every((o) => o.done || o.gone)) this.endFor(this.text, [...this.decided], true);
	}

	/** Pass 2 again from the pass-1 text. */
	resetP2() {
		this.text = this.pass1Text;
		this.stops = this.initial.map((s) => ({ ...s, done: false, gone: false, history: [], seen: new Set(), ticks: [], round: 0, graded: new Map() }));
		this.revised = [];
		this.learned = [];
		this.decided = [];
	}

	/** A scenario's revised turn, answered again by whoever answered it the first time. */
	async replay(turn: number, text: string) {
		if (!this.ex) throw new Error("not a scenario");
		const r = await replayReply(this.ex as Case, turn, text, this.d, this.ai.for(`replay T${turn}`));
		return r ?? { author: null, text: "", before: "" };
	}

	async end() {
		const { issues, closing } = await this.endFor(this.text, this.decided);
		this.ai.lanes?.discard((x) => x.startsWith("end · ") && x !== endPurpose(this.text));
		return { issues, closing, learned: this.learned, text: this.text };
	}
}

/**
 * The open stops the post can mark. Marks cannot nest, and a stop inside a larger one comes first, so the larger one
 * is marked once the stops inside it are done (or, for the same stretch, once the earlier one is).
 */
export function shown<T extends { from: number; to: number; done?: boolean; gone?: boolean }>(stops: T[]): T[] {
	const open = stops.filter((s) => !s.done && !s.gone);
	return open.filter((o, i) => !open.some((x, j) => x !== o && x.from >= o.from && x.to <= o.to && (x.to - x.from < o.to - o.from || j < i)));
}

/** One name per final text the ending was prepared for. */
function endPurpose(text: string) {
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
	return `end · ${(h >>> 0).toString(36)}`;
}
/** The grader's repaired version, without any of the post around the learner's stretch it copied in. */
export function within(repaired: string, text: string, scope: string) {
	const at = text.indexOf(scope);
	if (!repaired || at < 0) return repaired;
	const next = text
		.slice(at + scope.length)
		.trim()
		.slice(0, 30);
	const cut = next.length >= 12 ? repaired.indexOf(next) : -1;
	const prev = text.slice(0, at).trim().slice(-30);
	const head = prev.length >= 12 ? repaired.indexOf(prev) : -1;
	let out = cut > 0 ? repaired.slice(0, cut) : repaired;
	if (head >= 0) out = out.slice(head + prev.length);
	return out.trim();
}
const plainRef = (ref: string) => ref.replace(/\[([^\]]+)\]/g, "$1");
/**
 * The hint pieces that are still in the reference. The vet (pass2/material.ts) puts the writer's own words back where
 * the tutor's choice was only taste, but the pieces were picked for the tutor's version ("cut off" stayed a hint after
 * the reference went back to "can't reach"). A fork keeps the side that survived.
 */
export function withLivePieces<M extends { ref: string; alts: string[]; pieces: string[] }>(m: M): M {
	const hay = ` ${[plainRef(m.ref), ...m.alts].join(" ").toLowerCase()} `;
	const has = (x: string) => new RegExp(`[^\\p{L}]${x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\p{L}]`, "u").test(hay);
	const pieces = m.pieces
		.map((p) =>
			p
				.split("/")
				.map((x) => x.trim())
				.filter((x) => x && has(x))
				.join(" / "),
		)
		.filter(Boolean);
	return pieces.length ? { ...m, pieces } : m;
}
