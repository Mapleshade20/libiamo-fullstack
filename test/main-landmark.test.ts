import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve("src");
const mainOwners = new Map([
	["routes/(admin)/+layout.svelte", 1],
	["routes/(app)/+layout.svelte", 2],
]);

async function findSvelteFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const path = resolve(directory, entry.name);
			if (entry.isDirectory()) return findSvelteFiles(path);
			return entry.name.endsWith(".svelte") ? [path] : [];
		}),
	);
	return files.flat();
}

describe("main landmark ownership", () => {
	it("only lets route layouts render main landmarks", async () => {
		const actualOwners = new Map<string, number>();

		for (const file of await findSvelteFiles(sourceRoot)) {
			const source = await readFile(file, "utf8");
			const count = source.match(/<main(?:\s|>)/g)?.length ?? 0;
			if (count > 0) actualOwners.set(relative(sourceRoot, file), count);
		}

		expect(actualOwners).toEqual(mainOwners);
	});
});
