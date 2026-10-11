import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "$lib/i18n/en";
import { es } from "$lib/i18n/es";
import { fr } from "$lib/i18n/fr";
import { ja } from "$lib/i18n/ja";

const SOURCE_ROOT = resolve("src");
const TEST_ROOT = resolve("test");
const DICTIONARY_ROOT = join(SOURCE_ROOT, "lib/i18n");
const LANGUAGES = ["en", "es", "fr", "ja"] as const;

async function findSourceFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const path = resolve(directory, entry.name);
			if (entry.isDirectory()) return findSourceFiles(path);
			return entry.name.endsWith(".svelte") || entry.name.endsWith(".ts") ? [path] : [];
		}),
	);
	return files.flat();
}

/** Every file whose `t(...)` calls the dictionary serves: the app, and the tests that assert on it. */
async function callerSources(): Promise<{ file: string; source: string }[]> {
	const files = [...(await findSourceFiles(SOURCE_ROOT)), ...(await findSourceFiles(TEST_ROOT))].filter(
		(file) => !file.startsWith(`${DICTIONARY_ROOT}/`),
	);
	return Promise.all(files.map(async (file) => ({ file, source: await readFile(file, "utf8") })));
}

function placeholdersOf(value: string): string[] {
	return [...value.matchAll(/\{(?<name>[^{}]+)\}/g)].map((match) => match.groups?.name ?? "").sort();
}

const entriesByLanguage = Object.fromEntries(
	Object.entries({ en, es, fr, ja }).map(([language, dictionary]) => [language, new Map(Object.entries(dictionary))]),
) as Record<(typeof LANGUAGES)[number], Map<string, string>>;

describe("translation dictionary", () => {
	it("defines every key in every language, with no empty value", () => {
		const english = entriesByLanguage.en;
		expect(english.size).toBeGreaterThan(0);
		const missing: string[] = [];
		const empty: string[] = [];
		for (const language of LANGUAGES) {
			for (const key of english.keys()) {
				const value = entriesByLanguage[language].get(key);
				if (value === undefined) missing.push(`${language}:${key}`);
				else if (value.trim() === "") empty.push(`${language}:${key}`);
			}
			for (const key of entriesByLanguage[language].keys()) {
				if (!english.has(key)) missing.push(`${language}:${key} (not in en)`);
			}
		}
		expect({ missing, empty }).toEqual({ missing: [], empty: [] });
	});

	it("carries each key's placeholders into every language", () => {
		const mismatched: string[] = [];
		for (const [key, english] of entriesByLanguage.en) {
			const expected = placeholdersOf(english);
			for (const language of LANGUAGES) {
				const actual = placeholdersOf(entriesByLanguage[language].get(key) ?? "");
				if (actual.join() !== expected.join()) mismatched.push(`${language}:${key} expected {${expected}} got {${actual}}`);
			}
		}
		expect(mismatched).toEqual([]);
	});

	it("defines every key a caller names, so none falls back to its own name", async () => {
		const missing: string[] = [];
		for (const { file, source } of await callerSources()) {
			for (const match of source.matchAll(/\bt\(\s*[A-Za-z0-9_.]+\s*,\s*(["'])(?<key>[A-Za-z0-9_.]+)\1/g)) {
				const key = match.groups?.key ?? "";
				if (!entriesByLanguage.en.has(key)) missing.push(`${key} (${relative(process.cwd(), file)})`);
			}
		}
		expect(missing, `keys that would render as their own name: ${missing.join(", ")}`).toEqual([]);
	});
});
