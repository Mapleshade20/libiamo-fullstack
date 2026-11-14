import type { SpotInput } from "../pass2/material.ts";

/** E3 inputs (spot + confirmed reading) and the demo's hand-written material for side-by-side reading. */
export const DARKTAIL_SPOTS: { id: string; input: SpotInput; demo: Record<string, string | string[]> }[] = [
	{
		id: "hole-hurt",
		input: {
			sentences:
				"I’m in the early chapters of Darktail’s Judgment, and I get a little bit confused about the plot that StarClan didn’t show up when Darkpaw was at the Moonstone and 这件事让他又痛苦又愤怒.",
			phrase: "and 这件事让他又痛苦又愤怒",
			problem: "An untranslated clause the writer will build in English.",
			reading: "星族没来这件事，当时就让他又伤心又生气。",
			mode: "one",
		},
		demo: {
			reader: "Wait — and then what? How did he take it?",
			ref: ", which [left] him [hurt] and angry",
			alts: [", and it left him hurt and angry", ", leaving him hurt and angry"],
			pieces: ["+leave / make", "+hurt", "+angry / furious"],
			construct: "X left him + 形容词",
			why: [
				"which …: which 指代前面整件事（星族没来），不用再说一遍 this thing。",
				"left him + 形容词: 「让某人落得……」：The ending left me speechless。说的是结果，比 made him 更自然。",
				"hurt: 被伤到。miserable 偏「长时间消沉」，这里说的是当下那一下。",
			],
			checks: [
				"went + adj → went 只用在 went quiet/pale；换成 leave",
				"two feelings both present (reader: So how did he feel?)",
				"who is hurt — need 'this thing' as subject + causative (reader: Who’s hurt — StarClan or Darkpaw?)",
			],
			success: "Oof. Poor Darkpaw.",
		},
	},
	{
		id: "hard-worth",
		input: {
			sentences:
				"Ravenpaw said StarClan had travelled with the Clans and left the forest skies, and it would be hard/not worth it to come back here for a faraway little kittypet who wanted to join the Clans.",
			phrase: "it would be hard/not worth it to come back here for a faraway little kittypet who wanted to join the Clans",
			problem: "Two alternatives with different meanings (can't vs won't); the writer chose one.",
			reading: "不值得：为了一只宠物猫，不值得大老远回来。",
			mode: "ask",
		},
		demo: {
			reader: "Hard, or not worth it? Those are pretty different.",
			ref: "it wouldn’t be [worth] [coming] all the way back for a faraway little kittypet who wanted to join the Clans.",
			alts: ["it wasn’t worth coming all the way back for a faraway little kittypet who wanted to join the Clans."],
			pieces: ["+worth", "=come back", "=a faraway little kittypet", "=who wanted to join the Clans"],
			construct: "not worth + V-ing",
			why: [
				"wouldn’t be worth coming: worth + 动名词。not worth 说的是「不愿意」，和 hard（做不到）分开了。",
				"all the way back: 「大老远专程回来」，带出 Ravenpaw 那种「为了你？不至于」的轻视，也替掉了原来的 here。",
				"for a faraway little kittypet 放在后面: 「为了谁」落在句尾，重音就在「一只远方的小宠物猫」上。",
			],
			checks: [
				"worth to come → worth coming",
				"no 'worth' (reader: So could they come back, or did they just not want to?)",
				"here (reader: Back here? Where’s “here” — are you in the forest? 😄) → all the way back",
			],
			success: "Got it — so Ravenpaw thinks he’s not worth the trip. Harsh.",
		},
	},
	{
		id: "r3",
		input: {
			sentences:
				"But it was mentioned in the book that it was a overcast day, so without the moonlight it’s natural to be unable to reach StarClan back then when the Clans were still in the forest.",
			problem: "The evidence and the rule are there, but the conclusion they support is never said.",
			reading: "也许光是阴天就足以解释，不一定是星族不愿意来。",
			mode: "one",
		},
		demo: {
			reader: "Okay — it was cloudy, and you need moonlight to reach StarClan… so what’s your point?",
			ref: "But the book [mentions] that the sky was overcast that night, and [even] back in the old forest, cats [couldn’t] reach StarClan without moonlight. So [maybe] the clouds alone explain it.",
			alts: [
				"But the book mentions it was overcast that night, and even when the Clans still lived in the forest, nobody could reach StarClan without moonlight. So maybe the clouds alone explain it.",
			],
			pieces: [
				"=mention",
				"=overcast",
				"=without moonlight",
				"=reach StarClan",
				"=Clans / back / old",
				"=can’t reach",
				"+maybe",
				"+the clouds",
				"+alone",
				"+explain",
			],
			construct: "So maybe X alone explains it.",
			why: [
				"the book mentions …: 书当主语，比 it was mentioned in the book 少绕一层。",
				"that night: 月光是晚上的事：overcast day 改成 that night。",
				"even back in the old forest: 时间框架放在规则前面；even 是「连那时候也」，规则因此更有分量。",
				"couldn’t reach: 规则直接用否定，不用 it’s natural to be unable to。",
				"So maybe the clouds alone explain it.: 结论单独成句。maybe 留了余地：Reddit 讨论里，比斩钉截铁更容易让人接话。",
			],
			checks: [
				"a overcast",
				"rule missing (reader: Wait, why would clouds matter?)",
				"natural to be unable (reader: “Natural to be unable to”… I had to read that twice.)",
				"it was mentioned in the book → the book mentions",
				"no conclusion (reader: Okay — cloudy, and you need moonlight… so?)",
			],
			success: "Huh. The clouds alone… that’s actually a fair point.",
		},
	},
	{
		id: "question",
		input: {
			sentences:
				"I’m in the early chapters of Darktail’s Judgment, and I get a little bit confused about the plot that StarClan didn’t show up when Darkpaw was at the Moonstone and 这件事让他又痛苦又愤怒.",
			phrase: "I get a little bit confused about the plot that",
			problem:
				"The opening reads as if the writer did not follow the plot; the post's real question is never asked. It belongs at the end of the first paragraph.",
			reading:
				"我想问的是：为什么暗爪和乌爪那么自然就认定星族已经走了、从这里再也联系不上了，却不去想想联系的手段——那晚月亮石到底亮没亮？他们有没有在月亮石亮的时候再去试？",
			mode: "given",
		},
		demo: {
			reader: "Now I get your real question. Put it right here and the rest of the post will make sense.",
			ref: "What I don’t [get] is why Darkpaw and Ravenpaw [jump] straight to “StarClan is gone and can’t be reached from here” without asking [whether] the Moonstone was even lit that night.",
			alts: ["Why do Darkpaw and Ravenpaw jump straight to “StarClan has left” without checking whether the Moonstone was even lit that night?"],
			pieces: [
				"=Darkpaw and Ravenpaw",
				"+jump straight to",
				"=StarClan",
				"+is gone / has left",
				"=can’t reach",
				"+from here",
				"=Moonstone",
				"+lit / shining",
				"+that night",
			],
			construct: "What I don’t get is why …",
			why: [
				"What I don’t get is why …: 先说「我不明白」，问题落在 why 后面。",
				"jump straight to: 一下子跳到结论，自带「太快了」的批评。",
				"“StarClan is gone …”: 加引号：这是他们的结论，不是你的看法。",
				"without asking whether …: 把他们没考虑的事接在后面。",
				"even lit: even：连「那晚月亮石亮没亮」都没确认。",
			],
			checks: [
				"confused about the plot",
				"not a question (reader: Hmm, so what’s the question?)",
				"no 'they decided' (reader: Wait, who decided StarClan was gone?)",
				"doubt missing (reader: Okay, they decided StarClan left. But why do you doubt it?)",
			],
			success: "Ohh, now I see your question. That’s a good one.",
		},
	},
];
