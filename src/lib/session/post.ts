import { type Component, mount, unmount } from "svelte";
import { type Clock, reduced, SLOW } from "./clock";
import { outline } from "./highlight";
import { glide, jump } from "./scroll";
import { clamp, esc, wordGap } from "./text";
import { type Atom, type DocDef, type MapRow, SEP } from "./types";

/*
 * The post, as the learner watches it being gone over. It is the one part of the session drawn by hand rather than by
 * Svelte: every character is its own span so the tutor can type it, strike it and write beside it, and the cards of
 * pass 1 open inside it, under the line being typed (each card is a Svelte component mounted there). The page owns
 * the elements; this owns what is inside the text.
 */
type Item = { id: string; el: HTMLElement; para: HTMLElement; first: number; last: number };
type Doc = { tokens: { el: HTMLElement }[]; items: Map<string, Item>; paras: HTMLElement[] };
type Edit = { it: Item; ins: HTMLElement; hadText: boolean; seq: number };
export type Who = { name: string; color: string };

export class Post {
	doc: Doc | null = null;
	typed = -1;
	/** The learner's own pass-1 answers, which replace the words they fixed wherever the post is rebuilt. */
	carried: Record<string, string> = {};
	/** Coming back to pass 1: what the learner already went through is written out at once, without the typing. */
	instant = false;
	target = "en";
	/**
	 * A scenario's post is the learner's turns; what the others said stands between them, quietly, never typed: `lead`
	 * before the first turn (what it answered), `between[i]` in the gap after turn i+1 (a separator line in the text).
	 */
	lead: { author: string; text: string }[] = [];
	between: { author: string; text: string }[][] = [];
	/** A translation's given names and terms, under its source: how the source shows each, the word to use, what it is. */
	terms: { term: string; shown: string; gloss: string }[] = [];
	/** The lead shown whole (a translation's source), not cut to two lines. */
	leadFull = false;
	/** The context boxes and the token each stands before (shown once the typing reaches it). */
	private ctxAt: { el: HTMLElement; at: number }[] = [];
	private caretEl: HTMLElement;
	private edits = new Map<string, Edit>();
	private ghost: HTMLElement | null = null;
	private ro: ResizeObserver;

	constructor(
		readonly text: HTMLElement,
		readonly body: HTMLElement,
		readonly region: HTMLElement,
		readonly clock: Clock,
		readonly paneMode: () => boolean,
	) {
		this.caretEl = Object.assign(document.createElement("span"), { className: "caret" });
		// Reflow (a resize, a font arriving) moves the lines; the highlight follows.
		this.ro = new ResizeObserver(() => {
			const p = this.text.querySelector(":scope > .hl-shape path:not(.out)");
			const els = [...this.text.querySelectorAll(".item.hl")];
			if (p && els.length) p.setAttribute("d", outline(els, this.text));
			this.fades();
		});
		this.ro.observe(this.text);
		this.ro.observe(this.body);
		this.body.addEventListener("scroll", this.fades, { passive: true });
	}
	destroy() {
		this.ro.disconnect();
		this.body.removeEventListener("scroll", this.fades);
	}

	/* ---------- Building ---------- */
	build(def: DocDef) {
		this.text.replaceChildren();
		const tokens: Doc["tokens"] = [];
		const items = new Map<string, Item>();
		const paras: HTMLElement[] = [];
		const carryText = (c: { carry: string; text: string }) => this.carried[c.carry] ?? c.text;
		const addText = (parent: HTMLElement, str: string) => {
			for (const ch of Array.from(str)) {
				const el = document.createElement("span");
				el.className = "c";
				el.textContent = ch;
				parent.appendChild(el);
				tokens.push({ el });
			}
		};
		const addAtom = (parent: HTMLElement, part: Exclude<Atom, string>) => {
			const el = document.createElement("span");
			if ("hole" in part) {
				el.className = "hole";
				el.textContent = part.hole;
			} else if ("choice" in part) {
				el.className = "hole choice";
				el.innerHTML = part.choice.map((o, i) => `<span class="opt" data-opt="${i}">${esc(o)}</span>`).join('<span class="bar">/</span>');
			}
			parent.appendChild(el);
			tokens.push({ el });
		};
		const said = (msgs: { author: string; text: string }[], full = false) => {
			const box = document.createElement("div");
			box.className = full ? "ctx full" : "ctx";
			box.setAttribute("aria-hidden", "false");
			for (const m of msgs) {
				const row = document.createElement("p");
				row.innerHTML = `<b>${esc(m.author)}</b> ${esc(full ? m.text : m.text.replace(/\s+/g, " "))}`;
				box.appendChild(row);
			}
			this.text.appendChild(box);
			this.ctxAt.push({ el: box, at: tokens.length });
		};
		this.ctxAt = [];
		if (this.lead.length) said(this.lead, this.leadFull);
		if (this.terms.length) {
			const row = document.createElement("p");
			row.className = "terms";
			for (const t of this.terms) {
				const el = document.createElement("span");
				el.className = "term";
				el.title = t.gloss;
				el.innerHTML = `${esc(t.shown)} <b>${esc(t.term)}</b>`;
				row.appendChild(el);
			}
			this.ctxAt.at(-1)?.el.appendChild(row);
		}
		let gap = 0;
		for (const line of def) {
			// The separator line, as text or as one of pass 2's map fragments.
			const flat = line
				.map((g) => (typeof g === "string" ? g : "carry" in g ? g.text : g.parts.map((x) => (typeof x === "string" ? x : "")).join("")))
				.join("");
			if (flat.trim() === SEP) {
				const msgs = this.between[gap++] ?? [];
				if (msgs.length) said(msgs);
				else {
					const hr = document.createElement("div");
					hr.className = "ctx gap";
					this.text.appendChild(hr);
				}
				continue;
			}
			const p = document.createElement("p");
			p.className = "para";
			this.text.appendChild(p);
			paras.push(p);
			for (const seg of line) {
				if (typeof seg === "string") {
					addText(p, seg);
					continue;
				}
				if ("carry" in seg) {
					addText(p, carryText(seg));
					continue;
				}
				const el = document.createElement("span");
				el.className = "item";
				el.dataset.item = seg.item;
				p.appendChild(el);
				const first = tokens.length;
				for (const part of seg.parts) {
					if (typeof part === "string") addText(el, part);
					else if ("carry" in part) addText(el, carryText(part));
					else addAtom(el, part);
				}
				items.set(seg.item, { id: seg.item, el, para: p, first, last: Math.max(first, tokens.length) - 1 });
				// A spot already rewritten keeps its faint underline when the post is rebuilt.
				if (seg.revised) el.innerHTML = `<span class="revised">${esc(el.textContent ?? "")}</span>`;
			}
		}
		this.doc = { tokens, items, paras };
		this.ghost = null;
		return this.doc;
	}
	/** Swap the post's items without changing its text or scroll. */
	rebuild(def: DocDef) {
		const top = this.body.scrollTop;
		this.edits.clear();
		this.build(def);
		jump(this.body, top);
		this.fades();
	}
	item(id: string) {
		return this.doc?.items.get(id);
	}
	/** The post as it reads now: struck words, flags and marks left out. */
	plainText() {
		// Between a scenario's turns the separator line stands again where the others' words were (the lead goes).
		const parts: HTMLElement[] = [];
		let seen = false;
		for (const el of this.text.children) {
			if (el.classList.contains("para")) {
				parts.push(el as HTMLElement);
				seen = true;
			} else if (el.classList.contains("ctx") && seen) parts.push(el as HTMLElement);
		}
		return parts
			.map((p) => {
				if (p.classList.contains("ctx")) return SEP;
				const c = p.cloneNode(true) as HTMLElement;
				for (const e of c.querySelectorAll(".flag, .slot, .caret, .tag2, .item.del")) e.remove();
				return (c.textContent ?? "").replace(/[ \t]+/g, " ").trim();
			})
			.join("\n\n");
	}

	/* ---------- Typing ---------- */
	hideAll() {
		for (const x of this.doc?.tokens ?? []) x.el.classList.add("pending");
		for (const c of this.ctxAt) c.el.classList.toggle("pending", c.at > 0);
		this.text.prepend(this.caretEl);
		this.typed = -1;
	}
	showAll() {
		for (const x of this.doc?.tokens ?? []) x.el.classList.remove("pending");
		for (const c of this.ctxAt) c.el.classList.remove("pending");
		this.typed = (this.doc?.tokens.length ?? 0) - 1;
	}
	caretAfter(el: Element) {
		el.after(this.caretEl);
	}
	caretBack() {
		if (this.doc && this.typed >= 0) this.doc.tokens[this.typed].el.after(this.caretEl);
	}
	dropCaret() {
		this.caretEl.remove();
	}
	/** Type up to token `index`; a long wait (throttled tab) types several characters at once. */
	async typeTo(index: number) {
		const doc = this.doc;
		if (!doc) return;
		if (this.instant) {
			while (this.typed < index) doc.tokens[++this.typed].el.classList.remove("pending");
			for (const c of this.ctxAt) if (c.at <= this.typed + 1) c.el.classList.remove("pending");
			if (this.typed >= 0) doc.tokens[this.typed].el.after(this.caretEl);
			return;
		}
		let steps = 1;
		while (this.typed < index) {
			const target = Math.min(index, this.typed + steps);
			while (this.typed < target) {
				this.typed++;
				doc.tokens[this.typed].el.classList.remove("pending");
			}
			// What the others said comes in once the turn before it is typed out.
			for (const c of this.ctxAt) if (c.at <= this.typed + 1) c.el.classList.remove("pending");
			doc.tokens[this.typed].el.after(this.caretEl);
			if (this.paneMode()) this.followCaret();
			const base = 26 * SLOW;
			const ms = /[.,;:?!)]/.test(doc.tokens[this.typed].el.textContent ?? "") ? 150 * SLOW : base;
			const t0 = performance.now();
			await this.clock.sleep(ms, { movement: true });
			steps = Math.max(1, Math.round((performance.now() - t0) / base));
		}
	}
	/** The first sentence end at or after token i, so a mark is only explained once the words it depends on are there. */
	unitEnd(i: number) {
		const toks = this.doc?.tokens ?? [];
		let k = Math.max(0, i);
		const para = toks[k]?.el.closest(".para");
		for (; k < toks.length - 1; k++) {
			const next = toks[k + 1].el;
			if (next.closest(".para") !== para) return k;
			const ch = toks[k].el.textContent ?? "";
			// A full stop, question or exclamation mark (or a run of them) followed by a space or a closing quote ends it.
			if (ch.length === 1 && /[.!?。！？…]/.test(ch) && !/[.!?。！？…]/.test(next.textContent ?? "")) {
				while (k < toks.length - 1 && /^["”’»)）」』]$/.test(toks[k + 1].el.textContent ?? "")) k++;
				if (/[。！？]/.test(ch) || k === toks.length - 1 || /^\s$/.test(toks[k + 1].el.textContent ?? "")) return k;
			}
		}
		return toks.length - 1;
	}
	private async typeInto(el: HTMLElement, text: string, perChar = 40, alive = () => true) {
		if (this.instant) {
			el.textContent += text;
			return;
		}
		perChar *= SLOW;
		let i = 0;
		const chars = Array.from(text);
		while (i < chars.length) {
			const t0 = performance.now();
			await this.clock.sleep(perChar, { movement: true });
			if (!alive()) return;
			const n = Math.max(1, Math.round((performance.now() - t0) / perChar));
			el.textContent += chars.slice(i, i + n).join("");
			i += n;
		}
	}

	/* ---------- Marks ---------- */
	select(id: string, who: Who, { flag = true } = {}) {
		const it = this.item(id);
		if (!it) return;
		it.el.style.setProperty("--who", who.color);
		it.el.classList.add("sel");
		if (!flag) return;
		const f = document.createElement("span");
		f.className = "flag";
		f.textContent = who.name;
		it.el.prepend(f);
	}
	unselect(id: string) {
		const it = this.item(id);
		if (!it) return;
		it.el.classList.remove("sel");
		it.el.querySelector(":scope > .flag")?.remove();
	}
	/** Pass 1's suggestion: strike the old words, type the new ones beside them. */
	async suggest(id: string, insText: string, who: Who) {
		const it = this.item(id);
		if (!it) return;
		// Inserted words (an empty item) right before a word bring their own space after them.
		let sib = it.el.nextSibling;
		while (sib && (sib === this.caretEl || !sib.textContent)) sib = sib.nextSibling;
		const next = sib?.textContent?.[0] ?? "";
		// The item's own words, without the tutor's name flag that marks it.
		const own = [...it.el.childNodes]
			.filter((n) => !(n as Element).classList?.contains("flag"))
			.map((n) => n.textContent)
			.join("");
		if (!own && wordGap(next, this.target) && !/\s$/.test(insText)) insText += " ";
		this.strike(it.el);
		const ins = document.createElement("ins");
		ins.className = "ins";
		ins.style.setProperty("--who", who.color);
		// Struck words keep a word gap before the new ones; an insertion already sits in its own gap.
		ins.classList.toggle("gap", !!own && wordGap(insText, this.target));
		it.el.after(ins);
		await this.typeInto(ins, insText, 45);
		ins.after(this.caretEl);
	}
	/** The learner keeps their own words: the suggestion goes and the struck words come back as they were. */
	unsuggest(id: string) {
		const it = this.item(id);
		if (!it) return;
		if (it.el.nextElementSibling?.tagName === "INS") it.el.nextElementSibling.remove();
		it.el.classList.remove("del");
	}
	/** Strike an item's words with one unbroken line: its letters become plain text (one span per letter breaks the line at every space). */
	private strike(el: HTMLElement) {
		for (const c of [...el.querySelectorAll(":scope > .c")]) {
			const prev = c.previousSibling;
			if (prev?.nodeType === Node.TEXT_NODE) {
				prev.textContent += c.textContent ?? "";
				c.remove();
			} else c.replaceWith(document.createTextNode(c.textContent ?? ""));
		}
		el.classList.add("del");
	}
	/** After the last mark of a stop, the caret goes after what was written there. */
	caretAfterItem(id: string) {
		const it = this.item(id);
		if (!it) return;
		const ins = it.el.nextElementSibling?.tagName === "INS" ? it.el.nextElementSibling : null;
		(ins ?? it.el).after(this.caretEl);
	}
	/** A choice the learner made in pass 1, marked in place. */
	markChoice(id: string, picked: number, answer: number) {
		const chip = this.item(id)?.el.querySelector(".hole");
		if (!chip) return;
		for (const o of chip.querySelectorAll<HTMLElement>(".opt")) {
			const n = Number(o.dataset.opt);
			if (picked === answer) o.classList.add(n === picked ? "picked" : "dropped");
			else o.classList.add(n === picked ? "wrong" : n === answer ? "right" : "dropped");
		}
		chip.classList.add("resolved");
	}
	/** The choice's options in the post answer like the card's buttons while it asks. */
	askChoice(id: string, who: Who, onpick: (i: number) => void) {
		const chip = this.item(id)?.el.querySelector<HTMLElement>(".hole");
		if (!chip) return { options: [] as string[], done() {} };
		chip.style.setProperty("--who", who.color);
		chip.classList.add("asking");
		const opts = [...chip.querySelectorAll<HTMLElement>(".opt")];
		const click = (e: Event) => {
			const o = (e.target as Element).closest<HTMLElement>(".opt");
			if (o) onpick(Number(o.dataset.opt));
		};
		chip.addEventListener("click", click);
		return {
			options: opts.map((o) => o.textContent ?? ""),
			done() {
				chip.classList.remove("asking");
				chip.removeEventListener("click", click);
			},
		};
	}
	defer(id: string) {
		const it = this.item(id);
		if (!it) return;
		it.el.classList.add("deferred");
		const tag = Object.assign(document.createElement("span"), { className: "tag2", textContent: "2" });
		it.el.after(tag);
	}
	tick(id: string) {
		this.item(id)?.el.classList.add("resolved-ok");
	}

	/* ---------- Pass 2 edits: the old words struck and the new ones written beside them until the learner moves on ---------- */
	private editFor(id: string, who: Who) {
		let e = this.edits.get(id);
		if (e) return e;
		const it = this.item(id) as Item;
		const slot = it.el.querySelector(".slot");
		const hadText = !slot && (it.el.textContent ?? "").trim().length > 0;
		const ins = document.createElement("ins");
		ins.className = "ins";
		ins.style.setProperty("--who", who.color);
		it.el.style.setProperty("--who", who.color);
		e = { it, ins, hadText, seq: 0 };
		this.edits.set(id, e);
		return e;
	}
	private setEditText(e: Edit, text: string) {
		if (!text) {
			e.ins.remove();
			e.ins.textContent = "";
			e.it.el.classList.remove("del", "drafting");
			return;
		}
		if (!e.ins.isConnected) {
			if (e.hadText) {
				this.strike(e.it.el);
				e.it.el.after(e.ins);
			} else {
				e.it.el.classList.add("drafting");
				e.it.el.append(e.ins);
			}
		}
		e.ins.textContent = text;
		// Struck words end where the new ones begin; keep a word gap unless the new text starts with punctuation.
		e.ins.classList.toggle("gap", e.hadText && wordGap(text, this.target));
	}
	/** Keep the end of the new words in view while they grow. */
	private followEdit(e: Edit) {
		if (!this.paneMode() || !e.ins.isConnected) return;
		const r = e.ins.getBoundingClientRect();
		const br = this.body.getBoundingClientRect();
		if (r.bottom > br.bottom - 24) glide(this.body, this.body.scrollTop + r.bottom - br.bottom + 24);
	}
	/** While the learner types: their words mirrored into the post as they are. */
	showEdit(id: string, text: string, who: Who) {
		if (!this.item(id)) return;
		const e = this.editFor(id, who);
		e.seq++;
		this.setEditText(e, text);
		this.followEdit(e);
		this.fades();
	}
	/** The app writes the words itself (the reference, the tutor's fixes), keeping what is already there. */
	async typeEdit(id: string, text: string, who: Who) {
		if (!this.item(id)) return;
		const e = this.editFor(id, who);
		const my = ++e.seq;
		const have = e.ins.isConnected ? (e.ins.textContent ?? "") : "";
		if (have === text) return;
		this.reveal(e.it.el);
		if (have && !text.startsWith(have)) {
			this.setEditText(e, "");
			await this.clock.sleep(200 * SLOW);
			if (my !== e.seq) return;
		}
		const keep = text.startsWith(have) ? have : "";
		if (!keep) {
			this.setEditText(e, " ");
			e.ins.textContent = "";
			// The gap before the new words follows what will be typed, not the placeholder space.
			e.ins.classList.toggle("gap", e.hadText && wordGap(text.slice(keep.length), this.target));
			if (e.hadText) await this.clock.sleep(380 * SLOW);
			if (my !== e.seq) return;
		}
		await this.typeInto(e.ins, text.slice(keep.length), 20, () => {
			if (my !== e.seq) return false;
			this.followEdit(e);
			return true;
		});
		this.fades();
	}
	/** The learner moved on: the struck words leave, the new ones turn to ink and keep a faint underline. */
	async acceptEdits() {
		const all = [...this.edits.values()].filter((e) => e.ins.isConnected && e.ins.textContent);
		this.edits.clear();
		if (!all.length) return;
		if (!reduced()) {
			for (const e of all) {
				e.it.el.classList.add("going");
				e.ins.classList.add("going");
			}
			await this.clock.sleep(600);
		}
		for (const e of all) {
			const t = e.ins.textContent ?? "";
			e.ins.remove();
			e.it.el.classList.remove("del", "drafting", "going", "sel");
			e.it.el.innerHTML = `<span class="revised">${esc(t)}</span>`;
		}
		this.fades();
	}
	/** The learner's version may reach past the marked words (a whole sentence for a phrase); the struck words then cover it. */
	widen(def: DocDef, id: string, who: Who) {
		const seg = def.flat().find((s) => typeof s !== "string" && "item" in s && s.item === id);
		const want = seg && typeof seg !== "string" && "parts" in seg ? seg.parts.filter((p) => typeof p === "string").join("") : "";
		if (this.item(id) && want === this.item(id)?.el.textContent) return;
		this.rebuild(def);
		this.select(id, who, { flag: false });
	}

	/* ---------- Scrolling ---------- */
	/** The post pane in pass 2 shows a faint edge where there is more above or below. */
	fades = () => {
		const b = this.body;
		b.classList.toggle("above", b.scrollTop > 2);
		b.classList.toggle("below", b.scrollTop + b.clientHeight < b.scrollHeight - 2);
	};
	/** Centre a passage in the post pane. */
	reveal(el: Element) {
		if (!this.paneMode()) return;
		const b = this.body;
		const r = el.getBoundingClientRect();
		const top = r.top - b.getBoundingClientRect().top + b.scrollTop;
		glide(b, top - (b.clientHeight - Math.min(r.height, b.clientHeight)) / 2);
	}
	revealItem(id: string) {
		const it = this.item(id);
		if (it) this.reveal(it.el);
	}
	private followCaret() {
		const c = this.caretEl.getBoundingClientRect();
		const br = this.body.getBoundingClientRect();
		if (c.bottom > br.bottom - 30) this.body.scrollTop += c.bottom - br.bottom + 30;
	}
	/** In pass 1 the page scrolls (the region): keep what is being worked on in its upper part. */
	keepInRegion(el: Element) {
		const box = this.region.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		if (r.top < box.top + 40 || r.bottom > box.bottom - 200) glide(this.region, this.region.scrollTop + r.top - box.top - box.height * 0.3);
	}

	/* ---------- Pass 1 cards: in a drawer under the paragraph being worked on ---------- */
	/** Opens a drawer under the item's paragraph with `card` mounted in it; `close` folds it and unmounts the card. */
	drawer<P extends Record<string, unknown>>(id: string, card: Component<P>, props: P) {
		const it = this.item(id) as Item;
		const d = Object.assign(document.createElement("div"), { className: "drawer" });
		const inner = Object.assign(document.createElement("div"), { className: "drawer-inner" });
		d.appendChild(inner);
		it.para.after(d);
		const app = mount(card, { target: inner, props });
		// Clip while the height moves (opening or growing), then let the shadow show.
		let openTimer: ReturnType<typeof setTimeout> | undefined;
		const ro = new ResizeObserver(() => {
			d.classList.remove("open");
			clearTimeout(openTimer);
			d.style.height = `${inner.offsetHeight}px`;
			openTimer = setTimeout(() => d.classList.add("open"), reduced() ? 0 : 520);
		});
		ro.observe(inner);
		setTimeout(() => {
			const r = d.getBoundingClientRect();
			const box = this.region.getBoundingClientRect();
			const over = r.bottom - box.bottom + 24;
			if (over > 0) glide(this.region, this.region.scrollTop + Math.min(over, Math.max(0, r.top - box.top - 160)));
		}, 420);
		return {
			close: () => {
				ro.disconnect();
				clearTimeout(openTimer);
				d.classList.remove("open");
				d.classList.add("closing");
				d.style.height = "0px";
				return new Promise<void>((r) =>
					setTimeout(
						() => {
							unmount(app);
							d.remove();
							r();
						},
						reduced() ? 0 : 370,
					),
				);
			},
		};
	}

	/* ---------- The map's highlight ---------- */
	showRow(row: MapRow, ghostLabel: string) {
		this.clearRow();
		if (!this.doc) return;
		const els = row.hl.map((id) => this.item(id)?.el).filter((e): e is HTMLElement => !!e);
		for (const el of els) el.classList.add("hl");
		if (row.ghost && this.item(row.ghost)) {
			this.ghost = Object.assign(document.createElement("span"), { className: "slot", textContent: ghostLabel });
			this.item(row.ghost)?.el.after(" ", this.ghost);
		}
		this.drawHighlight();
		if (els[0]) this.reveal(els[0]);
	}
	clearRow() {
		for (const el of this.text.querySelectorAll(".item.hl")) el.classList.remove("hl");
		this.drawHighlight();
		if (this.ghost) {
			if (this.ghost.previousSibling?.nodeType === Node.TEXT_NODE) this.ghost.previousSibling.remove();
			this.ghost.remove();
		}
		this.ghost = null;
	}
	private drawHighlight() {
		let svg = this.text.querySelector<SVGSVGElement>(":scope > .hl-shape");
		const els = [...this.text.querySelectorAll(".item.hl")];
		if (!svg && !els.length) return;
		if (!svg) {
			svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("class", "hl-shape");
			svg.setAttribute("aria-hidden", "true");
			this.text.prepend(svg);
		}
		// The old shape fades as the new one comes in.
		for (const old of svg.querySelectorAll("path:not(.out)")) {
			old.classList.add("out");
			setTimeout(() => old.remove(), reduced() ? 0 : 320);
		}
		if (!els.length) return;
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", outline(els, this.text));
		path.classList.add("out");
		svg.append(path);
		requestAnimationFrame(() => path.classList.remove("out"));
	}
	scrollTop(top: number) {
		jump(this.body, clamp(top, 0, this.body.scrollHeight));
		this.fades();
	}
}
