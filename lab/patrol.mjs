// Opens pages one after another and reports what went wrong on each: a Content-Security-Policy violation or a request
// it blocked, an error in the console, an uncaught exception, a page that did not answer 2xx. Run before a release
// against the production build (`pnpm build`, `node build`), signed in or not:
//
//   COOKIE="$(cat /tmp/cookie)" node lab/patrol.mjs http://127.0.0.1:5180 [path...]
//
// Without paths it visits the pages that need no id (the documents and the way in when signed out; the app's pages
// when COOKIE is set); pass the pages with ids (a piece, a note, a reading, a scenario) as paths. Gravatar's 404 is how
// it says a learner has no picture, so it is not reported. Exits 1 when any page had a problem.
import { browser, sleep } from "./cdp.mjs";

const [origin, ...given] = process.argv.slice(2);
if (!origin) {
	console.error("usage: [COOKIE=...] node lab/patrol.mjs <origin> [path...]");
	process.exit(2);
}
const cookie = process.env.COOKIE;
const PUBLIC = ["/about", "/privacy", "/terms", "/changelog", "/sign-in", "/sign-up", "/forgot-password", "/verify"];
const APP = ["/", "/library", "/notebook", "/review", "/writing", "/profile", "/settings", "/contribute", "/feedback", "/welcome"];
const paths = given.length ? given : cookie ? APP : PUBLIC;
const WAIT_MS = Number(process.env.WAIT_MS ?? 4500);

const b = await browser();
let found = [];
let status = null;
const noise = (url = "") => /gravatar\.com\/avatar\/.*d=404/.test(url);
b.on((method, p) => {
	if (method === "Runtime.consoleAPICalled" && p.type === "error")
		found.push(
			`console: ${p.args
				.map((a) => a.value ?? a.description)
				.join(" ")
				.slice(0, 300)}`,
		);
	if (method === "Runtime.exceptionThrown")
		found.push(`exception: ${(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).slice(0, 300)}`);
	if (method === "Log.entryAdded" && p.entry.level === "error" && !noise(p.entry.url))
		found.push(`${p.entry.source}: ${p.entry.text.slice(0, 200)} ${p.entry.url ?? ""}`);
	if (method === "Network.loadingFailed" && p.blockedReason) found.push(`blocked (${p.blockedReason}): ${p.type}`);
	if (method === "Network.responseReceived" && p.type === "Document" && p.response.url.startsWith(origin)) status = p.response.status;
});
for (const domain of ["Network", "Runtime", "Log", "Page"]) await b.send(`${domain}.enable`);
// Violations as the page sees them, with the directive and what was refused.
await b.send("Page.addScriptToEvaluateOnNewDocument", {
	source:
		"window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.effectiveDirective+' refused '+(e.blockedURI||'inline')+' at '+(e.sourceFile||'')+':'+e.lineNumber))",
});
if (cookie) await b.cookie(origin, cookie);

let bad = 0;
for (const path of paths) {
	found = [];
	status = null;
	await b.send("Page.navigate", { url: new URL(path, origin).href });
	await sleep(WAIT_MS);
	const { csp, at } = await b.evaluate("({ csp: window.__csp ?? [], at: location.pathname + location.search })");
	for (const c of csp) found.push(`CSP: ${c}`);
	if (status !== null && (status < 200 || status >= 300)) found.unshift(`status ${status}`);
	if (found.length) bad++;
	console.log(`${found.length ? "✗" : "✓"} ${path}${at !== path ? ` → ${at}` : ""}`);
	for (const f of found) console.log(`    ${f}`);
}
console.log(`${paths.length} pages, ${bad} with problems`);
await b.close();
process.exit(bad ? 1 : 0);
