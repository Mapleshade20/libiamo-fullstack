import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the sub-path deployment contract.
 *
 * `kit.paths.base` is compiled in from the BASE_PATH build arg, so every internal
 * URL has to be built from `base` ("$app/paths"). A bare absolute "/..." works
 * fine at the domain root and then 404s the moment the app is served from a
 * sub-path — which no local run or unit test would catch.
 *
 * Escape hatch: append `base-path-ignore` in a comment on the offending line.
 *
 * biome.json disables noTemplateCurlyInString for this file: the hints and
 * fixtures below contain literal "${base}" text on purpose.
 */

const sourceRoot = resolve("src");
const IGNORE_MARKER = "base-path-ignore";

interface Rule {
	name: string;
	/** Must capture the offending snippet in group 0. */
	pattern: RegExp;
	appliesTo: (file: string) => boolean;
	hint: string;
}

const isSvelte = (file: string) => file.endsWith(".svelte");
const isScript = (file: string) => file.endsWith(".ts");
const isAny = () => true;

const RULES: Rule[] = [
	{
		name: "href",
		// href="/x" but not href="{base}/x". Also catches href="/".
		pattern: /\bhref="\/(?!\/)/g,
		appliesTo: isSvelte,
		hint: 'use href="{base}/..."',
	},
	{
		name: "href template",
		// href={`/x`} but not href={`${base}/x`}
		pattern: /\bhref=\{`\/(?!\/)/g,
		appliesTo: isSvelte,
		hint: "use href={`${base}/...`}",
	},
	{
		name: "form action",
		pattern: /\baction="\/(?!\/)/g,
		appliesTo: isSvelte,
		hint: 'use action="{base}/..."',
	},
	{
		name: "asset src",
		pattern: /\bsrc="\/(?!\/)/g,
		appliesTo: isSvelte,
		hint: 'use src="{base}/..." for app-served files',
	},
	{
		name: "fetch",
		pattern: /\bfetch\(\s*[`"]\/(?!\/)/g,
		appliesTo: isAny,
		hint: "use fetch(`${base}/...`)",
	},
	{
		name: "goto",
		pattern: /\bgoto\(\s*[`"]\/(?!\/)/g,
		appliesTo: isAny,
		hint: "use goto(`${base}/...`)",
	},
	{
		name: "redirect",
		pattern: /\bredirect\(\s*\d+\s*,\s*[`"]\/(?!\/)/g,
		appliesTo: isScript,
		hint: "use redirect(status, `${base}/...`)",
	},
];

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

function findViolations(relativePath: string, source: string): string[] {
	const violations: string[] = [];

	source.split("\n").forEach((line, index) => {
		if (line.includes(IGNORE_MARKER)) return;

		for (const rule of RULES) {
			if (!rule.appliesTo(relativePath)) continue;
			// Regexes are global; reset between lines.
			rule.pattern.lastIndex = 0;
			if (rule.pattern.test(line)) {
				violations.push(`${relativePath}:${index + 1} [${rule.name}] ${line.trim()}\n      -> ${rule.hint}`);
			}
		}
	});

	return violations;
}

describe("base path discipline", () => {
	it("routes every internal URL through `base` from $app/paths", async () => {
		const files = await findSourceFiles(sourceRoot);
		const violations: string[] = [];

		for (const file of files) {
			const source = await readFile(file, "utf8");
			violations.push(...findViolations(relative(sourceRoot, file), source));
		}

		expect(violations, `Absolute internal URLs bypass \`base\` and break sub-path deploys (BASE_PATH).\n\n${violations.join("\n")}\n`).toEqual([]);
	});

	// A missing `import { base }` is already a svelte-check / tsc error
	// ("Cannot find name 'base'"), so there is no test for it here — and `base` is
	// also used as an ordinary local variable in places, which makes it
	// undetectable by text matching anyway.

	describe("detector", () => {
		// The guard is only worth having if it actually fires, so pin its behaviour.
		it.each([
			['<a href="/review">x</a>', "svelte", true],
			['<a href="/">x</a>', "svelte", true],
			["<a href={`/task/${id}`}>x</a>", "svelte", true],
			['<form action="/?/switchLanguage">', "svelte", true],
			['await fetch("/api/unread")', "svelte", true],
			["await fetch(`/api/review/${id}/rate`)", "svelte", true],
			['redirect(302, "/sign-in")', "ts", true],
			["redirect(303, `/translate/${id}`)", "ts", true],
		])("flags %j", (line, kind, expected) => {
			const file = kind === "svelte" ? "routes/x/+page.svelte" : "routes/x/+page.server.ts";
			expect(findViolations(file, line).length > 0).toBe(expected);
		});

		it.each([
			['<a href="{base}/review">x</a>', "svelte"],
			["<a href={`${base}/task/${id}`}>x</a>", "svelte"],
			['<a href="https://example.com">x</a>', "svelte"],
			['<a href="#section">x</a>', "svelte"],
			['<a href="mailto:a@b.c">x</a>', "svelte"],
			// Protocol-relative URLs are external, not internal routes.
			['<a href="//cdn.example.com/x.js">x</a>', "svelte"],
			["await fetch(`${base}/api/unread`)", "svelte"],
			['await fetch("https://api.example.com/v1")', "svelte"],
			["redirect(302, `${base}/sign-in`)", "ts"],
			['redirect(302, "https://example.com")', "ts"],
			// Cookie paths are not navigation targets.
			['defaultCookieAttributes: { path: "/" }', "ts"],
		])("allows %j", (line, kind) => {
			const file = kind === "svelte" ? "routes/x/+page.svelte" : "routes/x/+page.server.ts";
			expect(findViolations(file, line)).toEqual([]);
		});

		it("respects the ignore marker", () => {
			const line = '<a href="/health">x</a> <!-- base-path-ignore -->';
			expect(findViolations("routes/x/+page.svelte", line)).toEqual([]);
		});
	});
});
