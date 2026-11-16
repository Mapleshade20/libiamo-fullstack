/*
 * Downloads the backdrop pictures (src/lib/server/backdrop/pictures.ts) from Wikimedia Commons into
 * src/lib/assets/backdrops: each as WebP 1600 and 800 pixels wide (slightly blurred, quality 50), and meta.json (size, colour, page, licence).
 * Only what is missing is fetched; pictures no longer listed are removed. Refuses anything not public domain or CC0.
 * ImageMagick (`magick`) is an authoring tool only; the outputs are checked in, the originals never.
 *
 *   node --experimental-transform-types scripts/backdrops.ts [--force]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAINTINGS, PRINTS } from "../src/lib/server/backdrop/pictures.ts";

type Meta = { width: number; height: number; color: string; page: string; licence: string };

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = join(root, "src/lib/assets/backdrops");
const metaPath = join(dir, "meta.json");
const WIDTHS = [1600, 800] as const;
const QUALITY = 50;
/** The blur's radius at 1600 pixels wide, less in proportion for smaller files. */
const BLUR = 0.7;
const USER_AGENT = "LibiamoBackdrops/1.0 (https://libiamo.net)";
const force = process.argv.includes("--force");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
		if (res.ok) return res;
		if ((res.status === 429 || res.status >= 500) && attempt < 4) {
			await sleep(2000 * 2 ** attempt);
			continue;
		}
		throw new Error(`${res.status} ${res.statusText}: ${url}`);
	}
}

const strip = (html = "") => html.replace(/<[^>]*>/g, "").trim();
/** Public domain or CC0, as Commons names them ("Public domain", "PD-old-100", "CC0", …). */
const free = (licence: string) => /^(public domain|pd\b|pd-|cc0)/i.test(licence);

async function fetchOne(file: string, id: string, scratch: string): Promise<Meta> {
	const api = new URL("https://commons.wikimedia.org/w/api.php");
	api.search = new URLSearchParams({
		action: "query",
		format: "json",
		formatversion: "2",
		prop: "imageinfo",
		iiprop: "url|size|extmetadata",
		iiurlwidth: "1920",
		titles: `File:${file}`,
	}).toString();
	const info = (await (await get(api.href)).json()).query?.pages?.[0]?.imageinfo?.[0];
	if (!info) throw new Error(`not on Commons: ${file}`);
	const licence = strip(info.extmetadata?.LicenseShortName?.value) || strip(info.extmetadata?.License?.value);
	if (!free(licence)) throw new Error(`not public domain or CC0 (${licence || "no licence"}): ${file}`);
	await sleep(1000);
	const original = join(scratch, id);
	writeFileSync(original, Buffer.from(await (await get(info.thumburl ?? info.url)).arrayBuffer()));
	for (const w of WIDTHS) {
		// A slight blur first takes out the canvas grain and the scan's noise, which cost the most bytes and show the
		// least (the pictures are shown faint; seen whole, 1600 pixels are already enlarged on a wide screen).
		const blur = `0x${(BLUR * w) / 1600}`;
		execFileSync("magick", [
			original,
			"-resize",
			`${w}x>`,
			"-blur",
			blur,
			"-strip",
			"-quality",
			String(QUALITY),
			"-define",
			"webp:method=6",
			join(dir, `${id}-${w}.webp`),
		]);
	}
	const [width, height] = execFileSync("magick", ["identify", "-format", "%w %h", join(dir, `${id}-1600.webp`)], { encoding: "utf8" })
		.split(" ")
		.map(Number);
	const color = `#${execFileSync("magick", [original, "-resize", "1x1!", "-format", "%[hex:p{0,0}]", "info:"], { encoding: "utf8" }).slice(0, 6).toLowerCase()}`;
	return { width, height, color, page: info.descriptionurl, licence };
}

mkdirSync(dir, { recursive: true });
const old: Record<string, Meta> = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
const listed = [...PRINTS, ...PAINTINGS];
const meta: Record<string, Meta> = {};
const scratch = mkdtempSync(join(tmpdir(), "libiamo-backdrops-"));
const failed: string[] = [];
try {
	for (const { id, file } of listed) {
		const have = old[id] && WIDTHS.every((w) => existsSync(join(dir, `${id}-${w}.webp`)));
		if (have && !force) {
			meta[id] = old[id];
			continue;
		}
		try {
			meta[id] = await fetchOne(file, id, scratch);
			console.log(`ok   ${id} (${meta[id].licence})`);
		} catch (e) {
			failed.push(id);
			if (have) meta[id] = old[id];
			console.error(`fail ${id}: ${(e as Error).message}`);
		}
		await sleep(1000);
	}
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
// What is no longer listed goes.
const keep = new Set(Object.keys(meta).flatMap((id) => WIDTHS.map((w) => `${id}-${w}.webp`)));
for (const f of readdirSync(dir)) if (f.endsWith(".webp") && !keep.has(f)) rmSync(join(dir, f));
const sorted = Object.fromEntries(Object.entries(meta).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(metaPath, `${JSON.stringify(sorted, null, "\t")}\n`);
if (failed.length) {
	console.error(`${failed.length} failed: ${failed.join(", ")}`);
	process.exitCode = 1;
}
