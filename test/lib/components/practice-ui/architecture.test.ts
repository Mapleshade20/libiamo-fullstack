import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const root = resolve("src/lib/components/practice-ui");
const surfaces = ["discord", "imessage", "reddit", "ao3", "mail"];

function sources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? sources(path) : /\.(ts|svelte)$/.test(path) ? [path] : [];
	});
}
it("keeps shared lifecycle modules independent of surface implementations", () => {
	for (const path of sources(root).filter((path) => !surfaces.some((surface) => path.startsWith(`${resolve(root, surface)}/`)))) {
		const source = readFileSync(path, "utf8");
		for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
			expect(match[1], path).not.toMatch(/(?:^|\/)(discord|imessage|reddit|ao3|mail)(?:\/|$)/);
		}
	}
});

it("leaves session actions and polling with the runtime, and hints with the controller", () => {
	for (const surface of surfaces)
		for (const path of sources(resolve(root, surface))) {
			const source = readFileSync(path, "utf8");
			expect(source, path).not.toMatch(/requestLifecycle|\b(?:postAction|completeAction|submitPracticeMessage|requestHint|setInterval)\s*\(/);
			expect(source, path).not.toMatch(/window\.location|from\s+["']\$app\/navigation["']/);
		}
});
