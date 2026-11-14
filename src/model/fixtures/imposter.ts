import type { Fixture } from "./types.ts";

// Real comment/post from the hand-made organisation demo (index.html), doc "imposter".
export const imposter: Fixture = {
	draft: {
		id: "imposter",
		title: "Imposter",
		text: "This is SO cool and well-written!! After seeking revenge on Appledusk’s bloodline our DF queen Mapleshade finally turned to the descendants of Oakstar (who had banished her) and pulled some clever tricks this time. ;) Tho I love BramblexSquilf sooo much and surely some cat would come to his rescue before all his lives are gone?\n\nThe Warriorstober prompts are really inspiring and a lot of them have the potential to develop into amazing long fics! Your great writing even makes me wanna try one myself but I’ve never written fics before lol",
		background: "AO3 上 Warriorstober 系列《Imposter》一章下面的评论，写给作者。",
		target: "en",
		learner: "zh-CN",
		level: "B2",
		scene: {
			platform: "AO3, a comment on a fanfic chapter",
			audience: "the fic's author (and other readers)",
			purpose: "praise the chapter, share thoughts on the characters, and encourage the author's series",
		},
	},
	gold: [
		{
			id: "I1",
			at: "Tho I love BramblexSquilf sooo much and surely some cat would come to his rescue before all his lives are gone?",
			route: "p2",
			why: "'Tho' promises a contrast whose other half never arrives, and the 'and' is really a 'so' (because I love the pair, I hope he is rescued).",
		},
	],
	spots: [
		{
			id: "I1",
			at: "Tho I love BramblexSquilf sooo much and surely some cat would come to his rescue before all his lives are gone?",
			type: "句间逻辑",
			mode: "one",
			readings: ["我太爱这对了，所以真心希望在他九条命用完之前，会有猫来救他！", "虽然枫影的计谋我看得很过瘾，但我太爱这对了，求求来只猫救救他吧！"],
			why: "'Tho' promises a contrast whose other half never arrives, and the 'and' is really a 'so' (because I love the pair, I hope he is rescued).",
			refs: [
				"I love BramblexSquilf sooo much, [so] I'm [desperately] [hoping] some cat comes to his rescue before he runs out of lives!",
				"[As] [much] [as] I'm enjoying her scheming, I love BramblexSquilf too much. [Please] let some cat come to his rescue before he runs out of lives!",
				"I love BramblexSquilf sooo much, [so] [surely] some cat will come to his rescue before he runs out of lives?",
				"[As] [much] [as] I'm enjoying her scheming, I love BramblexSquilf sooo much… [surely] some cat will come to his rescue before he runs out of lives?",
			],
		},
	],
	provenance:
		"Spots (type, readings, refs) come from the hand-made demo (index.html, doc imposter). Pass-1 gold items were drafted by an assistant and need human review.",
};
