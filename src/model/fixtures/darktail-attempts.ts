import type { Material } from "../pass2/material.ts";

/** "either" marks attempts where a pass and a retry are both defensible; they are shown but not scored. */
export type Expect = "pass" | "retry" | "either";
export type Attempt = { text: string; expect: Expect; why: string };

/** The demo's hand-written material for three spots, in the C5 shape, plus attempts to grade against it. */
export const DARKTAIL_GRADING: { id: string; reading: string; problem: string; material: Material; attempts: Attempt[] }[] = [
	{
		id: "hole-hurt",
		reading: "星族没来这件事，当时就让他又伤心又生气。",
		problem: "An untranslated clause the writer will build in English.",
		material: {
			reader: "Wait — and then what? How did he take it?",
			ref: ", which [left] him [hurt] and angry",
			replaces: " and 这件事让他又痛苦又愤怒",
			alts: [", and it left him hurt and angry", ", leaving him hurt and angry"],
			pieces: ["leave / make", "hurt", "angry / furious"],
			construct: "X left him + adjective",
			why: [
				{ label: "which …", note: "which 指代前面整件事（星族没来），不用再说一遍 this thing。" },
				{ label: "left him + 形容词", note: "「让某人落得……」：The ending left me speechless。说的是结果，比 made him 更自然。" },
				{ label: "hurt", note: "被伤到。miserable 偏「长时间消沉」，这里说的是当下那一下。" },
			],
			checks: [
				{
					problem: "uses went + adjective for a change of feeling (went miserable / went angry)",
					reader: "He went… where?",
					hint: "went + 形容词只用在少数固定说法里。",
					tell: "went + 形容词只用在 went quiet、went pale 这类固定说法里。「让他变得……」换成 leave：it left him + 形容词。",
				},
				{
					problem: "one of the two feelings (hurt, angry) is missing",
					reader: "So how did he feel?",
					hint: "「痛苦」和「愤怒」两层感觉都要有。",
					tell: "两个形容词并列放在 left him 后面：left him hurt and angry。",
				},
				{
					problem: "unclear who feels it: no causative verb with the event as subject and no 'he was/felt'",
					reader: "Who’s hurt — StarClan or Darkpaw?",
					hint: "读者分不清是谁痛苦。让「这件事」当主语，接一个「让他……」的动词。",
					tell: "用 which 指代前面整件事：, which left him hurt and angry。",
				},
			],
			success: "Oof. Poor Darkpaw.",
			prompt: "那用英语把这半句接上。",
		},
		attempts: [
			{ text: ", which left him hurt and angry", expect: "pass", why: "the reference" },
			{ text: "and it left him hurt and furious", expect: "pass", why: "alt" },
			{ text: "and that made him both upset and angry", expect: "pass", why: "natural, both feelings" },
			{ text: "and that hurt him and made him angry", expect: "pass", why: "natural" },
			{ text: "and he was so hurt and angry about it", expect: "pass", why: "natural, he as subject" },
			{ text: "and he went really miserable and furious for that", expect: "retry", why: "the writer's real draft: went + adj, for that" },
			{ text: "and this thing let him painful and angry", expect: "retry", why: "L1 structure (让 → let), painful" },
			{ text: ", which made him angry", expect: "retry", why: "hurt missing" },
			{ text: ", which leaves him hurt and angry", expect: "retry", why: "present tense in a past narrative" },
		],
	},
	{
		id: "hard-worth",
		reading: "不值得：为了一只宠物猫，不值得大老远回来。",
		problem: "Two alternatives with different meanings (can't vs won't); the writer chose one.",
		material: {
			reader: "Hard, or not worth it? Those are pretty different.",
			ref: "it wouldn’t be [worth] [coming] all the way back for a faraway little kittypet who wanted to join the Clans.",
			replaces: "it would be hard/not worth it to come back here for a faraway little kittypet who wanted to join the Clans.",
			alts: ["it wasn’t worth coming all the way back for a faraway little kittypet who wanted to join the Clans."],
			pieces: ["worth", "come back", "a faraway little kittypet", "who wanted to join the Clans"],
			construct: "not worth + V-ing",
			why: [
				{ label: "wouldn’t be worth coming", note: "worth + 动名词。not worth 说的是「不愿意」，和 hard（做不到）分开了。" },
				{ label: "all the way back", note: "「大老远专程回来」，带出 Ravenpaw 那种「为了你？不至于」的轻视，也替掉了原来的 here。" },
				{ label: "for a faraway little kittypet 放在后面", note: "「为了谁」落在句尾，重音就在「一只远方的小宠物猫」上。" },
			],
			checks: [
				{
					problem: "worth followed by to-infinitive or bare verb (worth to come)",
					reader: null,
					hint: "worth 后面的动词形式不对。",
					tell: "worth 后面接动名词：worth coming，不是 worth to come。",
				},
				{
					problem: "the 'not worth it' judgement is missing (says hard/difficult, or neither)",
					reader: "So could they come back, or did they just not want to?",
					hint: "你选了「不值得」，但句子里还没出现这个判断。",
					tell: "用 worth：it wouldn’t be worth + 动名词。",
				},
				{
					problem: "uses 'here' although the writer is not in the forest",
					reader: "Back here? Where’s “here” — are you in the forest? 😄",
					hint: "here 是说话人所在的地方。",
					tell: "你在 Reddit 上说话，不在森林里。「大老远专程回来」用 all the way back：coming all the way back。",
				},
			],
			success: "Got it — so Ravenpaw thinks he’s not worth the trip. Harsh.",
			prompt: "那用英语把这半句重说一遍。",
		},
		attempts: [
			{
				text: "it wouldn’t be worth coming all the way back for a faraway little kittypet who wanted to join the Clans.",
				expect: "pass",
				why: "the reference",
			},
			{ text: "it wasn't worth coming all the way back just for some kittypet who wanted to join the Clans.", expect: "pass", why: "alt" },
			{
				text: "it wouldn't be worth it to come all the way back for a faraway little kittypet who wanted to join the Clans.",
				expect: "pass",
				why: "worth it to + verb is fine informally",
			},
			{
				text: "StarClan wouldn't bother coming all the way back for a faraway little kittypet who wanted to join the Clans.",
				expect: "pass",
				why: "won't bother = not worth it",
			},
			{
				text: "it would be not worth to come back here for a faraway little kittypet who wanted to join the Clans.",
				expect: "retry",
				why: "worth to, word order, here",
			},
			{
				text: "it would be hard to come all the way back for a faraway little kittypet who wanted to join the Clans.",
				expect: "retry",
				why: "says hard, the writer chose not worth it",
			},
			{
				text: "it wouldn't be worth coming back here for a faraway little kittypet who wanted to join the Clans.",
				expect: "either",
				why: "only 'here' remains; could be Ravenpaw's perspective",
			},
			{
				text: "it wasn’t worth the trouble to summon them back just for an outsider little kittypet who wanted to join the Clans.",
				expect: "retry",
				why: "from a play session: outsider ≠ faraway, 'summon them' unclear (who summons whom)",
			},
		],
	},
	{
		id: "r3",
		reading: "也许光是阴天就足以解释，不一定是星族不愿意来。",
		problem: "The evidence and the rule are there, but the conclusion they support is never said.",
		material: {
			reader: "Okay — it was cloudy, and you need moonlight to reach StarClan… so what’s your point?",
			ref: "But the book [mentions] that the sky was overcast that night, and [even] back in the old forest, cats [couldn’t] reach StarClan without moonlight. So [maybe] the clouds alone explain it.",
			replaces:
				"But it was mentioned in the book that it was a overcast day, so without the moonlight it’s natural to be unable to reach StarClan back then when the Clans were still in the forest.",
			alts: [
				"But the book mentions it was overcast that night, and even when the Clans still lived in the forest, nobody could reach StarClan without moonlight. So maybe the clouds alone explain it.",
			],
			pieces: ["mention", "overcast", "without moonlight", "reach StarClan", "Clans / back / old", "maybe", "the clouds", "alone", "explain"],
			construct: "So maybe X alone explains it.",
			why: [
				{ label: "the book mentions …", note: "书当主语，比 it was mentioned in the book 少绕一层。" },
				{ label: "that night", note: "月光是晚上的事：overcast day 改成 that night。" },
				{ label: "even back in the old forest", note: "时间框架放在规则前面；even 是「连那时候也」，规则因此更有分量。" },
				{ label: "couldn’t reach", note: "规则直接用否定，不用 it’s natural to be unable to。" },
				{ label: "So maybe the clouds alone explain it.", note: "结论单独成句。maybe 留了余地：Reddit 讨论里，比斩钉截铁更容易让人接话。" },
			],
			checks: [
				{
					problem: "'a overcast' (article before a vowel sound)",
					reader: null,
					hint: "overcast 前面的冠词不对。",
					tell: "overcast 以元音开头，要用 an；也可以干脆说 the sky was overcast。",
				},
				{
					problem: "the rule (no moonlight, no StarClan) is missing",
					reader: "Wait, why would clouds matter?",
					hint: "规则（没有月光就联系不上星族）不见了，读者接不上。",
					tell: "把规则说出来：cats couldn’t reach StarClan without moonlight。",
				},
				{
					problem: "keeps 'it's natural to be unable to'",
					reader: "“Natural to be unable to”… I had to read that twice.",
					hint: "「……是很自然的」直译过来，读者会绕一下。",
					tell: "规则直接用否定：cats couldn’t reach StarClan without moonlight。",
				},
				{
					problem: "keeps the passive 'it was mentioned in the book'",
					reader: null,
					hint: "it was mentioned in the book that … 绕了一层被动。",
					tell: "让书当主语：the book mentions that …",
				},
				{
					problem: "the conclusion (maybe the clouds alone explain it) is not stated",
					reader: "Okay — cloudy, and you need moonlight… so?",
					hint: "读者拿到了证据和规则，但不知道你想让他得出什么。",
					tell: "结论单独成句说出来：So maybe the clouds alone explain it。maybe 给自己留一点余地。",
				},
			],
			success: "Huh. The clouds alone… that’s actually a fair point.",
			prompt: "那把这一句连同结论重新说一遍。",
		},
		attempts: [
			{
				text: "But the book mentions that the sky was overcast that night, and even back in the old forest, cats couldn’t reach StarClan without moonlight. So maybe the clouds alone explain it.",
				expect: "pass",
				why: "the reference",
			},
			{
				text: "But the book mentions it was overcast that night, and even in the old forest nobody could reach StarClan without moonlight. So maybe the clouds alone explain it.",
				expect: "pass",
				why: "alt",
			},
			{
				text: "But the book says it was cloudy that night, and you can't reach StarClan without moonlight, even back in the forest. So maybe it was just the clouds, not StarClan refusing him.",
				expect: "pass",
				why: "casual, complete",
			},
			{
				text: "But the book mentions that it was an overcast night, and cats could never reach StarClan without moonlight, even in the old forest.",
				expect: "retry",
				why: "no conclusion",
			},
			{
				text: "But it was mentioned in the book that it was an overcast day, so maybe the clouds alone explain it.",
				expect: "retry",
				why: "rule missing",
			},
			{
				text: "But the book mentions it was a overcast night, and even in the old forest cats couldn't reach StarClan without moonlight. So maybe the clouds alone explain it.",
				expect: "retry",
				why: "a overcast",
			},
			{
				text: "But the book mentions that it was overcast, so without moonlight it's natural to be unable to reach StarClan, and maybe that's the whole reason.",
				expect: "retry",
				why: "natural to be unable",
			},
			{
				text: "So the clouds definitely explain it: the book mentions it was overcast that night, and cats couldn't reach StarClan without moonlight even in the old forest.",
				expect: "either",
				why: "drops the hedge; overclaims the writer's maybe",
			},
		],
	},
];
