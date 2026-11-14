/*
 * A hover tip: a small pill that names what a control does, shown after a short rest of the pointer (or on keyboard
 * focus), never on touch. Once one is showing, moving to the next tipped control shows its tip at once, as menus do.
 * One shared node for the whole app, so tips never stack. The element keeps an accessible name: the tip text becomes
 * its aria-label when it has none.
 */
import type { Action } from "svelte/action";

type Side = "top" | "bottom" | "right" | "left";
type Opts = string | { text: string; side?: Side; tap?: boolean };
const DELAY = 400;
const WARM = 400;
let node: HTMLDivElement | null = null;
let timer = 0;
let coolTimer = 0;
let warm = false;
let owner: HTMLElement | null = null;

function pill() {
	if (node) return node;
	node = document.createElement("div");
	node.className = "tip-pill";
	node.setAttribute("role", "tooltip");
	node.id = "tip-pill";
	// In the top layer, or a modal dialog (also there) would cover it.
	if ("popover" in node) node.popover = "manual";
	document.body.append(node);
	return node;
}
function place(el: HTMLElement, side: Side) {
	const p = pill();
	const r = el.getBoundingClientRect();
	const w = p.offsetWidth;
	const h = p.offsetHeight;
	const gap = 8;
	let x: number;
	let y: number;
	if (side === "right" || side === "left") {
		x = side === "right" ? r.right + gap : r.left - gap - w;
		y = r.top + r.height / 2 - h / 2;
	} else {
		x = r.left + r.width / 2 - w / 2;
		y = side === "top" ? r.top - gap - h : r.bottom + gap;
		if (y + h > innerHeight - 4) y = r.top - gap - h;
		if (y < 4) y = r.bottom + gap;
	}
	x = Math.max(6, Math.min(x, innerWidth - w - 6));
	p.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
	p.dataset.side = side;
}
function show(el: HTMLElement, text: string, side: Side) {
	const p = pill();
	clearTimeout(coolTimer);
	owner = el;
	p.textContent = text;
	// Shown again each time, so it is the newest thing in the top layer: above a dialog opened since.
	if (p.popover) {
		if (p.matches(":popover-open")) p.hidePopover();
		p.showPopover();
	}
	// A sentence wraps in a narrow column; a name stays on one line.
	p.classList.toggle("long", text.length > 42);
	place(el, side);
	p.classList.add("on");
	warm = true;
}
function hide(el?: HTMLElement) {
	clearTimeout(timer);
	if (el && owner !== el) return;
	owner = null;
	node?.classList.remove("on");
	clearTimeout(coolTimer);
	coolTimer = window.setTimeout(() => (warm = false), WARM);
}

export const tip: Action<HTMLElement, Opts | undefined> = (el, opts) => {
	let text = "";
	let side: Side = "bottom";
	let tap = false;
	let touchPress = false;
	const set = (o: Opts | undefined) => {
		text = typeof o === "string" ? o : (o?.text ?? "");
		side = typeof o === "object" && o?.side ? o.side : "bottom";
		tap = typeof o === "object" && !!o?.tap;
		if (!el.hasAttribute("aria-label") || el.dataset.tipLabel) {
			if (text) {
				el.setAttribute("aria-label", text);
				el.dataset.tipLabel = "1";
			}
		}
		if (owner === el) {
			if (text) show(el, text, side);
			else hide(el);
		}
	};
	set(opts);
	const enter = (e: PointerEvent) => {
		if (e.pointerType === "touch" || !text) return;
		clearTimeout(timer);
		if (warm) show(el, text, side);
		else timer = window.setTimeout(() => show(el, text, side), DELAY);
	};
	const leave = () => hide(el);
	// With `tap`, a touch toggles the tip (for an ⓘ, whose whole job is the tip).
	const down = (e: PointerEvent) => {
		const wasOpen = owner === el;
		touchPress = e.pointerType !== "mouse" && !wasOpen;
		hide(el);
	};
	const click = () => {
		if (tap && touchPress && text) show(el, text, side);
		touchPress = false;
	};
	const focus = () => {
		if (text && el.matches(":focus-visible")) show(el, text, side);
	};
	const key = (e: KeyboardEvent) => {
		if (e.key === "Escape") hide(el);
	};
	el.addEventListener("pointerenter", enter);
	el.addEventListener("pointerleave", leave);
	el.addEventListener("pointerdown", down);
	el.addEventListener("click", click);
	el.addEventListener("focus", focus);
	el.addEventListener("blur", leave);
	el.addEventListener("keydown", key);
	addEventListener("scroll", leave, { passive: true, capture: true });
	return {
		update: set,
		destroy() {
			hide(el);
			el.removeEventListener("pointerenter", enter);
			el.removeEventListener("pointerleave", leave);
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("click", click);
			el.removeEventListener("focus", focus);
			el.removeEventListener("blur", leave);
			el.removeEventListener("keydown", key);
			removeEventListener("scroll", leave, { capture: true });
		},
	};
};
