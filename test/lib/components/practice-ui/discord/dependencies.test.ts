import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps the seeded participant implementation exclusively inside Discord", () => {
	const root = resolve("src/lib/components/practice-ui");
	function scan(directory: string) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.name === "discord") continue;
			const path = resolve(directory, entry.name);
			if (entry.isDirectory()) scan(path);
			else if (/\.(ts|svelte)$/.test(path)) {
				const source = readFileSync(path, "utf8");
				expect(source, path).not.toMatch(/participantPool|participantData|initUserPool|from\s+["'][^"']*discord\//);
			}
		}
	}
	scan(root);
});
