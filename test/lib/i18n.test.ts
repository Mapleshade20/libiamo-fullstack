import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the translation dictionary against the three kinds of rot that stay invisible at runtime.
 *
 * A key added to one language and forgotten in the others does not throw: `t` falls back to
 * English, so a learner in that language quietly reads the wrong one. A key that no component
 * calls anymore does not throw either — it just sits in the file, translated four times, next to
 * the copy that replaced it. And a key deleted while a caller still names it does not throw: `t`
 * hands that caller the raw key, which then reads as copy to anyone asserting on it.
 *
 * Keys the app assembles at runtime (`t(lang, \`hall.menu.status.${state}\`)`) never appear
 * verbatim, so the usage check also accepts a key whose shape matches a template the source
 * actually calls.
 */

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

/** Values are all single-line; two of them are written on the line below their key. */
function parseEntries(source: string): Map<string, string> {
	const entries = new Map<string, string>();
	const lines = source.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const inline = lines[index].match(/^\t"(?<key>[^"]+)":\s*"(?<value>.*)",?$/);
		if (inline?.groups) {
			entries.set(inline.groups.key, inline.groups.value);
			continue;
		}
		const wrapped = lines[index].match(/^\t"(?<key>[^"]+)":$/);
		if (!wrapped?.groups) continue;
		const value = lines[index + 1]?.trim() ?? "";
		const parsed = value.match(/^"(?<value>.*)",?$/);
		if (!parsed?.groups) throw new Error(`unparsed value for \`${wrapped.groups.key}\``);
		entries.set(wrapped.groups.key, parsed.groups.value);
		index++;
	}
	const keyLines = lines.filter((line) => /^\t"/.test(line)).length;
	if (keyLines !== entries.size) throw new Error(`parsed ${entries.size} of ${keyLines} dictionary entries`);
	return entries;
}

function placeholdersOf(value: string): string[] {
	return [...value.matchAll(/\{(?<name>[^{}]+)\}/g)].map((match) => match.groups?.name ?? "").sort();
}

const entriesByLanguage = Object.fromEntries(
	await Promise.all(LANGUAGES.map(async (language) => [language, parseEntries(await readFile(join(DICTIONARY_ROOT, `${language}.ts`), "utf8"))])),
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

	it("keeps no key that the app never asks for", async () => {
		const haystack = (await callerSources()).map(({ source }) => source).join("\n");
		// `t(lang, \`prefix${expression}suffix\`)` — a key of that shape is reachable without a literal.
		const shapes = [...haystack.matchAll(/\bt\(\s*[A-Za-z0-9_.]+\s*,\s*`(?<template>[^`]*)`/g)].map((match) => {
			const template = match.groups?.template ?? "";
			const opening = template.indexOf("${");
			const closing = template.lastIndexOf("}");
			if (opening === -1) return { prefix: template, suffix: "" };
			return { prefix: template.slice(0, opening), suffix: template.slice(closing + 1) };
		});

		const unused = [...entriesByLanguage.en.keys()].filter((key) => {
			if (haystack.includes(`"${key}"`) || haystack.includes(`'${key}'`) || haystack.includes(`\`${key}\``)) return false;
			return !shapes.some(({ prefix, suffix }) => key.startsWith(prefix) && key.endsWith(suffix));
		});
		expect(unused, `unused keys: ${unused.join(", ")}`).toEqual([]);
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
