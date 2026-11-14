// @ts-nocheck: a straight port from the old plain-HTML demo (debug tooling, DOM-built on purpose so it stays out of the app's components).
/* Debug only, not part of the product: the model calls behind a page, as bubbles in the bottom-left corner, newest at
   the bottom, at most eight. A bubble opens its call (purpose, model, timing, tokens, prompt and reply). Every page that
   makes model calls shows them: the session page, the home page's gate, collecting. The server traces each call under
   a trace id (src/trace.ts) and streams them on /api/s/<id>/calls; a page that is not a session makes up its own id
   and sends it as `x-trace` with its requests (`traced`). Hidden with html.no-calls. */
export const CALLS = (() => {
	const SHOWN = 8;
	const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
	const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
	const seen = new Map();
	let source = null;
	let open = null;
	const box = () => {
		let el = document.getElementById("calls");
		if (!el) {
			el = Object.assign(document.createElement("div"), { id: "calls", className: "calls" });
			el.setAttribute("aria-label", "LLM calls (debug)");
			document.body.append(el);
		}
		return el;
	};
	const short = (c) => `${c.purpose.split(" · ")[0]} · ${c.tag.split("/").slice(-1)[0]}`;
	function time(c) {
		if (c.state === "cached") return "cache";
		if (c.state === "queued") return "wait";
		const ms = c.state === "running" ? Date.now() - c.t0 : (c.ms ?? 0);
		return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
	}
	function render() {
		const host = box();
		const shown = [...seen.values()].sort((a, b) => a.id - b.id).slice(-SHOWN);
		const keep = new Set(shown.map((c) => String(c.id)));
		for (const el of [...host.children]) {
			if (keep.has(el.dataset.id) || el.classList.contains("leaving")) continue;
			el.classList.add("leaving");
			setTimeout(() => el.remove(), reduced() ? 0 : 200);
		}
		for (const c of shown) {
			let el = host.querySelector(`[data-id="${c.id}"]`);
			if (!el) {
				el = document.createElement("button");
				el.type = "button";
				el.className = "call";
				el.dataset.id = c.id;
				el.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="lbl"></span><span class="ms"></span>';
				el.addEventListener("click", () => toggle(c.id));
				host.appendChild(el);
			}
			el.dataset.state = c.state;
			el.querySelector(".lbl").textContent = short(c);
			el.querySelector(".ms").textContent = time(c);
			el.title = `${c.state}: ${c.purpose}`;
			el.setAttribute("aria-expanded", String(open?.id === c.id));
		}
		if (open) fill();
	}
	// The panel is built once; updates change only the fields, so an open prompt or reply keeps its scroll.
	function fill() {
		const c = seen.get(open.id);
		const el = open.el;
		if (!el.firstChild) {
			el.innerHTML =
				'<button type="button" class="x" aria-label="Close">×</button><h3></h3><dl></dl><details><summary>prompt</summary><pre class="in"></pre></details><details class="out" open hidden><summary>reply</summary><pre></pre></details>';
			el.querySelector(".x").onclick = close;
			el.querySelector("pre.in").textContent = c.input;
		}
		const t = c.tokens;
		const cache = t && (t.cacheRead || t.cacheWrite) ? ` (cache read ${t.cacheRead ?? 0} · write ${t.cacheWrite ?? 0})` : t ? " (no cache)" : "";
		const rows = [
			["state", `${c.state}${c.bg ? " (prefetch, background lane)" : ""}`],
			["model", c.model],
			["tag", c.tag],
			["time", time(c)],
			...(t ? [["tokens", `in ${t.input}${cache} · out ${t.output} (reasoning ${t.reasoning})`]] : []),
			...(c.cost ? [["cost", `$${c.cost.toFixed(5)}`]] : []),
			...(c.error ? [["error", c.error]] : []),
		];
		el.querySelector("h3").textContent = c.purpose;
		el.querySelector("dl").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
		const out = el.querySelector("details.out");
		if (c.output && out.hidden) {
			out.querySelector("pre").textContent = c.output;
			out.hidden = false;
		}
		el.style.bottom = `${innerHeight - box().getBoundingClientRect().top + 8}px`;
	}
	function toggle(id) {
		if (open?.id === id) return close();
		close();
		const el = document.createElement("div");
		el.className = "call-detail";
		el.setAttribute("role", "dialog");
		el.setAttribute("aria-label", "LLM call");
		document.body.appendChild(el);
		open = { id, el };
		render();
	}
	function close() {
		open?.el.remove();
		open = null;
		render();
	}
	/** Follows the calls of a trace id (a session, or a page's own id). `keep` leaves the bubbles already shown. */
	function watch(id, { keep = false } = {}) {
		source?.close();
		source = null;
		if (!keep) {
			seen.clear();
			close();
		}
		// The tour's sessions are taped: their ids are a recording's, whose calls are not this page's to show.
		if (document.documentElement.classList.contains("touring")) return render();
		source = new EventSource(`/api/s/${encodeURIComponent(id)}/calls`);
		source.onmessage = (e) => {
			const c = JSON.parse(e.data);
			seen.set(c.id, c);
			render();
		};
	}
	// The page's own trace id, for requests that are not part of a session.
	const page = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	/** fetch, with the page's trace id (watched from the first call on). */
	function traced(url, init = {}) {
		if (!source) watch(page, { keep: true });
		return fetch(url, { ...init, headers: { ...(init.headers ?? {}), "x-trace": page } });
	}
	setInterval(() => {
		if ([...seen.values()].some((c) => c.state === "running")) render();
	}, 500);
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && open) close();
	});
	/** Forgets every bubble and stops following (the tour, as it ends). */
	function reset() {
		source?.close();
		source = null;
		seen.clear();
		close();
		render();
	}
	return { watch, traced, close, reset };
})();
