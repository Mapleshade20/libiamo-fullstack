// The works translation scenarios come from, as far as naming goes: where their names are written down (names.ts). A scenario
// outside any work (a café's menu) has no entry; its names are looked up in Wikidata and Wikipedia only.
import type { Work } from "#lib/server/translation/names.ts";

export const WORKS: Record<string, Work> = {
	warriors: {
		id: "warriors",
		title: "Warriors (Erin Hunter's cat novels)",
		wikidata: "Q739702",
		wikis: [
			{ api: "https://warriors.fandom.com/api.php", lang: "en" },
			{ api: "https://warriors.fandom.com/zh/api.php", lang: "zh-CN" },
		],
		// The Chinese fans' own wiki has the names the fandom wiki lacks (羽尾, 鸦羽), but it sits behind a bot check.
		manual: [{ lang: "zh-CN", name: "灰机猫武士维基", search: "https://warriors.huijiwiki.com/index.php?search={q}" }],
	},
};
