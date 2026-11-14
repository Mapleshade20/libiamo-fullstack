import type { Fixture } from "./types.ts";

// Real comment/post from the hand-made organisation demo (index.html), doc "shadow2".
export const shadow2: Fixture = {
	draft: {
		id: "shadow2",
		title: "Shadow",
		text: "Brambleclaw is a different case here— He's portrayed as capable and eager to lead, whether the journeying cats or his Clan, so which Clan he grows up in and which stance he adopts matter hugely. In canon he struggled a lot to find his footing, constantly reminded by his responsibility to ThunderClan and his attachment to his Clanmates whenever he feels uncertain. And his faith in Firestar kept wavering until the fox trap moment in Sunset. (I also remember how much he resented Firestar for being so much harsher on him about disobedience than on Squirrelpaw in Shaken Roots: Dawn :D). If he'd grown up in ShadowClan like in this AU, he would have felt more at home with their stances and might well have joined Hawkfrost and Tigerstar's scheme.",
		background: "这是《Shadow》评论里关于 Brambleclaw 那段的第二稿，我自己重写的，还是写给作者。",
		target: "en",
		learner: "zh-CN",
		level: "B2",
		scene: {
			platform: "AO3, a comment on a fanfic chapter",
			audience: "the fic's author (and other readers)",
			purpose: "explain how Brambleclaw would have turned out had he grown up in ShadowClan, in a comment on a fanfic",
		},
	},
	gold: [
		{ id: "dash-cap", at: "here— He's", route: "p1", fix: "here—he's", why: "No space and no capital after a dash." },
		{
			id: "whether-its",
			at: "whether the journeying cats",
			route: "p1",
			fix: "whether it's the journeying cats or his Clan",
			why: "'whether' lacks a verb or 'it's'; understandable in casual comments.",
			optional: true,
		},
		{
			id: "S4",
			at: "In canon he struggled a lot to find his footing, constantly reminded by his responsibility to ThunderClan and his attachment to his Clanmates whenever he feels uncertain.",
			route: "p2",
			why: "'constantly reminded by' never says reminded of what, and the tense slips; the writer's picture of duty acting on him (anchor, pull, memory) is unclear.",
		},
	],
	spots: [
		{
			id: "S4",
			at: "In canon he struggled a lot to find his footing, constantly reminded by his responsibility to ThunderClan and his attachment to his Clanmates whenever he feels uncertain.",
			type: "意思的分量",
			mode: "ask",
			readings: [
				"原作里他一直很难站稳脚跟；每当他动摇，对雷族的责任和对族猫的感情总能让他稳住。",
				"……每当他动摇，对雷族和族猫的忠诚总会把他拉回来。",
			],
			why: "'constantly reminded by' never says reminded of what, and the tense slips; the writer's picture of duty acting on him (anchor, pull, memory) is unclear.",
			refs: [
				"In canon he struggled to find his footing, but whenever he felt uncertain, his duty to ThunderClan and his bond with his Clanmates [kept] him [grounded].",
				"In canon he struggled to find his footing, but whenever he [wavered], his loyalty to ThunderClan and his Clanmates [pulled] him [back].",
				"In canon he struggled to find his footing, but whenever he felt uncertain, he'd [remember] his duty to ThunderClan and his love for his Clanmates.",
				"In canon he struggled to find his footing, but whenever he felt uncertain, his duty to ThunderClan and his love for his Clanmates [reminded] him [where] he belonged.",
				"In canon he struggled to find his footing, but whenever he felt uncertain, he was [pulled] [back] by his responsibility to ThunderClan and his attachment to his Clanmates.",
				"In canon he struggled to find his footing, but whenever he felt uncertain, he [held] [on] to his duty to ThunderClan and his bond with his Clanmates.",
			],
		},
	],
	provenance:
		"Spots (type, readings, refs) come from the hand-made demo (index.html, doc shadow2). Pass-1 gold items were drafted by an assistant and need human review.",
};
