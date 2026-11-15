import { settled, tick } from "svelte";
import { app } from "#lib/account/app.svelte.ts";
import { t } from "#lib/i18n/index.svelte.ts";
import { pacing } from "#lib/session/clock.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { enterSandbox, leaveSandbox, type Sandbox } from "./sandbox.svelte.ts";
import { playTape, recordTape, stopTape, type Tape } from "./tape";

/*
 * The tour's director: a pointer that walks the learner through the app by doing it, on stand-in data (the sandbox,
 * sandbox.svelte.ts) with the model's answers from a tape (tape.ts). It moves, clicks, types and drags on the real
 * pages; the learner only watches, and can pause, skip a chapter, go back one, or leave. Chapters start from their own
 * page and their own data, so any chapter can be played alone.
 *
 * Each step of a chapter is a primitive here; every primitive waits while paused and throws `Stopped` once the chapter
 * is left, so a chapter is written as straight-line code.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Chapter = { key: string; start: string; seed: () => Partial<Sandbox>; run: (d: Director) => Promise<void> };

export class Stopped extends Error {}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CJK = /[　-鿿가-힯＀-￯]/g;

class Director {
	on = $state(false);
	/** Bumped when the tour starts, ends or changes chapter: the app's pages remount under it, reading the sandbox afresh. */
	epoch = $state(0);
	/** Unmount the old page before replacing its backing state, not while its async reads are rebasing. */
	switching = $state(false);
	chapter = $state(0);
	chapters: Chapter[] = [];
	paused = $state(false);
	/** A pause with nothing happening (a caption being read, a page just arrived at being looked at): the learner may cut
	 *  it short (the caption's next button, a click anywhere). Moves, clicks and the app's own waits run their course. */
	idle = $state(false);
	private idleSince = 0;
	private skipped = false;
	caption = $state<{ text: string; n: number } | null>(null);
	/** What the caption is about: lit, the rest of the page dimmed. */
	focus = $state<Rect | null>(null);
	cursor = $state({ x: 0, y: 0, shown: false, down: false, n: 0 });
	/** The keys of a shortcut shown being pressed (pasting), where they are shown. */
	keys = $state<{ labels: string[]; x: number; y: number; down: boolean } | null>(null);
	/** A click's ring, where it landed. */
	ring = $state<{ x: number; y: number; n: number } | null>(null);
	recording = false;
	tape: Tape | null = null;
	private playback: Tape = [];
	/** What the starter undoes when the tour ends (a language swapped in for it). */
	onEnd: (() => void) | null = null;
	private run = 0;
	private resume: (() => void) | null = null;
	private captionN = 0;
	private focusEls: Element[] = [];
	/** The page the last caption was on: a new page is first seen whole, lit, before anything on it is singled out. */
	private seenPath = "";

	/** The guide's words, in the tutor's language (it explains, as the tutor does). */
	t = (key: string, vars?: Record<string, string | number>) => t(app.tutor, key, vars);

	async start(chapters: Chapter[], tape: Tape, opts: { record?: boolean; at?: number } = {}) {
		this.chapters = chapters;
		this.recording = !!opts.record;
		this.playback = tape;
		if (this.recording) this.tape = recordTape();
		else playTape(tape);
		document.documentElement.classList.add("touring");
		pacing.speed = 1.6;
		this.on = true;
		const p = innerWidth / 2;
		this.cursor = { x: p, y: innerHeight * 0.62, shown: false, down: false, n: 0 };
		await this.play(opts.at ?? 0);
	}
	/** Leaves the tour: the learner's own data comes back, and the page they land on reads it. */
	async end() {
		this.run++;
		this.release();
		this.switching = true;
		await tick();
		// Leave a focused tour page while its sandbox is still in force; do not remount it on real data.
		if (page.url.pathname !== "/" || page.url.search) await goto("/", { replace: true });
		stopTape();
		leaveSandbox();
		this.onEnd?.();
		this.onEnd = null;
		document.documentElement.classList.remove("touring");
		pacing.speed = 1;
		pacing.paused = false;
		this.on = false;
		this.caption = null;
		this.focus = null;
		this.focusEls = [];
		this.keys = null;
		this.cursor.shown = false;
		this.epoch++;
		this.switching = false;
		await settled();
		document.getElementById("draft")?.focus({ preventScroll: true });
	}
	/** Plays chapter `i` from its start, then the ones after it. */
	async play(i: number) {
		const run = ++this.run;
		this.release();
		this.paused = false;
		pacing.paused = false;
		for (let n = i; n < this.chapters.length; n++) {
			if (run !== this.run) return;
			// A chapter's seed must not update the previous chapter's awaited derives before it unmounts.
			// Besides mixing states, that triggers sveltejs/svelte#18895 when the pending batch is rebased.
			this.switching = true;
			await tick();
			if (run !== this.run) return;
			const c = this.chapters[n];
			// Each chapter can be replayed independently, including back/next after consuming its tape.
			if (!this.recording) playTape(this.playback);
			this.chapter = n;
			this.caption = null;
			this.focus = null;
			this.focusEls = [];
			this.keys = null;
			this.idle = false;
			this.seenPath = "";
			enterSandbox(c.seed());
			this.epoch++;
			if (page.url.pathname !== c.start) await goto(c.start);
			if (run !== this.run) return;
			this.switching = false;
			await settled();
			await sleep(450);
			try {
				await c.run(this);
			} catch (e) {
				if (e instanceof Stopped) return;
				console.error("tour", e);
			}
		}
		if (run === this.run) {
			if (this.recording) (window as unknown as { __tourTape: Tape }).__tourTape = this.tape ?? [];
			else this.end();
		}
	}
	next() {
		if (this.chapter < this.chapters.length - 1) this.play(this.chapter + 1);
		else this.end();
	}
	back() {
		this.play(Math.max(0, this.chapter - 1));
	}
	/** Ends the idle pause under way (and a pause the learner made in it); nothing otherwise. A second click straight
	 *  after the first does not also cut the next one. */
	skip() {
		if (!this.idle || Date.now() - this.idleSince < 350) return;
		this.skipped = true;
		if (this.paused) this.toggle();
	}
	toggle() {
		this.paused = !this.paused;
		pacing.paused = this.paused;
		if (!this.paused) this.release();
	}
	private release() {
		this.resume?.();
		this.resume = null;
	}

	/* ---------- Primitives ---------- */
	/** Waits out a pause, and stops a chapter that was left. */
	private async gate(run: number) {
		while (this.paused && run === this.run) await new Promise<void>((r) => (this.resume = r));
		if (run !== this.run) throw new Stopped();
	}
	private token() {
		return this.run;
	}
	/** Waits `ms`, pausable, in small steps; an idle wait may be skipped. */
	async wait(ms: number, opts: { idle?: boolean } = {}) {
		const run = this.token();
		let left = ms;
		if (opts.idle) {
			this.idle = true;
			this.idleSince = Date.now();
			this.skipped = false;
		}
		try {
			while (left > 0 && !(opts.idle && this.skipped)) {
				await this.gate(run);
				const step = Math.min(left, 50);
				await sleep(step);
				left -= step;
			}
			await this.gate(run);
		} finally {
			if (opts.idle && run === this.run) this.idle = false;
		}
	}
	/** The first visible element matching `sel` (a function may pick one), waiting for it to appear. */
	async find(sel: string | (() => Element | null | undefined), timeout = 20000): Promise<HTMLElement> {
		const run = this.token();
		const t0 = Date.now();
		for (;;) {
			await this.gate(run);
			const el = typeof sel === "string" ? [...document.querySelectorAll<HTMLElement>(sel)].find(visible) : (sel() as HTMLElement | null | undefined);
			if (el && visible(el)) return el;
			if (Date.now() - t0 > timeout) throw new Error(`tour: nothing matches ${String(sel)}`);
			await sleep(120);
		}
	}
	/** Says something about `about` (one element or several: lit together, the page dimmed), and waits long enough to
	 *  read it. On a page just arrived at, the page is first left to be seen whole. */
	async say(
		key: string,
		about?: string | HTMLElement | null | (HTMLElement | null | undefined)[],
		opts: { vars?: Record<string, string | number>; hold?: number } = {},
	) {
		if (location.pathname !== this.seenPath) {
			this.seenPath = location.pathname;
			this.focus = null;
			this.focusEls = [];
			await this.wait(1600, { idle: true });
		}
		const list = Array.isArray(about) ? about : [typeof about === "string" ? await this.find(about) : about];
		const els = list.filter((e): e is HTMLElement => !!e && e.isConnected && visible(e));
		if (els.length) await this.show(els[0], els);
		else this.focus = null;
		this.focusEls = els;
		const text = this.t(key, opts.vars);
		this.caption = { text, n: ++this.captionN };
		await this.wait(opts.hold ?? readingTime(text), { idle: true });
	}
	/** Clears the caption and the light (the pointer goes on working). */
	quiet() {
		this.caption = null;
		this.focus = null;
		this.focusEls = [];
	}
	/** Keeps the light on what it is about while the page moves under it; it goes out when that leaves the page. */
	follow() {
		if (!this.focusEls.length) return;
		if (this.focusEls.some((e) => !e.isConnected)) {
			this.focus = null;
			this.focusEls = [];
			return;
		}
		this.focus = rectOf(this.focusEls);
	}
	/** Brings `el` into view if it is not. */
	async show(el: Element, lit?: Element[]) {
		const r = el.getBoundingClientRect();
		const top = 70;
		if (r.top < top || r.bottom > innerHeight - 40) {
			el.scrollIntoView({ block: r.height > innerHeight * 0.6 ? "start" : "center", behavior: reduced() ? "auto" : "smooth" });
			await this.wait(560);
		}
		if (lit) this.focus = rectOf(lit);
	}
	/** Moves the pointer to `el` (to a point inside it, as fractions of its box). */
	async point(el: HTMLElement | string, at: [number, number] = [0.5, 0.5]) {
		let target = typeof el === "string" ? await this.find(el) : el;
		// Something just added may not be laid out yet (or was replaced): wait until it can be pointed at.
		if (!target.isConnected || !visible(target)) {
			const t = target;
			target = await this.find(() => (t.isConnected && visible(t) ? t : null), 6000);
		}
		await this.show(target);
		const r = target.getBoundingClientRect();
		await this.glide(r.left + r.width * at[0], r.top + r.height * at[1]);
		return target;
	}
	/** The pointer's move: an eased arc, quicker for short distances. */
	async glide(x: number, y: number) {
		const run = this.token();
		const from = { x: this.cursor.x, y: this.cursor.y };
		if (!this.cursor.shown) {
			this.cursor = { ...this.cursor, x, y, shown: true };
			await this.wait(260);
			return;
		}
		const dist = Math.hypot(x - from.x, y - from.y);
		const ms = reduced() ? 0 : Math.min(1250, 420 + dist * 0.95);
		// The arc bows to one side, as a hand moves.
		const bow = Math.min(60, dist * 0.18);
		const nx = -(y - from.y) / (dist || 1);
		const ny = (x - from.x) / (dist || 1);
		const c = { x: (from.x + x) / 2 + nx * bow, y: (from.y + y) / 2 + ny * bow };
		const t0 = performance.now();
		await new Promise<void>((done) => {
			const frame = (now: number) => {
				if (run !== this.run) return done();
				if (this.paused) return requestAnimationFrame(frame);
				const u = ms ? Math.min(1, (now - t0) / ms) : 1;
				const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
				const a = 1 - e;
				this.cursor.x = a * a * from.x + 2 * a * e * c.x + e * e * x;
				this.cursor.y = a * a * from.y + 2 * a * e * c.y + e * e * y;
				if (u < 1) requestAnimationFrame(frame);
				else done();
			};
			requestAnimationFrame(frame);
		});
		await this.gate(run);
	}
	/** Presses where the pointer is. */
	async press() {
		this.cursor.down = true;
		this.ring = { x: this.cursor.x, y: this.cursor.y, n: (this.ring?.n ?? 0) + 1 };
		await this.wait(130);
		this.cursor.down = false;
	}
	/** Moves to `el` and clicks it. */
	async click(sel: HTMLElement | string, at?: [number, number]) {
		const el = await this.point(sel, at);
		await this.wait(260);
		await this.press();
		// Only a field takes the focus: a focused button would show its tip.
		if (el.matches("input, textarea")) el.focus({ preventScroll: true });
		el.click();
		await this.wait(450);
		return el;
	}
	/** Clicks into a field and types into it (replacing what it holds, when asked), as a person types. */
	async type(sel: HTMLElement | string, text: string, opts: { replace?: boolean; cps?: number } = {}) {
		const el = (await this.click(sel)) as HTMLInputElement | HTMLTextAreaElement;
		const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
		const put = (v: string) => {
			setter?.call(el, v);
			el.dispatchEvent(new InputEvent("input", { bubbles: true, data: v.slice(-1), inputType: "insertText" }));
		};
		let v = opts.replace ? "" : el.value;
		if (opts.replace && el.value) {
			el.select();
			await this.wait(240);
			put("");
		}
		// Long text goes in at a brisk pace, so it takes about four seconds whatever its length.
		const cps = opts.cps ?? Math.max(24, text.length / 4);
		for (const ch of text) {
			v += ch;
			put(v);
			await this.wait((1000 / cps) * (0.6 + Math.random() * 0.8));
		}
		await this.wait(200);
		return el;
	}
	/** Clicks into a field and pastes into it: the shortcut's keys show being pressed, and the text arrives at once (on a
	 *  touch screen, where there are no keys, it only arrives). */
	async paste(sel: HTMLElement | string, text: string) {
		const el = (await this.click(sel)) as HTMLInputElement | HTMLTextAreaElement;
		const put = () => {
			Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, text);
			el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertFromPaste" }));
		};
		if (matchMedia("(pointer: coarse)").matches) {
			await this.wait(400);
			put();
			await this.wait(600);
			return el;
		}
		// Over the empty field, inside the light, clear of the pointer (which clicked its middle).
		const r = el.getBoundingClientRect();
		const mac = /Mac|iPhone|iPad/.test(navigator.platform);
		this.keys = {
			labels: mac ? ["⌘", "V"] : ["Ctrl", "V"],
			x: Math.min(r.right - 90, r.left + r.width / 2 + 110),
			y: r.top + Math.min(r.height, 120) / 2,
			down: false,
		};
		await this.wait(700);
		this.keys.down = true;
		await this.wait(200);
		put();
		await this.wait(260);
		this.keys.down = false;
		await this.wait(800);
		this.keys = null;
		await this.wait(300);
		return el;
	}
	/** Presses Enter in a field (a form's submit, a card's answer). */
	async enter(el: HTMLElement) {
		for (const type of ["keydown", "keyup"])
			el.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
		await this.wait(200);
	}
	/** Drags across from one element to another (marking words), with pointer events along the way. */
	async drag(from: HTMLElement, to: HTMLElement) {
		await this.show(from);
		const a = from.getBoundingClientRect();
		const b = to.getBoundingClientRect();
		const p0 = { x: a.left + 2, y: a.top + a.height / 2 };
		const p1 = { x: b.right - 2, y: b.top + b.height / 2 };
		await this.glide(p0.x, p0.y);
		const fire = (type: string, x: number, y: number) => {
			const target = document.elementFromPoint(x, y) ?? from;
			target.dispatchEvent(
				new PointerEvent(type, {
					bubbles: true,
					cancelable: true,
					clientX: x,
					clientY: y,
					pointerId: 1,
					pointerType: "mouse",
					isPrimary: true,
					button: 0,
					buttons: type === "pointerup" ? 0 : 1,
				}),
			);
		};
		// The pane that keeps the learner's clicks off the page would be what is under the pointer: it steps aside.
		const html = document.documentElement;
		html.classList.add("tour-drag");
		this.cursor.down = true;
		fire("pointerdown", p0.x, p0.y);
		const steps = 20;
		for (let i = 1; i <= steps; i++) {
			const u = i / steps;
			const x = p0.x + (p1.x - p0.x) * u;
			const y = p0.y + (p1.y - p0.y) * u;
			this.cursor.x = x;
			this.cursor.y = y;
			fire("pointermove", x, y);
			await this.wait(55);
		}
		fire("pointerup", p1.x, p1.y);
		html.classList.remove("tour-drag");
		this.cursor.down = false;
		await this.wait(300);
	}
	/** Goes to a page as a link would. */
	async go(path: string) {
		await goto(path);
		await settled();
		await this.wait(500);
	}
}

function visible(el: Element) {
	const r = el.getBoundingClientRect();
	if (r.width < 2 || r.height < 2) return false;
	const s = getComputedStyle(el);
	return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
}
function rectOf(els: Element | Element[]): Rect {
	const rs = (Array.isArray(els) ? els : [els]).map((e) => e.getBoundingClientRect());
	const x = Math.min(...rs.map((r) => r.left));
	const y = Math.min(...rs.map((r) => r.top));
	return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y };
}
/** How long a caption stays: long enough to read it unhurried. */
function readingTime(text: string) {
	const cjk = (text.match(CJK) ?? []).length;
	const rest = text.length - cjk;
	return Math.max(3400, 1400 + cjk * 165 + rest * 60);
}

export type { Director };
export const director = new Director();
