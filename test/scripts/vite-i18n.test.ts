import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { i18nStrings } from "../../scripts/vite-i18n.ts";

// A catalog of its own: the translated strings, and the hand-written ones that differ from them.
const dir = mkdtempSync(join(tmpdir(), "libiamo-i18n-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(
	join(dir, "ui.json"),
	JSON.stringify({ en: { hi: "Hi", bye: "Bye" }, "zh-CN": { hi: "嗨（机翻）", bye: "再见" }, es: { hi: "Hola", bye: "Adiós" } }),
);
writeFileSync(join(dir, "source.json"), JSON.stringify({ en: { hi: "Hi" }, "zh-CN": { hi: "你好", fresh: "新加的" } }));

const plugin = i18nStrings(dir);
const call = <T>(hook: unknown, ...args: unknown[]): T => (hook as (...a: unknown[]) => T).call({ addWatchFile() {} }, ...args);
const strings = (lang: string): Record<string, string> => {
	const code = call<string>(plugin.load, call<string>(plugin.resolveId, `virtual:i18n/${lang}`));
	return JSON.parse(code.replace(/^export default /, "").replace(/;\s*$/, ""));
};

it("has a loader for every language the catalog has, each its own module", () => {
	const index = call<string>(plugin.load, call<string>(plugin.resolveId, "virtual:i18n"));
	expect(index.match(/import\("virtual:i18n\/[^"]+"\)/g)).toEqual(["en", "zh-CN", "es"].map((l) => `import("virtual:i18n/${l}")`));
});

it("gives a language its translated strings, the hand-written ones winning and showing before they are translated", () => {
	expect(strings("zh-CN")).toEqual({ hi: "你好", bye: "再见", fresh: "新加的" });
	expect(strings("es")).toEqual({ hi: "Hola", bye: "Adiós" });
	// A language the catalog does not have speaks English.
	expect(strings("xx")).toEqual({ hi: "Hi", bye: "Bye" });
});
