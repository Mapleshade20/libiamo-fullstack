// Records what a flow shows, frame by frame: every frame the page paints (JPEG, numbered by milliseconds since the
// start) and each address it passed through, in order. For checking that a flow never shows a page it should not (a
// sign-in that flashes the confirmation page, a sign-out that passes through home) and for judging motion: --rate
// slows CSS and Web animations down.
//
//   COOKIE="$(cat /tmp/cookie)" node lab/frames.mjs http://127.0.0.1:5180 /settings \
//     --do "document.querySelector('[data-sign-out]').click()" --seconds 5 --out /tmp/frames
//
// --do runs in the page once it has loaded (an expression; a promise is awaited). The frames go to --out (a new
// directory under the system's temporary one by default); the addresses are printed with the time each was reached.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { browser, sleep } from "./cdp.mjs";

const { values: o, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		do: { type: "string" },
		seconds: { type: "string", default: "5" },
		settle: { type: "string", default: "3" },
		rate: { type: "string", default: "1" },
		out: { type: "string" },
	},
});
const [origin, path = "/"] = positionals;
if (!origin) {
	console.error('usage: [COOKIE=...] node lab/frames.mjs <origin> [path] [--do "<js>"] [--seconds 5] [--settle 3] [--rate 1] [--out dir]');
	process.exit(2);
}
const out = o.out ?? mkdtempSync(join(tmpdir(), "libiamo-frames-"));
mkdirSync(out, { recursive: true });

const b = await browser();
for (const domain of ["Page", "Runtime", "Animation"]) await b.send(`${domain}.enable`);
if (process.env.COOKIE) await b.cookie(origin, process.env.COOKIE);
await b.send("Animation.setPlaybackRate", { playbackRate: Number(o.rate) });

let t0 = Date.now();
const passed = [];
const reached = (url) => {
	if (passed.at(-1)?.url !== url) passed.push({ ms: Date.now() - t0, url });
};
let frames = 0;
b.on((method, p) => {
	if (method === "Page.frameNavigated" && !p.frame.parentId) reached(p.frame.url);
	if (method === "Page.navigatedWithinDocument") reached(p.url);
	if (method === "Page.screencastFrame") {
		void b.send("Page.screencastFrameAck", { sessionId: p.sessionId });
		writeFileSync(join(out, `${String(Date.now() - t0).padStart(6, "0")}.jpg`), Buffer.from(p.data, "base64"));
		frames++;
	}
});

await b.send("Page.navigate", { url: new URL(path, origin).href });
await sleep(Number(o.settle) * 1000);
// Recording starts once the page has settled, so what follows is the flow alone.
t0 = Date.now();
passed.length = 0;
reached(await b.evaluate("location.href"));
await b.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });
if (o.do) console.log("do:", JSON.stringify(await b.evaluate(o.do)) ?? "undefined");
await sleep(Number(o.seconds) * 1000);
await b.send("Page.stopScreencast");
await b.close();

for (const s of passed) console.log(`${String(s.ms).padStart(6)} ms  ${s.url}`);
console.log(`${frames} frames in ${out}`);
