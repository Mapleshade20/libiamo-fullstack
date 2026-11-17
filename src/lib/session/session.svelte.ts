import { tick } from "svelte";
import { app } from "#lib/account/app.svelte.ts";
import ChoiceCard from "#lib/components/session/ChoiceCard.svelte";
import FixCard from "#lib/components/session/FixCard.svelte";
import NoteCard from "#lib/components/session/NoteCard.svelte";
import { captureTourState } from "#lib/components/tour/lifetime.ts";
import { practised, sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import { isAppLang } from "#lib/constants.ts";
import { loadLang, t } from "#lib/i18n/index.svelte.ts";
import { type Stop as Halt, LimitError, needKey, stopOf } from "#lib/llm/stops.ts";
import { refreshWriting } from "#lib/writing/writing.svelte.ts";
import { goto } from "$app/navigation";
import { Cancelled, Clock, reduced, SLOW } from "./clock";
import type { Post, Who } from "./post";
import { glide } from "./scroll";
import { bare, liveFit, plain, rich } from "./text";
import {
	type DocDef,
	type Explained,
	type Grade,
	type Landed,
	type MapRow,
	type Material,
	type P1Answer,
	type P1Stop,
	type Scene,
	SEP,
	type Setup,
	type Spot,
	type SpotResult,
} from "./types";

/*
 * One rehearsal session, the whole way: the scene card, pass 1 (改对: the tutor types the draft out and stops at each
 * mark, in cards under the line) and pass 2 (改好: the reader asks, the learner rewrites, in a conversation beside the
 * post), then one "say it again" from memory and the piece's own page. Every step waits for the learner; nothing
 * advances on a timer. The steps are the server's (rehearsal-lab src/session/live.ts); the page only shows them.
 *
 * The thread and the reply bar are state the page renders; the post is drawn by `Post` (see post.ts).
 */

export type PersonKind = "tutor" | "reader" | "me";
export type Explain = {
	lead: string;
	ref: string;
	alts: string[];
	rows: { cls: "ok" | "free" | "todo"; mk: string; label: string; note: string; yours: string }[];
};
export type Msg = {
	id: number;
	who: PersonKind | null;
	kind: "text" | "thinking" | "fail" | "explain" | "map" | "again" | "turns";
	/** Said by someone other than the session's reader (a scenario's turn was answered by several people). */
	name?: string;
	/** A scenario's "how it went": each turn and how it landed. */
	turns?: Landed[];
	text?: string;
	quiet?: boolean;
	/** The spot's hint box renders inside this comment. */
	hint?: boolean;
	explain?: Explain;
	retry?: () => void;
	/** Why a call did not happen: it failed, there is no key, or the provider refused it. */
	halt?: Halt;
	/** "Say it again": the words the learner had there, struck through as the cue. */
	cue?: string;
};
/** spot: the pass-2 spot the stop is about (the overview, say-it-again and the end have none). */
export type Stop = { id: number; top: Msg[]; replies: Msg[]; done: boolean; spot?: string };
export type Hint = {
	pieces: { text: string; own: boolean }[];
	rung: { lead: string; html: string } | null;
	load: () => Promise<{ gloss?: string; example?: string }[]>;
};
export type Answer = { v: string | number; text?: string; typed?: string };
export type BarSpec = {
	/** confirm: a choice hard to take back asks once more, in place (TwoStep). */
	quick?: { label: string; v: string | number; confirm?: string }[];
	compose?: string;
	value?: string;
	onInput?: (v: string) => void;
	links?: { label: string; v: string; confirm?: string }[];
	buttons?: { label: string; v: string; primary?: boolean }[];
	/** Something in the thread that must end up fully in view before the bar changes. */
	keep?: () => Element | null;
};

/**
 * The page's bookmark, kept with the revision on the server (the `progress` action) so a reload, a restart or another
 * device comes back to where the learner was: pass 1's answers so far; once pass 2's plan is agreed, the plan, what
 * became of each spot and the conversation about the spots behind them.
 */
export type Bookmark = {
	phase: 1 | 2;
	answers: P1Answer[];
	p2?: { spots: Spot[]; landed: Landed[]; map: MapRow[]; results: Record<string, SpotResult>; thread: Stop[] };
};
/** What `resume` answers: where the revision was, and the bookmark. */
export type Resumed = { scene: Scene | null; pass1: { doc: DocDef; stops: P1Stop[] } | null; page: Bookmark | null; doc: DocDef | null };

/** Where a revision comes back to (§6.2 of the rebuild design): 0 the scene, 1 pass 1, 2 pass 2. */
export function resumeAt(r: Resumed): 0 | 1 | 2 {
	if (!r.scene || !r.pass1) return 0;
	return r.page?.phase === 2 ? 2 : 1;
}

/** How a pass-1 card went, from the learner's answer to it. */
function outcomeOf(stop: P1Stop, a: P1Answer | undefined): { deferred?: boolean; kept?: boolean; self?: boolean; ok?: boolean | null } {
	if (!a) return {};
	if (stop.kind === "choice") return { self: true, ok: a.picked === stop.answer };
	if (stop.kind === "fix") return a.keep ? { kept: true } : { self: a.self, ok: a.ok };
	if (stop.kind === "replace" || stop.kind === "link") return a.keep ? { kept: true } : {};
	if (stop.kind === "defer") return { deferred: true };
	if (stop.kind === "tick") return { kept: true };
	return {};
}

/** Resolves once no navigation's view transition is running (the root layout clears <html data-vt> when it ends). */
function navigationSettled(): Promise<void> {
	const html = document.documentElement;
	if (!html.dataset.vt) return Promise.resolve();
	return new Promise((resolve) => {
		const mo = new MutationObserver(() => {
			if (html.dataset.vt) return;
			mo.disconnect();
			resolve();
		});
		mo.observe(html, { attributes: true, attributeFilter: ["data-vt"] });
	});
}

export class Session {
	setup: Setup;
	/** The tutor's language: the session's whole interface speaks it. */
	lang = $state("en");
	phase = $state<0 | 1 | 2>(0);
	scene = $state<Scene | null>(null);
	/** The scene could not be read (or read again): why, and the way to ask again. */
	sceneError = $state<{ kind: Halt; retry: () => void } | null>(null);
	sceneBusy = $state(false);
	background = $state("");
	detail = $state<"more" | "needed">("needed");
	/** The piece: every action names it. */
	readonly sid: string;
	/** Pass 1's last card: how it went, and the post as it stands for "need it now". */
	p1end = $state<{ fixed: number; self: number; deferred: number } | null>(null);
	quick = $state<{ busy: boolean; text: string | null; halt: Halt | null }>({ busy: false, text: null, halt: null });
	/** A step outside the conversation that did not happen (pass 1, the move to pass 2), shown in the post. */
	failure = $state<{ kind: Halt; retry: () => void } | null>(null);
	/** The draft in grey while pass 1 is written, then fading out. */
	waiting = $state<"no" | "on" | "leaving">("no");
	stops = $state<Stop[]>([]);
	hint = $state<Hint | null>(null);
	/** The end's retrieval is being written: the post and the conversation are veiled meanwhile. */
	recalling = $state(false);
	map = $state<{ rows: MapRow[]; frozen: boolean } | null>(null);
	bar = $state<{ spec: BarSpec | null; n: number; out: boolean; waiting: boolean }>({ spec: null, n: 0, out: false, waiting: false });

	clock = new Clock();
	post: Post | null = null;
	thread: HTMLElement | null = null;
	readerName = $state("reader");
	private doc1: DocDef | null = null;
	private pass1: P1Stop[] = [];
	private pass1Text = "";
	private spots: Spot[] = [];
	/** Pass 1's cards as the learner answered them, in order. */
	private answers: P1Answer[] = [];
	private kept = new Set<string>();
	private results: Record<string, SpotResult> = {};
	/** Pass 2 as the bookmark keeps it, once the plan is agreed. */
	private p2mark: Bookmark["p2"] | null = null;
	/** What `resume` found, until the page has come back to it. */
	private resumed: Resumed | null = null;
	private memo = new Map<string, Promise<unknown>>();
	private p1sent: { key: string; job: Promise<{ text: string; doc: DocDef }> } | null = null;
	private nextId = 1;
	private sinceId: number | null = null;
	private answer: ((a: Answer) => void) | null = null;
	private barJob: Promise<void> = Promise.resolve();
	/** A pass-1 card that Enter (outside any control) continues. */
	cont: (() => void) | null = null;
	/** Resolves the scene card's "Start". */
	private go: (() => void) | null = null;

	/** sid: the piece the revision belongs to. resumed: where it was, when the page comes back to it. */
	constructor(setup: Setup, sid: string, resumed: Resumed | null = null) {
		this.setup = setup;
		this.sid = sid;
		this.resumed = resumed;
		this.background = setup.background ?? "";
		this.detail = setup.detail ?? app.look.detail;
		// The session speaks the tutor's language: the learner's own, or the one they write in, as they chose in their
		// settings. Its buttons and prompts too: they are the tutor's side of the conversation.
		this.lang = this.pick(setup.feedback === "target" && setup.lang ? setup.lang : setup.learner);
		// A scenario (a translation too) has no scene card to confirm: it arrives on the sheet, the draft waiting there in grey
		// while the scene and then pass 1 are written, one wait instead of a card that gives way to the sheet.
		if (setup.scenario) {
			this.phase = 1;
			this.waiting = "on";
		}
		// Coming back to a pass, the page opens on it (no scene card first, no waiting draft).
		const at = resumed ? resumeAt(resumed) : 0;
		if (at > 0) {
			this.phase = at;
			this.waiting = "no";
		}
	}
	tt = (key: string, vars?: Record<string, string | number>) => t(this.lang, key, vars);
	private pick = (l: string) => (isAppLang(l) ? l : "en");
	people(): Record<PersonKind, Who & { icon: string }> {
		return {
			tutor: { name: this.tt("tutorName"), color: "var(--tutor)", icon: "pen" },
			reader: { name: this.readerName, color: "var(--reader-who)", icon: "reader" },
			me: { name: app.prefs.name, color: "var(--me)", icon: "person" },
		};
	}
	private who = (k: PersonKind) => (k === "reader" && this.readerNow ? { ...this.people().reader, name: this.readerNow } : this.people()[k]);

	/* ---------- A scenario's exchange ---------- */
	private landed: Landed[] = [];
	/** What the others said around the learner's turns, for the post. */
	private placeContext(post: Post) {
		const ex = this.setup.exchange;
		post.lead = [];
		post.between = [];
		post.terms = [];
		post.leadFull = !!this.setup.translation;
		const tr = this.setup.translation;
		if (tr) {
			post.lead = [{ author: this.tt("trSource"), text: tr.source }];
			post.terms = tr.glossary;
			return;
		}
		if (!ex) return;
		const all = [...ex.before, ...ex.transcript];
		const t = ex.transcript;
		const first = t.findIndex((m) => m.learner);
		const answered = all.find((m) => m.id === t[first]?.replyTo) ?? t.slice(0, first).at(-1) ?? ex.before.at(-1);
		if (answered) post.lead = [{ author: answered.author, text: answered.text }];
		let gap: { author: string; text: string }[] | null = null;
		for (const m of t.slice(first + 1)) {
			if (m.learner) {
				post.between.push(gap ?? []);
				gap = null;
			} else {
				gap ??= [];
				gap.push({ author: m.author, text: m.text });
			}
		}
	}
	/** The text of turn n as the post reads now. */
	private turnText(n: number) {
		return (this.post?.plainText() ?? "").split(`\n\n${SEP}\n\n`)[n - 1]?.trim() ?? "";
	}

	/* ---------- Server ---------- */
	private currentChapter = captureTourState();
	private disposed = false;
	private active = () => !this.disposed && this.currentChapter();
	private async api<T>(action: string, body: object = {}): Promise<T> {
		if (!this.active()) throw new Cancelled();
		needKey();
		const r = await fetch(`/api/s/${this.sid}/${action}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}).catch((e) => {
			if (!this.active()) throw new Cancelled();
			throw e;
		});
		const v = await r.json().catch(() => ({}));
		if (!this.active()) throw new Cancelled();
		// The server says what stopped a model call: no key, the key refused, or a failure a retry may fix.
		if (!r.ok) throw v.code === "nokey" || v.code === "refused" ? new LimitError(v.code) : new Error(v.error || this.tt("error"));
		return v as T;
	}
	/** The bookmark goes to the server after every answer, the newest only, one request at a time; the tour keeps none. */
	private marking = false;
	private dirty = false;
	private mark() {
		if (!this.active() || sandboxed()) return;
		this.dirty = true;
		if (this.marking) return;
		this.marking = true;
		(async () => {
			while (this.dirty && this.active()) {
				this.dirty = false;
				const page: Bookmark = { phase: this.phase === 2 ? 2 : 1, answers: this.answers, ...(this.p2mark ? { p2: this.p2mark } : {}) };
				await fetch(`/api/s/${this.sid}/progress`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(page),
				}).catch(() => {});
			}
			this.marking = false;
		})();
	}
	/** A step asked for again (a restart from the debug panel) reuses its answer. */
	private once<T>(key: string, f: () => Promise<T>): Promise<T> {
		if (!this.memo.has(key)) {
			const p = f();
			this.memo.set(key, p);
			p.catch(() => this.memo.delete(key));
		}
		return this.memo.get(key) as Promise<T>;
	}
	/** Pass 1's answers set the server's text for pass 2, so they are sent again whenever they differ from what it last got. */
	private syncP1() {
		const carried = this.post?.carried ?? {};
		const key = `${JSON.stringify(carried)}:${[...this.kept]}`;
		if (this.p1sent?.key !== key) {
			const job = this.api<{ text: string; doc: DocDef }>("pass1done", { own: { ...carried }, keep: [...this.kept] }).then((r) => {
				this.pass1Text = r.text;
				return r;
			});
			this.p1sent = { key, job };
			job.catch(() => {
				if (this.p1sent?.job === job) this.p1sent = null;
			});
		}
		return this.p1sent.job;
	}

	/* ---------- Running ---------- */
	/** From the start, or back where the revision was. */
	async start() {
		if (!this.active()) return;
		const r = this.resumed;
		if (!r) return this.run(0);
		if (r.scene) await this.applyScene(r.scene);
		const at = resumeAt(r);
		if (at === 0) return this.run(0);
		this.doc1 = r.pass1?.doc ?? null;
		this.pass1 = r.pass1?.stops ?? [];
		this.answers = r.page?.answers ?? [];
		this.run(at);
	}
	stop() {
		this.disposed = true;
		this.clock.next();
		this.answer = null;
		this.go = null;
		this.cont = null;
	}
	private async run(i: 0 | 1 | 2) {
		this.clock.next();
		this.answer = null;
		this.go = null;
		this.cont = null;
		try {
			if (i === 0) await this.runScene();
			else if (i === 1) await this.runP1();
			else await this.runP2();
		} catch (e) {
			if (e instanceof Cancelled) return;
			console.error(e);
			this.toast(this.tt("error"));
		}
	}
	toast: (msg: string) => void = () => {};
	/** Change what the page shows; the page hands over its elements on the next tick. */
	private async layout(phase: 0 | 1 | 2, transition = false) {
		const swap = async () => {
			this.phase = phase;
			this.stops = [];
			this.hint = null;
			this.map = null;
			this.p1end = null;
			this.quick = { busy: false, text: null, halt: null };
			this.failure = null;
			this.sceneError = null;
			this.dropBar(true);
			this.sinceId = null;
			await tick();
		};
		// A view transition started while another runs skips the first: the page's own arrival (the root layout's, held
		// in <html data-vt>) plays out before this one starts, or a cached pass 1 cuts the sheet's growth into the card.
		if (transition) await navigationSettled();
		if (transition && document.startViewTransition && !reduced()) await document.startViewTransition(swap).updateCallbackDone;
		else await swap();
	}

	/* ---------- The scene ---------- */
	private async readScene() {
		const s = await this.once("scene", () => this.api<Scene>("scene"));
		// The scene names the piece and its place: the lists say so.
		refreshWriting();
		return s;
	}
	private async applyScene(s: Scene) {
		const ui = this.pick(s.ui);
		await loadLang(ui);
		this.scene = s;
		// A translation has no one to answer it: its reader is anyone reading the place it was written for.
		this.readerName = this.setup.translation ? t(ui, "aReader") : s.reader || "reader";
		this.lang = ui;
	}
	private async runScene() {
		const scenario = !!this.setup.scenario;
		await this.layout(scenario ? 1 : 0);
		if (scenario) this.waiting = "on";
		const alive = this.clock.alive();
		while (!this.scene) {
			this.sceneError = null;
			try {
				const s = await this.readScene();
				if (!alive()) return;
				await this.applyScene(s);
			} catch (e) {
				if (!alive()) return;
				// On the sheet, the failure stands under the waiting draft, as pass 1's would.
				await new Promise<void>((go) => {
					if (scenario) this.failure = { kind: stopOf(e), retry: go };
					else this.sceneError = { kind: stopOf(e), retry: go };
				});
				this.sceneError = null;
				this.failure = null;
			}
		}
		// A scenario already knows the place, the reader and the purpose: no card to confirm, only the wait for pass 1.
		if (!this.setup.scenario) {
			await new Promise<void>((go) => (this.go = go));
			this.go = null;
			if (!alive()) return;
		}
		this.run(1);
	}
	/** The scene card's "Start" (or, after a failure, "Try again"). */
	begin() {
		this.go?.();
	}
	setDetail(d: "more" | "needed") {
		if (d === this.detail) return;
		this.detail = d;
		if (!sandboxed()) app.saveLook({ detail: d });
		// Another depth means another first pass.
		this.memo.delete("pass1");
		this.doc1 = null;
	}
	/** "That's not the scene": the notes, changed, read again. */
	async correctScene(): Promise<boolean> {
		const correction = this.background.trim();
		if (correction === (this.setup.background ?? "").trim()) return false;
		this.sceneBusy = true;
		this.sceneError = null;
		try {
			const s = await this.api<Scene>("scene", { correction });
			this.setup.background = correction;
			// A new scene means a new first pass.
			this.memo.delete("pass1");
			this.doc1 = null;
			await this.applyScene(s);
			return true;
		} catch (e) {
			// Nothing changed: the card stays as it was, the correction still in the box, with the way to send it again.
			this.sceneError = { kind: stopOf(e), retry: () => this.correctScene() };
			return true;
		} finally {
			this.sceneBusy = false;
		}
	}

	/** A step outside the conversation: if it fails, the post says why and offers it again, until it goes through. */
	private async guard<T>(work: () => Promise<T>): Promise<T> {
		const alive = this.clock.alive();
		for (;;) {
			try {
				const v = await work();
				if (!alive()) throw new Cancelled();
				return v;
			} catch (e) {
				if (e instanceof Cancelled || !alive()) throw new Cancelled();
				await new Promise<void>((go) => (this.failure = { kind: stopOf(e), retry: go }));
				this.failure = null;
			}
		}
	}

	/* ---------- Pass 1 ---------- */
	private async runP1() {
		if (!this.scene) return this.run(0);
		const fromScene = this.phase === 0;
		await this.layout(1, fromScene);
		const post = this.post as Post;
		post.carried = {};
		post.target = this.scene.target;
		this.placeContext(post);
		this.kept.clear();
		if (!this.doc1) {
			this.answers = [];
			// While the first pass is written, the draft waits in grey where it will stand, a light sweeping across it.
			this.waiting = "on";
			const p = await this.guard(() => this.once("pass1", () => this.api<{ doc: DocDef; stops: P1Stop[] }>("pass1", { detail: this.detail })));
			// The grey draft fades out; the typing then starts from an empty post.
			if (!reduced()) {
				this.waiting = "leaving";
				await this.clock.sleep(480);
			}
			this.waiting = "no";
			this.doc1 = p.doc;
			this.pass1 = p.stops;
		}
		const doc = post.build(this.doc1 as DocDef);
		post.hideAll();
		// Coming back, the cards already answered are filled in at once and the typing goes on from the first open one.
		const known = (i: number) => this.answers[i] !== undefined;
		if (!known(0)) await this.clock.sleep(400 * SLOW);
		// Type to the end of the sentence, then go back over the marks in it, in order.
		for (let i = 0; i < this.pass1.length; ) {
			const end = post.unitEnd(doc.items.get(this.pass1[i].item)?.last ?? 0);
			post.instant = known(i);
			await post.typeTo(end);
			let j = i;
			while (j < this.pass1.length && (doc.items.get(this.pass1[j].item)?.last ?? 0) <= end) j++;
			for (const until = Math.max(j, i + 1); i < until; i++) {
				const it = doc.items.get(this.pass1[i].item);
				if (it) post.keepInRegion(it.el);
				await this.correct(this.pass1[i], i);
			}
			post.caretBack();
		}
		post.instant = this.pass1.length > 0 && known(this.pass1.length - 1);
		await post.typeTo(doc.tokens.length - 1);
		post.instant = false;
		this.endP1();
	}
	/** One card, resolved by the learner. */
	private card<T, P extends Record<string, unknown>>(
		id: string,
		component: import("svelte").Component<P>,
		props: (done: (v: T) => void) => P,
	): Promise<T> {
		const post = this.post as Post;
		const alive = this.clock.alive();
		let settled = false;
		return new Promise<T>((resolve, reject) => {
			const d = post.drawer(
				id,
				component,
				props((v) => {
					if (settled) return;
					settled = true;
					this.cont = null;
					d.close().then(() => (alive() ? resolve(v) : reject(new Cancelled())));
				}),
			);
		});
	}
	private note(id: string, text: string, keepable = false) {
		const tutor = this.who("tutor");
		return this.card<"continue" | "keep", Record<string, unknown>>(id, NoteCard as never, (done) => {
			this.cont = () => done("continue");
			return {
				who: tutor,
				icon: "pen",
				text,
				keepable,
				labels: { cont: this.tt("continue"), keep: this.tt("keepMine"), keepSure: this.tt("keepMineSure") },
				done,
			};
		});
	}
	/** One mark of pass 1. A card the learner answered before coming back is filled in from their answer, without asking. */
	private async correct(stop: P1Stop, i: number) {
		const post = this.post as Post;
		const tutor = this.who("tutor");
		const given = this.answers[i];
		const a: P1Answer = {};
		post.instant = !!given;
		const parts = stop.kind === "group" ? (stop.parts ?? []).map((p) => p.item) : [stop.item];
		if (!given) {
			await this.clock.sleep(500 * SLOW);
			parts.forEach((p, k) => {
				post.select(p, tutor, { flag: k === 0 });
			});
			await this.clock.sleep(650 * SLOW);
		}
		if (stop.kind === "choice") {
			let picked = given?.picked ?? 0;
			if (!given) {
				let pickFromPost: (i: number) => void = () => {};
				const ask = post.askChoice(stop.item, tutor, (n) => pickFromPost(n));
				picked = await this.card<number, Record<string, unknown>>(stop.item, ChoiceCard as never, (done) => {
					pickFromPost = done;
					return { who: tutor, icon: "pen", text: stop.prompt ?? "", options: ask.options, done };
				});
				ask.done();
			}
			a.picked = picked;
			post.markChoice(stop.item, picked, stop.answer ?? 0);
			if (!given) await this.note(stop.item, (picked === stop.answer ? stop.note : stop.wrongNote) ?? "");
		} else if (stop.kind === "fix") {
			const res =
				given ??
				(await this.card<{ keep?: boolean; to?: string; ok: boolean | null; self: boolean }, Record<string, unknown>>(
					stop.item,
					FixCard as never,
					(done) => ({
						who: tutor,
						icon: "pen",
						text: stop.prompt ?? "",
						initial: stop.initial ?? "",
						labels: {
							submit: this.tt("fixSubmit"),
							reveal: this.tt("reveal"),
							keep: this.tt("keepMine"),
							keepSure: this.tt("keepMineSure"),
							cont: this.tt("continue"),
						},
						judge: (typed: string) => {
							const key = typed
								.trim()
								.toLowerCase()
								.replace(/[.!?]+$/, "");
							const hit = stop.answers?.[key];
							return hit?.ok
								? { to: typed.trim(), ok: true, note: hit.note, self: true }
								: { to: stop.to, ok: false, note: hit ? hit.note : (stop.wrongNote ?? this.tt("fallbackWrong", { x: stop.to ?? "" })), self: true };
						},
						reveal: () => ({ to: stop.to, ok: null, self: false }),
						done,
					}),
				));
			Object.assign(a, res.keep ? { keep: true } : { to: res.to, ok: res.ok, self: res.self });
			if (res.keep) this.kept.add(stop.item);
			else {
				if (res.ok && res.to) post.carried[stop.item] = res.to;
				await post.suggest(stop.item, res.to ?? "", tutor);
			}
		} else if (stop.kind === "replace" || stop.kind === "link") {
			const typing = post.suggest(stop.item, stop.to ?? "", tutor);
			const v = given ? (given.keep ? "keep" : "continue") : await this.note(stop.item, stop.note ?? "", true);
			await typing;
			if (v === "keep") {
				post.unsuggest(stop.item);
				this.kept.add(stop.item);
				a.keep = true;
			}
		} else if (stop.kind === "group") {
			const typing = (async () => {
				for (const p of stop.parts ?? []) await post.suggest(p.item, p.ins, tutor);
			})();
			if (!given) await this.note(stop.item, stop.note ?? "");
			await typing;
		} else if (stop.kind === "defer") {
			post.defer(stop.item);
			if (!given) await (stop.note ? this.note(stop.item, stop.note) : this.clock.sleep(500 * SLOW));
		} else if (stop.kind === "quiet") {
			await post.suggest(stop.item, stop.to ?? "", tutor);
		} else if (stop.kind === "tick") {
			post.tick(stop.item);
			if (!given) await this.note(stop.item, stop.note ?? "");
		}
		for (const p of parts) post.unselect(p);
		post.caretAfterItem(parts[parts.length - 1]);
		if (!given) {
			this.answers[i] = a;
			this.mark();
		}
	}
	private endP1() {
		const vals = this.pass1.map((st, i) => outcomeOf(st, this.answers[i])).filter((_, i) => this.answers[i]);
		this.p1end = {
			fixed: vals.filter((o) => !o.deferred && !o.kept).length,
			self: vals.filter((o) => o.self).length,
			deferred: vals.filter((o) => o.deferred).length,
		};
		// The learner's own answers go into the text pass 2 starts from; the reader starts reading it now.
		this.syncP1().catch(() => {});
	}
	/** "Need it now?": the post as pass 1 left it, once the server has the text. */
	async quickPost() {
		this.quick.busy = true;
		this.quick.halt = null;
		try {
			await this.syncP1();
			this.quick.text = this.pass1Text;
		} catch (e) {
			this.quick.halt = stopOf(e);
		} finally {
			this.quick.busy = false;
		}
	}
	toPass2() {
		this.run(2);
	}

	/* ---------- Pass 2: the conversation ---------- */
	private newStop() {
		const s: Stop = { id: this.nextId++, top: [], replies: [], done: false };
		this.stops.push(s);
		this.sinceId ??= s.id;
		return this.stops[this.stops.length - 1];
	}
	private push(stop: Stop, m: Omit<Msg, "id">, top = false) {
		const msg = { ...m, id: this.nextId++ };
		(top ? stop.top : stop.replies).push(msg);
		// The learner already knows what they wrote, so the view may start after it.
		if (m.who !== "me") this.sinceId ??= msg.id;
		return msg.id;
	}
	private say = (s: Stop, text: string, extra: Partial<Msg> = {}) => this.push(s, { who: "tutor", kind: "text", text, ...extra });
	private reader = (s: Stop, text: string, top = false) =>
		this.push(s, { who: "reader", kind: "text", text, ...(this.readerNow ? { name: this.readerNow } : {}) }, top);
	/** In a scenario, the person the current spot's turn was said to. */
	private readerNow: string | null = null;
	private me = (s: Stop, text: string) => this.push(s, { who: "me", kind: "text", text });
	private quiet = (s: Stop, text: string) => this.push(s, { who: "tutor", kind: "text", text, quiet: true });
	private remove(s: Stop, id: number) {
		const i = s.replies.findIndex((m) => m.id === id);
		if (i >= 0) s.replies.splice(i, 1);
	}
	private el = (id: number) => this.thread?.querySelector<HTMLElement>(`[data-mid="${id}"]`) ?? null;

	/** Show what came back since the learner last acted, from its start; `keep` must end up fully visible. */
	private async settle(keep?: Element | null) {
		await tick();
		const list = this.thread;
		if (!list) return;
		const max = list.scrollHeight - list.clientHeight;
		// Measure against the list itself; animated comments are their own offsetParent.
		const base = list.getBoundingClientRect().top - list.scrollTop;
		let top = max;
		const since = this.sinceId != null ? this.el(this.sinceId) : null;
		if (since) top = Math.min(top, since.getBoundingClientRect().top - base - 10);
		if (keep) top = Math.max(top, keep.getBoundingClientRect().top - base + (keep as HTMLElement).offsetHeight - list.clientHeight + 10);
		this.sinceId = null;
		await glide(list, top);
	}
	/** Bring in what has arrived so far without passing its start; never scrolls back up. */
	private async peek() {
		await tick();
		const list = this.thread;
		if (!list) return;
		const max = list.scrollHeight - list.clientHeight;
		const base = list.getBoundingClientRect().top - list.scrollTop;
		const since = this.sinceId != null ? this.el(this.sinceId) : null;
		const top = since ? Math.min(max, since.getBoundingClientRect().top - base - 10) : max;
		if (top > list.scrollTop + 2) glide(list, top);
	}
	/** Something grew in the conversation outside the learner's turn (a hint note): bring its end into view. Measured at
	 *  once, so the caller calls it when the layout has the new height and before any animation toward it starts. */
	showInThread(el: Element) {
		const list = this.thread;
		if (!list) return;
		const over = el.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom + 12;
		if (over > 0) glide(list, list.scrollTop + over);
	}
	/** The model is writing: dots until its answer arrives. A failed request says so where it happened and offers it again. */
	private async generate<T>(s: Stop | null, work: () => Promise<T>): Promise<T> {
		const alive = this.clock.alive();
		if (!s) return this.clock.hold(work());
		for (;;) {
			const dots = this.push(s, { who: null, kind: "thinking" });
			this.peek();
			try {
				const v = await work();
				this.remove(s, dots);
				if (!alive()) throw new Cancelled();
				return v;
			} catch (e) {
				this.remove(s, dots);
				if (e instanceof Cancelled || !alive()) throw new Cancelled();
				await new Promise<void>((go) => {
					const id = this.push(s, {
						who: null,
						kind: "fail",
						halt: stopOf(e),
						retry: () => {
							this.remove(s, id);
							go();
						},
					});
					this.peek();
				});
				if (!alive()) throw new Cancelled();
			}
		}
	}
	/** When the reader and the tutor both speak, the reader goes first and the tutor follows a moment later. */
	private async beat(ms = 900) {
		this.peek();
		await this.clock.sleep(ms * SLOW);
	}

	/* ---------- The reply bar: it keeps its height, dims after the learner acts, and changes only once the thread has ---------- */
	private ask(spec: BarSpec): Promise<Answer> {
		const alive = this.clock.alive();
		return new Promise((resolve, reject) => {
			const mine = (a: Answer) => {
				this.answer = null;
				this.bar.waiting = true;
				alive() ? resolve(a) : reject(new Cancelled());
			};
			this.answer = null;
			this.barJob = this.barJob
				.then(async () => {
					await this.settle(spec.keep?.());
					if (!alive()) return;
					await this.swapBar(spec);
					this.answer = mine;
				})
				.catch(() => {});
		});
	}
	private async swapBar(spec: BarSpec | null) {
		if (this.bar.spec) {
			this.bar.out = true;
			await new Promise((r) => setTimeout(r, reduced() ? 0 : 250));
		}
		this.bar.spec = spec;
		this.bar.n++;
		this.bar.waiting = false;
		await tick();
		this.bar.out = false;
	}
	/** Empty the reply bar without an answer; `now` for a fresh layout. */
	private dropBar(now = false) {
		this.answer = null;
		if (now) {
			this.barJob = Promise.resolve();
			this.bar.spec = null;
			this.bar.out = false;
			this.bar.waiting = false;
			return;
		}
		this.barJob = this.barJob.then(() => this.swapBar(null)).catch(() => {});
	}
	/** The bar's controls answer through here (a quick reply, a button, a link, the composer). */
	reply(a: Answer) {
		this.answer?.(a);
	}
	get answering() {
		return !!this.answer;
	}

	/* ---------- Pass 2 ---------- */
	private async runP2() {
		if (!this.doc1) return this.run(1);
		this.results = {};
		this.p2mark = null;
		await this.layout(2);
		const post = this.post as Post;
		post.target = this.scene?.target ?? "en";
		this.placeContext(post);
		// Coming back once the plan was agreed: the post as it stands, the spots behind the learner as they left them.
		const back = this.resumed?.page?.p2 && this.resumed.doc ? { ...this.resumed.page.p2, doc: this.resumed.doc } : null;
		this.resumed = null;
		if (back) {
			post.build(back.doc);
			this.spots = back.spots;
			this.landed = back.landed;
			this.results = back.results;
			this.map = { rows: back.map, frozen: true };
			this.stops = back.thread;
			this.nextId = Math.max(0, ...back.thread.flatMap((s) => [s.id, ...s.top.map((m) => m.id), ...s.replies.map((m) => m.id)])) + 1;
			this.p2mark = { spots: back.spots, landed: back.landed, map: back.map, results: this.results, thread: back.thread };
		} else {
			this.mark();
			const p1 = await this.guard(() => this.syncP1());
			await this.guard(() => this.api("resetP2"));
			// The post is there at once: pass 2 starts from the finished pass-1 text.
			post.build(p1.doc);
		}
		post.showAll();
		post.dropCaret();
		post.scrollTop(0);
		if (back) await this.settle();
		else await this.overview();
		const ids = this.spots.map((s) => s.id);
		for (let i = 0; i < ids.length; i++) if (!this.results[ids[i]]) await this.spot(ids[i], i === ids.length - 1);
		this.readerNow = null;
		await this.sayAgain();
		await this.replay();
		await this.endP2();
	}
	private applyPlan(r: { stops: Spot[]; doc: DocDef }) {
		this.spots = r.stops;
		this.post?.rebuild(r.doc);
	}
	private async overview() {
		if (this.setup.exchange || this.setup.translation) return this.scenarioOverview();
		const el = this.newStop();
		const ov = await this.generate(el, () => this.api<{ reader: string; stops: Spot[] }>("overview"));
		this.spots = ov.stops;
		this.reader(el, ov.reader, true);
		let said: string | null = null;
		for (;;) {
			const a = await this.ask({
				quick: [
					{ label: this.tt("ovYes"), v: "yes" },
					{ label: this.tt("ovNo"), v: "no" },
				],
			});
			if (a.v === "yes") {
				this.me(el, this.tt("ovYesSaid"));
				await this.beat(700);
				break;
			}
			const f = await this.ask({ compose: this.tt("ovCompose"), links: [{ label: this.tt("back"), v: "back" }] });
			if (f.v === "back") continue;
			this.me(el, f.text ?? "");
			said = f.text ?? "";
			break;
		}
		const r = await this.generate(el, () => this.api<{ reply: string; map: MapRow[]; stops: Spot[]; doc: DocDef }>("overviewReply", { said }));
		this.applyPlan(r);
		this.say(el, r.reply);
		this.map = { rows: r.map, frozen: false };
		const mapId = this.push(el, { who: null, kind: "map" });
		await this.ask({ buttons: [{ label: this.tt("startFixing", { n: this.spots.length }), v: "go", primary: true }], keep: () => this.el(mapId) });
		this.map.frozen = true;
		this.post?.clearRow();
		el.done = true;
		this.markP2();
	}
	/** A scenario's overview: not a reader's guess but how each turn really landed, then the plan. */
	private async scenarioOverview() {
		const el = this.newStop();
		const ov = await this.generate(el, () => this.api<{ turns: Landed[]; stops: Spot[] }>("overview"));
		const mine = (this.setup.exchange?.transcript ?? []).filter((m) => m.learner);
		// The turn as a line to recognise it by: past a greeting line ("Hi David,") when it has one.
		const gist = (x = "") => {
			const lines = x
				.replace(/^To:.*\n/m, "")
				.trim()
				.split(/\n+/);
			return (lines.length > 1 && lines[0].split(/\s+/).length <= 4 && /[,，!！]$/.test(lines[0]) ? lines.slice(1) : lines).join(" ");
		};
		this.landed = ov.turns.map((t) => ({ ...t, mine: gist(mine[t.t - 1]?.text) }));
		this.spots = ov.stops;
		// A translation has no turns: its meaning is the source's, so pass 2 goes straight to the plan.
		if (ov.turns.length) {
			const off = ov.turns.filter((t) => !t.ok).length;
			this.say(el, off ? this.tt("wentOff", { n: off }) : this.tt("wentWell"));
			this.push(el, { who: null, kind: "turns", turns: this.landed });
		}
		const r = await this.generate(el, () => this.api<{ reply: string; map: MapRow[]; stops: Spot[]; doc: DocDef }>("overviewReply", { said: null }));
		this.applyPlan(r);
		if (!this.spots.length) {
			await this.ask({ buttons: [{ label: this.tt("continue"), v: "go", primary: true }] });
			el.done = true;
			this.markP2(r.map);
			return;
		}
		this.map = { rows: r.map, frozen: false };
		const mapId = this.push(el, { who: null, kind: "map" });
		await this.ask({ buttons: [{ label: this.tt("startFixing", { n: this.spots.length }), v: "go", primary: true }], keep: () => this.el(mapId) });
		this.map.frozen = true;
		this.post?.clearRow();
		el.done = true;
		this.markP2();
	}
	/** The plan is agreed (or another spot is behind the learner): the bookmark keeps pass 2 as it stands. */
	private markP2(rows = this.map?.rows ?? []) {
		const clean = (m: Msg): Msg => ({ ...m, retry: undefined, halt: undefined, hint: false });
		const shown = (m: Msg) => m.kind !== "thinking" && m.kind !== "fail";
		// Through JSON: the retries are functions, and the thread is state.
		const thread = (JSON.parse(JSON.stringify(this.stops)) as Stop[])
			.filter((s) => s.done || (s.spot && this.results[s.spot]))
			.map((s) => ({ ...s, done: true, top: s.top.filter(shown).map(clean), replies: s.replies.filter(shown).map(clean) }));
		this.p2mark = { spots: this.spots, landed: this.landed, map: this.p2mark?.map ?? rows, results: this.results, thread };
		this.mark();
	}
	showRow(row: MapRow) {
		this.post?.showRow(row, this.tt("ghost"));
	}

	private explained(M: Material): Explained {
		return {
			ref: M.ref,
			alts: M.alts ?? [],
			hints: M.pieces,
			why: M.why,
			construct: M.construct,
			prompt: M.prompt,
			success: M.success,
			ticks: [],
			choices: [],
			extra: [],
		};
	}
	/** One row per choice of the reference: its reason, and where the learner chose differently, theirs beside it. */
	private explain(I: Explained, mine: string, gave: boolean, lead?: string): Explain {
		const byRow = new Map((mine ? I.choices : []).map((c) => [c.n, c]));
		const rows: Explain["rows"] = I.why.map((w, i) => {
			const c = byRow.get(i);
			const ok = !!mine && I.ticks.includes(i);
			const yours = c?.mine && c.note && (c.verdict === "also" || c.verdict === "needed") ? `${this.tt("yourWords", { x: c.mine })} ${c.note}` : "";
			// Theirs is just as right: the reference's reason is not about them, so only the comparison shows.
			return {
				cls: ok ? "ok" : w.free ? "free" : "todo",
				mk: ok ? "✓" : w.free ? "·" : "→",
				label: w.label,
				note: yours && c?.verdict === "also" ? "" : w.note,
				yours,
			};
		});
		for (const x of mine ? I.extra : [])
			rows.push({
				cls: x.ok ? "ok" : "todo",
				mk: x.ok ? "✓" : "→",
				label: x.ref,
				note: "",
				yours: `${this.tt("yourWords", { x: x.mine })} ${x.note}`,
			});
		return { lead: lead ?? (gave ? this.tt("given") : this.tt("ref")), ref: I.ref, alts: I.alts.slice(0, 2).map((a) => bare(plain(a))), rows };
	}

	/** One spot as a conversation. Every step waits for the learner. */
	private async spotScript(S: Spot, el: Stop): Promise<SpotResult> {
		const post = this.post as Post;
		const reader = this.who("reader");
		// The marked words may grow to what the reference rewrites, so the highlight shows what will change.
		const regrow = (M: Material) => {
			if (!M.doc) return;
			post.rebuild(M.doc);
			post.select(S.id, reader, { flag: false });
			post.revealItem(S.id);
		};
		let M = await this.generate(el, () => this.api<Material>("material", { id: S.id }));
		regrow(M);
		this.reader(el, M.reader, true);
		await this.beat();
		const meanings = S.parts.map((p) => p.readings[0]?.meaning ?? p.problem);
		let changed = false;
		for (const [k, part] of S.parts.entries()) {
			// Chinese and Japanese put no spaces between sentences.
			const sp = /^(zh|ja)/.test(this.lang) ? "" : " ";
			const head = S.parts.length > 1 ? `${k === 0 ? `${this.tt("many", { n: S.parts.length })}${sp}` : ""}${this.tt("nth", { k: k + 1 })}${sp}` : "";
			// Nothing to ask when the meaning is known: a translation's source, or a spot about how something is put.
			if (this.setup.translation || part.mode === "given") {
				this.say(el, `${head}${part.problem}`);
				continue;
			}
			// Nothing to choose from (a span pass 1 left that no spot covered, outside a translation): the writer says what
			// they meant. It used to ask "which is closer?" over no options at all.
			const open = part.mode !== "one" && !part.readings.length;
			this.say(
				el,
				part.mode === "one"
					? this.tt("guess", { p: `${head}${part.problem}`, r: meanings[k].replace(/[\s.。!！]+$/u, "") })
					: `${head}${part.problem}${sp}${open ? this.tt("whatMean") : part.question || this.tt("which")}`,
			);
			const quick: NonNullable<BarSpec["quick"]> =
				part.mode === "one"
					? [{ label: this.tt("readingYes"), v: 0 }, ...part.readings.slice(1).map((r, i) => ({ label: r.label, v: i + 1 }))]
					: part.readings.map((r, i) => ({ label: r.label, v: i }));
			quick.push({ label: this.tt("sayOwn"), v: "own" }, { label: this.tt("keepAsIs"), v: "keep", confirm: this.tt("keepAsIsSure") });
			for (;;) {
				const a = open ? { v: "own" as const } : await this.ask({ quick });
				if (a.v === "keep") {
					this.me(el, this.tt("keepAsIs"));
					return { kept: true };
				}
				if (a.v === "own") {
					const f = await this.ask({
						compose: this.tt("ownCompose"),
						links: open ? [{ label: this.tt("keepAsIs"), v: "keep" }] : [{ label: this.tt("back"), v: "back" }],
					});
					if (f.v === "keep") {
						this.me(el, this.tt("keepAsIs"));
						return { kept: true };
					}
					if (f.v === "back") continue;
					this.me(el, f.text ?? "");
					const r = await this.generate(el, () => this.api<{ reply: string; fine?: boolean; reading: string }>("own", { id: S.id, k, said: f.text }));
					this.say(el, r.reply);
					// The tutor misread it: keeping it is the first offer, rewriting it stays possible.
					if (r.fine) {
						const c = await this.ask({
							buttons: [
								{ label: this.tt("keepAsIs"), v: "keep", primary: true },
								{ label: this.tt("changeAnyway"), v: "change" },
							],
						});
						if (c.v === "keep") return { kept: true };
					}
					meanings[k] = r.reading;
					changed = true;
				} else {
					const r = part.readings[Number(a.v)];
					this.me(el, part.mode === "one" && a.v === 0 ? this.tt("yes") : `${r.label}: ${r.meaning}`);
					if (r.meaning !== meanings[k]) {
						meanings[k] = r.meaning;
						changed = true;
					}
					await this.beat(700);
				}
				break;
			}
		}
		// Another reading: its material is written while the learner writes their version. The stop keeps the words it
		// replaces, so nothing on the page moves; a hint, the answer and the grade wait for it (ready).
		let next: Promise<Material> | null = changed ? this.api<Material>("material", { id: S.id, meanings }) : null;
		let I = this.explained(M);
		let rung = 0;
		// How much help this part took, for which parts the end asks again.
		let tries = 0;
		let hinted = false;
		// The pieces' meanings are asked for only when the learner opens one (most never do).
		const freshHint = () => {
			const id = S.id;
			let notes: Promise<{ gloss?: string; example?: string }[]> | null = null;
			this.hint = {
				pieces: I.hints,
				rung: null,
				load: () => {
					notes ??= this.api<{ gloss?: string; example?: string }[]>("pieces", { id }).catch(() => {
						notes = null;
						return [];
					});
					return notes;
				},
			};
		};
		freshHint();
		const take = (m: Material) => {
			M = m;
			regrow(M);
			I = this.explained(M);
			freshHint();
		};
		next?.then(
			(m) => {
				if (!next) return;
				next = null;
				take(m);
			},
			() => {},
		);
		const ready = async () => {
			const p = next;
			if (!p) return;
			let first = true;
			const m = await this.generate(el, () => {
				if (!first) return this.api<Material>("material", { id: S.id, meanings });
				first = false;
				return p;
			});
			if (next !== p) return;
			next = null;
			take(m);
		};
		// The hint box moves under the tutor's newest comment; a comment left with nothing but the box goes.
		const coach = (text: string, example?: string) => {
			const from = el.replies.findLast((m) => m.hint);
			if (from) {
				from.hint = false;
				if (!from.text) this.remove(el, from.id);
			}
			if (this.hint) this.hint.rung = example ? { lead: "", html: rich(example) } : null;
			this.say(el, text, { hint: true });
		};
		/* Two hints, neither of them the answer (session/calls.ts hintFor): how the part is built, then the same build on
		   another topic. Made when first asked for, from the learner's last failed try when there is one. */
		const showHint = async (n: number, lead = "") => {
			await ready();
			hinted = true;
			const h = await this.generate(el, () => this.api<{ plan: string; example: string }>("hint", { id: S.id }));
			if (n === 1) coach(`${lead}${lead ? " " : ""}${h.plan}`);
			else coach(this.tt("hintExample"), h.example);
		};
		coach(next ? this.tt("rewriteNow") : I.prompt);
		const reader2 = this.who("reader");
		const draft = (x: string) => post.showEdit(S.id, liveFit("raw", x), reader2);
		let last = "";
		// A new failed try starts the hints again: they are made from the learner's latest sentence.
		const rebase = () => {
			rung = 0;
			if (this.hint) this.hint.rung = null;
		};
		const fill = async (ref: string) => {
			this.say(el, this.tt("fillIn"));
			let value = ref;
			for (;;) {
				const f = await this.ask({ compose: this.tt("fillCompose"), value, onInput: draft, links: [{ label: this.tt("back"), v: "back" }] });
				if (f.v === "back") return null;
				const t = (f.text ?? "").trim();
				if (!/⟨[^⟩]*⟩/.test(t)) {
					this.me(el, t);
					return t;
				}
				value = t;
				this.say(el, this.tt("fillStill"));
			}
		};
		let text = "";
		let gave = false;
		let compose = true;
		let keepFirst = false;
		for (;;) {
			if (compose) {
				let round = 0;
				text = "";
				gave = false;
				for (;;) {
					const links: NonNullable<BarSpec["links"]> = [];
					if (rung < 2) links.push({ label: rung === 0 ? this.tt("hint") : this.tt("moreHint"), v: "hint" });
					links.push({ label: this.tt("give"), v: "give" }, { label: this.tt("keepAsIs"), v: "keep", confirm: this.tt("keepAsIsSure") });
					const a = await this.ask({ compose: this.tt("composeRewrite"), value: last, onInput: draft, links });
					if (a.typed !== undefined) last = a.typed;
					if (a.v === "keep") return { kept: true };
					if (a.v === "give") {
						await ready();
						gave = true;
						break;
					}
					if (a.v === "hint") {
						rung += 1;
						await showHint(rung);
						continue;
					}
					text = a.text ?? "";
					last = text;
					this.me(el, text);
					await ready();
					const g = await this.generate(el, () => this.api<Grade>("grade", { id: S.id, attempt: text }));
					if (g.pass) {
						Object.assign(I, { ticks: g.ticks, choices: g.choices ?? [], extra: g.extra ?? [] });
						this.reader(el, I.success);
						await this.beat();
						break;
					}
					round += 1;
					tries += 1;
					// The reader reacts the first time a problem shows up; after that only the tutor speaks.
					if (g.reader) {
						this.reader(el, g.reader);
						await this.beat();
					}
					rebase();
					// Stuck twice: the first hint comes with the feedback, unasked.
					if (round === 2) {
						rung = 1;
						await showHint(rung, g.tutor);
					} else coach(g.tutor);
				}
				if (gave) post.typeEdit(S.id, liveFit("raw", plain(I.ref)), reader);
				this.push(el, { who: "tutor", kind: "explain", explain: this.explain(I, gave ? "" : text, gave) });
			}
			compose = true;
			const buttons: { label: string; v: string; primary?: boolean }[] = gave
				? [{ label: this.tt("useThis"), v: "ref", primary: true }]
				: [
						{ label: this.tt("useMine"), v: "mine", primary: true },
						{ label: this.tt("useRef"), v: "ref" },
					];
			buttons.push({ label: this.tt("ask"), v: "ask" });
			// After the learner argued the original needs no change, keeping it is the main button.
			if (keepFirst) {
				for (const b of buttons) b.primary = false;
				buttons.unshift({ label: this.tt("keepAsIs"), v: "keep", primary: true });
			}
			const links = [...(gave ? [] : [{ label: this.tt("retry"), v: "retry" }]), ...(keepFirst ? [] : [{ label: this.tt("keepAsIs"), v: "keep" }])];
			const b = await this.ask({ buttons, links });
			if (b.v === "keep") return { kept: true };
			if (b.v === "retry") {
				coach(this.tt("again"));
				continue;
			}
			if (b.v === "mine") return { text, self: !gave, gave, construct: I.construct, tries, hinted, orig: M.orig ?? undefined };
			if (b.v !== "ask") {
				// A reference with a ⟨placeholder⟩ (a fact only the writer knows) never goes into the post as it is: they fill it in.
				const filled = /⟨[^⟩]*⟩/.test(plain(I.ref)) ? await fill(plain(I.ref)) : plain(I.ref);
				if (filled === null) continue;
				return { text: filled, self: !gave, gave, construct: I.construct, tries, hinted, orig: M.orig ?? undefined };
			}
			// The learner may question the sentence or ask anything about it before choosing; the choice waits.
			const q = await this.ask({ compose: this.tt("askCompose"), links: [{ label: this.tt("back"), v: "back" }] });
			compose = false;
			if (q.v === "back") continue;
			this.me(el, q.text ?? "");
			const ans = await this.generate(el, () =>
				this.api<{ answer: string; kind: string; ref?: string; why?: Explained["why"]; alts?: string[]; construct?: string; meaning?: string }>(
					"question",
					{ id: S.id, mine: gave ? null : text, q: q.text },
				),
			);
			this.say(el, ans.answer);
			keepFirst = ans.kind === "keep";
			if (ans.kind === "ref") {
				// The reference was redone: it is explained again, against the learner's sentence.
				Object.assign(I, { ref: ans.ref, why: ans.why, alts: ans.alts ?? [], construct: ans.construct, ticks: [], choices: [], extra: [] });
				if (gave) post.typeEdit(S.id, liveFit("raw", plain(I.ref)), reader);
				this.push(el, { who: "tutor", kind: "explain", explain: this.explain(I, gave ? "" : text, gave, this.tt("refRevised")) });
			} else if (ans.kind === "meaning") {
				// They meant something else: the spot starts over from that meaning, and their sentence is judged against it.
				M = await this.generate(el, () => this.api<Material>("material", { id: S.id, meanings: [ans.meaning] }));
				regrow(M);
				I = this.explained(M);
				freshHint();
				rung = 0;
				const g = gave ? null : await this.generate(el, () => this.api<Grade>("grade", { id: S.id, attempt: text }));
				if (g?.pass) {
					Object.assign(I, { ticks: g.ticks, choices: g.choices ?? [], extra: g.extra ?? [] });
					this.reader(el, I.success);
					await this.beat();
					this.push(el, { who: "tutor", kind: "explain", explain: this.explain(I, text, false) });
				} else {
					if (g?.reader) {
						this.reader(el, g.reader);
						await this.beat();
					}
					if (g) rebase();
					coach(g?.tutor || `${this.tt("newMeaning")} ${I.prompt}`);
					compose = true;
					// Straight back to writing, without the explanation of a sentence that no longer fits.
					gave = false;
				}
			}
		}
	}

	private async spot(id: string, last: boolean) {
		const post = this.post as Post;
		const S = this.spots.find((s) => s.id === id);
		// A spot rewritten together with an earlier one has no item left in the post.
		if (!S || !post.item(S.id)) return;
		this.readerNow = S.who?.name ?? null;
		const reader = this.who("reader");
		// What the spot said before it was rebuilt, for the piece's page ("what you worked out") and "say it again".
		const before = post.item(S.id)?.el.textContent ?? "";
		post.select(S.id, reader, { flag: false });
		post.revealItem(S.id);
		const el = this.newStop();
		el.spot = id;
		const res = await this.spotScript(S, el);
		this.hint = null;
		const next = () => this.ask({ buttons: [{ label: last ? this.tt("seeAll") : this.tt("nextSpot"), v: "next", primary: true }] });
		if (res.kept) {
			// The post stays as the learner wrote it; only the mark goes.
			this.results[id] = { kept: true };
			const out = await this.generate(el, () => this.api<{ doc: DocDef }>("keep", { id: S.id }));
			post.rebuild(out.doc);
			this.dropBar();
			this.quiet(el, this.tt("keptNote"));
			this.markP2();
			await next();
			this.dropBar();
			el.done = true;
			return;
		}
		this.results[id] = { ...res, before };
		const out = await this.generate(el, () =>
			this.api<{ oldDoc: DocDef; newDoc: DocDef; placed?: string }>("apply", { id: S.id, final: res.text, self: !!res.self }),
		);
		this.markP2();
		post.widen(out.oldDoc, S.id, reader);
		// The words as they stand in the post (end mark and first letter set by the server).
		const typing = post.typeEdit(S.id, out.placed ?? res.text ?? "", reader);
		await next();
		this.dropBar();
		await typing;
		post.unselect(S.id);
		el.done = true;
		await post.acceptEdits();
		post.rebuild(out.newDoc);
	}

	/**
	 * Retrieval before the end (user, 2026-11-07): up to three parts the learner needed help with (the answer given,
	 * failed tries, hints), most help first, said again from memory with what they first wrote, before pass 1, as the
	 * cue. Parts they got right alone on the first try are not asked: retrieving them teaches little. The post and the
	 * conversation are veiled while they write, or the answer is a glance away. Each try is graded as their try was, so
	 * another right way passes and a slip is named.
	 */
	private async sayAgain() {
		const offTurns = new Set(this.landed.filter((t) => !t.ok && t.cause !== "reader").map((t) => t.t));
		const inOff = (id: string) => offTurns.has(this.spots.find((s) => s.id === id)?.who?.turn ?? -1);
		const help = (r: SpotResult) => (r.gave || r.skipped ? 3 : 0) + (r.tries ?? 0) + (r.hinted ? 1 : 0);
		const picks = Object.entries(this.results)
			.filter(([, r]) => r.text && (r.orig || r.before) && !r.kept && help(r) > 0)
			.sort(([a, x], [b, y]) => help(y) - help(x) || Number(inOff(b)) - Number(inOff(a)))
			.slice(0, 3);
		if (!picks.length) return;
		const el = this.newStop();
		const norm = (x: string) =>
			x
				.trim()
				.replace(/\s+/g, " ")
				.replace(/[.!?…。！？]+$/, "")
				.replace(/’/g, "'")
				.toLowerCase();
		for (const [i, [id, r]] of picks.entries()) {
			const answer = (r.text ?? "").trim();
			const intro = i === 0 ? this.tt(picks.length > 1 ? "againIntroMany" : "againIntro", { n: picks.length }) : "";
			this.push(el, { who: "tutor", kind: "again", text: intro, cue: (r.orig || r.before || "").trim() }, true);
			this.recalling = true;
			const a = await this.ask({ compose: this.tt("againCompose"), links: [{ label: this.tt("againSkip"), v: "skip" }] });
			this.recalling = false;
			if (a.v === "skip") {
				this.dropBar();
				this.quiet(el, this.tt("againSkipped", { x: answer }));
				continue;
			}
			const said = a.text ?? "";
			this.me(el, said);
			if (norm(said) === norm(answer)) {
				this.say(el, this.tt("againExact"));
				continue;
			}
			const g = await this.generate(el, () => this.api<{ pass: boolean; tutor?: string }>("recall", { id, attempt: said }));
			this.say(el, g.pass ? this.tt("againAlso", { x: answer }) : `${g.tutor ?? ""} ${this.tt("againSettled", { x: answer })}`.trim());
		}
		if (!this.setup.exchange) await this.ask({ buttons: [{ label: this.tt("toPiece"), v: "end", primary: true }] });
		el.done = true;
	}

	/** A scenario's turn that went off, as revised, answered again by the person who answered it (only in a simulation). */
	private async replay() {
		if (!this.setup.exchange) return;
		// The first turn that went off and that the learner rewrote in pass 2 (pass 1's small fixes would not change how it lands).
		const rewritten = new Set(
			Object.entries(this.results)
				.filter(([, r]) => r.text && !r.kept)
				.map(([id]) => this.spots.find((s) => s.id === id)?.who?.turn),
		);
		const turn = this.landed.find((t) => !t.ok && t.cause !== "reader" && rewritten.has(t.t))?.t;
		const text = turn ? this.turnText(turn) : "";
		if (!turn || !text) {
			if (Object.keys(this.results).length) await this.ask({ buttons: [{ label: this.tt("toPiece"), v: "end", primary: true }] });
			return;
		}
		const el = this.newStop();
		const r = await this.generate(el, () => this.api<{ author: string | null; text: string; before: string }>("replay", { turn, text }));
		if (r.author && r.text) {
			this.say(el, this.tt("replayIntro", { name: r.author }));
			this.readerNow = r.author;
			this.reader(el, r.text);
			this.readerNow = null;
			this.quiet(el, this.tt("replayBefore", { x: r.before }));
		}
		await this.ask({ buttons: [{ label: this.tt("toPiece"), v: "end", primary: true }] });
		el.done = true;
	}

	private async endP2() {
		const done = this.spots.flatMap((s) => (this.results[s.id] ? [{ id: s.id, ...this.results[s.id] }] : []));
		const own = done.filter((r) => r.text && r.self && !r.skipped);
		const given = done.filter((r) => r.text && (r.gave || r.skipped));
		// Pass-1 changes the learner did not make on their own (a fix or a choice they got right is theirs already); the
		// notes call says which of these and of pass 2's parts earn an entry (server/revision/pass2 notesFor).
		const p1 = this.pass1.flatMap((st, i) => {
			const o = outcomeOf(st, this.answers[i]);
			if (o.kept || o.deferred || st.kind === "quiet" || st.kind === "tick" || st.kind === "defer") return [];
			if ((st.kind === "fix" || st.kind === "choice") && o.self && o.ok) return [];
			return st.kind === "group" ? (st.parts ?? []).map((p) => p.item) : [st.item];
		});
		const asBefore = [...own, ...given]
			.slice(0, 6)
			.map((r) => ({ text: r.construct ?? "", own: own.includes(r), before: r.orig || r.before, final: r.text }));
		const el = this.newStop();
		// The piece is finished on the server, which then writes its notebook entries (one call, after the learner has
		// moved on): rebuilt parts first, then those given, then pass 1's. What pass 2 reworked stands in meanwhile.
		const items = [...own, ...given].map((r) => ({ id: r.id, orig: r.orig || r.before || "", final: r.text ?? "", own: own.includes(r) }));
		await this.generate(el, () => this.api("end", { learned: asBefore, notes: { items, p1 } }));
		await refreshWriting();
		// Finishing a piece counts towards the learner's day (the server credits it as the piece is finished); the glass
		// is poured when the week is next shown. The tour's sandbox keeps its own.
		if (sandboxed()) practised("learned");
		goto(`/w/${this.sid}`);
	}
}
