import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";
import { LANGS } from "#lib/server/revision/draft.ts";

/*
 * The interface strings (src/lib/i18n/catalog): source.json is written by hand in en and zh-CN, ui.json is the i18n
 * script's translation of it into every app language. Callers are the app and the model layer whose notes reach the
 * learner.
 */
const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8")) as Record<string, Record<string, string>>;
const source = read("src/lib/i18n/catalog/source.json");
const ui = read("src/lib/i18n/catalog/ui.json");
const keys = Object.keys(source.en);

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		if (e.isDirectory()) return ["node_modules", ".svelte-kit"].includes(e.name) ? [] : files(p);
		return /\.(ts|svelte|js)$/.test(e.name) ? [p] : [];
	});
}
const load = (dirs: string[]) => dirs.flatMap((d) => files(join(root, d))).map((f) => ({ file: relative(root, f), text: readFileSync(f, "utf8") }));
const callers = load(["src"]);

/** `{name}` placeholders and the count of *starred* marks, which the screen draws by hand. */
const holes = (s: string) =>
	`${[...s.matchAll(/\{(\w+)\}/g)]
		.map((m) => m[1])
		.sort()
		.join(",")}|${(s.match(/\*/g) ?? []).length}`;

test("en and zh-CN are written for the same keys, none empty", () => {
	assert.deepEqual(Object.keys(source["zh-CN"]).sort(), [...keys].sort());
	const empty = Object.entries(source).flatMap(([l, d]) =>
		Object.entries(d)
			.filter(([, v]) => !v.trim())
			.map(([k]) => `${l}:${k}`),
	);
	assert.deepEqual(empty, []);
});

test("every app language has every key, translated from the current source (run pnpm i18n if not)", () => {
	assert.deepEqual(Object.keys(ui).sort(), [...LANGS].sort());
	const missing: string[] = [];
	const extra: string[] = [];
	const empty: string[] = [];
	for (const l of LANGS) {
		const d = ui[l] ?? {};
		for (const k of keys) {
			if (!(k in d)) missing.push(`${l}:${k}`);
			else if (!d[k].trim()) empty.push(`${l}:${k}`);
		}
		for (const k of Object.keys(d)) if (!(k in source.en)) extra.push(`${l}:${k}`);
	}
	assert.deepEqual({ missing, extra, empty }, { missing: [], extra: [], empty: [] });
	// The hand-written languages are copied as they are.
	assert.deepEqual(ui.en, source.en);
	assert.deepEqual(ui["zh-CN"], source["zh-CN"]);
});

test("every language keeps each key's placeholders and marks", () => {
	const off = LANGS.flatMap((l) => keys.filter((k) => ui[l]?.[k] !== undefined && holes(ui[l][k]) !== holes(source.en[k])).map((k) => `${l}:${k}`));
	assert.deepEqual(off, []);
});

test("every key a caller names literally is defined", () => {
	const missing: string[] = [];
	for (const { file, text } of callers) {
		// tx("key"), t(lang, "key"), this.t("key"), hasKey(lang, "key")
		for (const m of text.matchAll(/\b(?:tx|t|hasKey)\(\s*(?:[\w.]+\s*,\s*)?(["'])(?<key>[A-Za-z][\w]*)\1/g)) {
			const key = m.groups?.key ?? "";
			if (!(key in source.en)) missing.push(`${key} (${file})`);
		}
	}
	assert.deepEqual(missing, []);
});

test("every key is named somewhere", () => {
	const text = callers.map((c) => c.text).join("\n");
	// Keys appear as string literals (maps of states to keys included), or are built from a template's fixed part:
	// `gateTitle_${reason}`, `kind${Kind}`, `${chapter}Title`. Short fixed parts are not counted, they match anything.
	const literals = new Set([...text.matchAll(/["'`]([A-Za-z][\w]*)["'`]/g)].map((m) => m[1]));
	const built = [...text.matchAll(/`(\w*)\$\{[^`]*?\}(\w*)/g)].map((m) => [m[1], m[2]] as const).filter(([a, b]) => a.length + b.length >= 3);
	const named = (k: string) => literals.has(k) || built.some(([a, b]) => k.length > a.length + b.length && k.startsWith(a) && k.endsWith(b));
	assert.deepEqual(
		keys.filter((k) => !named(k)),
		[],
	);
});
