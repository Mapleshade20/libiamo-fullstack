// A headless Chrome driven over the DevTools protocol, for lab/patrol.mjs and lab/frames.mjs. Node's own WebSocket, no
// Playwright: CHROME names the browser, else Playwright's headless shell or Chrome is looked for where they install.
import { spawn } from "node:child_process";
import { existsSync, globSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = process.env.HOME ?? "";
function chromePath() {
	if (process.env.CHROME) return process.env.CHROME;
	const found = [
		...globSync(`${home}/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell`),
		...globSync(`${home}/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell`),
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
	].find((p) => existsSync(p));
	if (!found) throw new Error("No Chrome found: set CHROME to a Chrome or chrome-headless-shell binary.");
	return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A browser with one page; `await close()` ends the process and removes its profile. */
export async function browser({ width = 1280, height = 900 } = {}) {
	const profile = mkdtempSync(join(tmpdir(), "libiamo-cdp-"));
	const port = 9400 + Math.floor(Math.random() * 500);
	const proc = spawn(
		chromePath(),
		["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, "about:blank"],
		{
			stdio: "ignore",
		},
	);
	let ws;
	for (let i = 0; i < 75 && !ws; i++) {
		await sleep(200);
		try {
			const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
			if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
		} catch {}
	}
	if (!ws) throw new Error("Chrome did not start.");
	await new Promise((r) => ws.addEventListener("open", r));
	let n = 0;
	const waiting = new Map();
	const listeners = new Set();
	ws.addEventListener("message", (m) => {
		const d = JSON.parse(m.data);
		if (d.id && waiting.has(d.id)) {
			waiting.get(d.id)(d.result ?? d.error);
			waiting.delete(d.id);
		} else if (d.method) for (const l of listeners) l(d.method, d.params);
	});
	const send = (method, params = {}) =>
		new Promise((r) => {
			const id = ++n;
			waiting.set(id, r);
			ws.send(JSON.stringify({ id, method, params }));
		});
	return {
		send,
		/** Every protocol event, as (method, params). */
		on: (l) => listeners.add(l),
		/** The page's value of an expression (awaited when it is a promise). */
		evaluate: async (expression) => {
			const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
			if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
			return r.result?.value;
		},
		/** Signs the browser in: a `name=value` cookie (lab/account.mjs prints one) for the origin. */
		cookie: async (origin, cookie) => {
			const name = cookie.split("=")[0];
			await send("Network.setCookie", { name, value: cookie.slice(name.length + 1), url: origin });
		},
		/** Ends Chrome, then removes its profile (it writes there until it has exited). */
		close: async () => {
			ws.close();
			const exited = new Promise((r) => proc.once("exit", r));
			proc.kill();
			await exited;
			rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		},
	};
}

export { sleep };
