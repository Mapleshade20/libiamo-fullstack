import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/*
 * The interface strings, one module per language: `virtual:i18n` exports a loader for each language the catalog has,
 * `virtual:i18n/<lang>` that language's strings (catalog/ui.json, the hand-written en and zh-CN of catalog/source.json
 * winning, so a string added there shows at once). Built, each is its own chunk under `_app/immutable` with a hashed
 * name: the browser downloads a language once and keeps it, and a page carries no strings of its own.
 */
const ID = "virtual:i18n";
const CATALOG = fileURLToPath(new URL("../src/lib/i18n/catalog/", import.meta.url));
const read = (f: string): Record<string, Record<string, string>> => JSON.parse(readFileSync(f, "utf8"));

export function i18nStrings(catalog = CATALOG): Plugin {
	const FILES = ["ui.json", "source.json"].map((f) => join(catalog, f));
	return {
		name: "libiamo-i18n",
		resolveId: (id) => (id === ID || id.startsWith(`${ID}/`) ? `\0${id}` : undefined),
		load(id) {
			if (!id.startsWith(`\0${ID}`)) return;
			for (const f of FILES) this.addWatchFile(f);
			const [ui, source] = FILES.map(read);
			if (id === `\0${ID}`)
				return `export const loaders = {\n${Object.keys(ui)
					.map((l) => `\t${JSON.stringify(l)}: () => import(${JSON.stringify(`${ID}/${l}`)}),`)
					.join("\n")}\n};\n`;
			const lang = id.slice(`\0${ID}/`.length);
			return `export default ${JSON.stringify({ ...(ui[lang] ?? ui.en), ...(source[lang] ?? {}) })};\n`;
		},
		// A string changed in development: the strings already handed to the page are stale, so it loads again.
		hotUpdate({ file }) {
			if (!FILES.includes(file)) return;
			const graph = this.environment.moduleGraph;
			for (const m of graph.idToModuleMap.values()) if (m.id?.startsWith(`\0${ID}`)) graph.invalidateModule(m);
			if (this.environment.name === "client") this.environment.hot.send({ type: "full-reload" });
			return [];
		},
	};
}
