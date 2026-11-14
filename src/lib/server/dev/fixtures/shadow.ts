import type { Fixture } from "./types.ts";

// Real comment/post from the hand-made organisation demo (index.html), doc "shadow".
export const shadow: Fixture = {
	draft: {
		id: "shadow",
		title: "Shadow",
		text: "We’re going to have great meals this whole month!! Your intricate writing of Characters’ internal monologue and the way you present all the nuances NEVER disappoints me. Keep up with this!\n\nSome of my thoughts about the two characters: Canon Tawnypelt/paw left ThunderClan primarily to find peace and escape the constant scrutiny of her lineage, not out of admiration for Tigerstar or intention to follow Tigerstar, and her character just keeps her away from her father’s dark ambitions. So she would be fine no matter in ShadowClan or ThunderClan. But Brambleclaw is a different case imo—which environment he grows up in hugely matters. He’s portrayed as capable and eager to lead the journeying cats or his Clan, and in canon his belief in Firestar had been wavering until the critical fox trap moment in Sunset. I also remember he resented Firestar for being much harsher on him than Squirrelpaw in Shaken Roots: Dawn :D. So, had he grown up in ShadowClan he would feel more comfortable with their stances and possibly join Hawkfrost and Tigerstar’s scheme.",
		background: "AO3 上《Shadow》一章下面的评论初稿，写给作者，先夸文笔，再聊 Tawnypelt 和 Brambleclaw 两个角色。",
		target: "en",
		learner: "zh-CN",
		level: "B2",
		scene: {
			platform: "AO3, a comment on a fanfic chapter",
			audience: "the fic's author (and other readers)",
			purpose: "praise the fic's writing and discuss how two characters would have turned out in another Clan",
		},
	},
	gold: [
		{
			id: "S1",
			at: "We’re going to have great meals this whole month!!",
			route: "p2",
			why: "A fandom metaphor translated literally ('great meals') reads as an actual meal until the next sentence.",
		},
		{ id: "characters", at: "Characters’", route: "p1", fix: "characters’", why: "Wrongly capitalised mid-sentence." },
		{
			id: "keep-up",
			at: "Keep up with this!",
			route: "p1",
			fix: "Keep it up!",
			why: "'Keep up with this' means to follow along; the encouragement is 'Keep it up!'.",
		},
		{
			id: "canon-cap",
			at: "Canon",
			route: "p1",
			fix: "canon",
			why: "Capital after a colon is optional; lower-case 'canon' is the usual form mid-sentence.",
			optional: true,
		},
		{
			id: "S2",
			at: "not out of admiration for Tigerstar or intention to follow Tigerstar, and her character just keeps her away from her father’s dark ambitions",
			route: "p2",
			why: "Chinese-style nominalisations ('out of admiration', 'intention to follow') read like an essay, and the last clause's relation to the first is unclear.",
		},
		{
			id: "no-matter",
			at: "no matter in ShadowClan or ThunderClan",
			route: "p1",
			fix: "whether she was in ShadowClan or ThunderClan",
			why: "'no matter' needs 'whether' / a clause; 'in either ShadowClan or ThunderClan' would also work.",
		},
		{
			id: "S3",
			at: "But Brambleclaw is a different case imo—which environment he grows up in hugely matters.",
			route: "p2",
			why: "A long subject before 'hugely matters' makes the sentence top-heavy; the emphasis falls on the wrong part.",
		},
		{
			id: "than-on",
			at: "than Squirrelpaw",
			route: "p1",
			fix: "than on Squirrelpaw",
			why: "'harsher on him than Squirrelpaw' can read as Squirrelpaw being harsh; 'than on Squirrelpaw' is unambiguous.",
			optional: true,
		},
		{
			id: "would-feel",
			at: "he would feel",
			route: "p1",
			fix: "he would have felt",
			why: "'had he grown up' is a past counterfactual, so the result needs 'would have felt'.",
		},
		{
			id: "possibly-join",
			at: "possibly join",
			route: "p1",
			fix: "possibly have joined",
			why: "Same counterfactual: 'would ... possibly have joined'.",
		},
	],
	spots: [
		{
			id: "S1",
			at: "We’re going to have great meals this whole month!!",
			type: "体裁里的比喻",
			mode: "one",
			readings: ["这个月有吃不完的好粮了！（夸作者整个月都在更新）", "整个月都能追你的更新，太幸运了！"],
			why: "A fandom metaphor translated literally ('great meals') reads as an actual meal until the next sentence.",
			refs: [
				"We're [in] [for] a [feast] this whole month!!",
				"A whole month of your writing?! [Lucky] [us]!!",
				"You're [feeding] us so well this month!!",
				"We get to read [so] [much] of your writing this month!!",
			],
		},
		{
			id: "S2",
			at: "not out of admiration for Tigerstar or intention to follow Tigerstar, and her character just keeps her away from her father’s dark ambitions",
			type: "名词化",
			mode: "one",
			readings: [
				"她离开雷族不是因为崇拜虎星、想追随他；以她的性格，不管在哪都不会卷进父亲的野心。",
				"她离开不是因为崇拜虎星；她就不是那种会被父亲的野心卷进去的猫。",
			],
			why: "Chinese-style nominalisations ('out of admiration', 'intention to follow') read like an essay, and the last clause's relation to the first is unclear.",
			refs: [
				"not because she [admired] Tigerstar or [wanted] to follow him, and her personality [would] have kept her away from her father's dark ambitions [anyway]",
				"not because she admired Tigerstar or wanted to follow him. She's just not the [type] to get [pulled] into her father's ambitions.",
				"not out of [admiration] for Tigerstar or any [wish] to follow him, and her character keeps her away from her father's dark ambitions",
				"not because she [admired] Tigerstar or [wanted] to follow him, and her character keeps her away from her father's dark ambitions",
				"not out of admiration for Tigerstar or any wish to follow him, and her nature [would] have kept her clear of her father's dark ambitions [anyway]",
			],
		},
		{
			id: "S3",
			at: "But Brambleclaw is a different case imo—which environment he grows up in hugely matters.",
			type: "信息顺序",
			mode: "one",
			readings: ["但棘爪的情况不一样：他在哪个族长大，影响非常大。"],
			why: "A long subject before 'hugely matters' makes the sentence top-heavy; the emphasis falls on the wrong part.",
			refs: [
				"But Brambleclaw is a different case imo—[it] really [matters] which [Clan] he grows up in.",
				"But Brambleclaw is a different case imo—which environment he grows up in [matters] [hugely].",
				"But Brambleclaw is a different case imo—[it] [matters] hugely which environment he grows up in.",
				"But Brambleclaw is a different case imo—which [Clan] he grows up in [matters] [hugely].",
			],
		},
	],
	provenance:
		"Spots (type, readings, refs) come from the hand-made demo (index.html, doc shadow). Pass-1 gold items were drafted by an assistant and need human review.",
};
