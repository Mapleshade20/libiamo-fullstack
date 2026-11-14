import type { Fixture } from "./types.ts";

// Real comment/post from the hand-made organisation demo (index.html), doc "broken".
export const brokenstar: Fixture = {
	draft: {
		id: "brokenstar",
		title: "Brokenstar",
		text: "Wow... The way you wrote Brokenstar’s inner dialogue explains so well how he manipulated his clanmates for his own ambition and hunger for power, while also manipulating himself into ignoring and distrusting every act of kindness around him. It makes so much sense that he would come to see force and fear as the only real way to earn respect, and insist that what he did was the sole right path.\n\nThe effort you put into Yellowfang and Brokentail’s interactions in his final days adds so much depth to Yellowfang’s complicated relationship with her son. Especially, the canon-divergent ending struck me as more emotionally powerful than canon. “This is more than I deserve from you,” Apart from coming to terms with his fate out of, what you said, \"captain's integrity\", he's also somehow accepting her as his mother and feeling gratitude for her final care, and was there even a bit regret of what he had done to her?\n\nGreat work! Kudo attached~",
		background:
			"AO3 上《Brokenstar》一章下面的评论，已经发出，还可以编辑。写给作者，说说 Brokenstar 的内心独白、他和 Yellowfang 的最后几天，还有改写的结局。",
		target: "en",
		learner: "zh-CN",
		level: "B2",
		scene: {
			platform: "AO3, a comment on a fanfic chapter",
			audience: "the fic's author (and other readers)",
			purpose: "praise the chapter's portrayal of Brokenstar and the ending, with one question for the author",
		},
	},
	gold: [
		{
			id: "B1",
			at: "The way you wrote Brokenstar’s inner dialogue explains so well how he manipulated his clanmates for his own ambition and hunger for power, while also manipulating himself into ignoring and distrusting every act of kindness around him. It makes so much sense that he would come to see force and fear as the only real way to earn respect, and insist that what he did was the sole right path.",
			route: "p2",
			why: "Two very long sentences stack the whole analysis into one, so readers lose the point and the author gets little emotion.",
		},
		{
			id: "B5",
			at: "The effort you put into Yellowfang and Brokentail’s interactions in his final days adds so much depth",
			route: "p2",
			why: "'The effort you put into' praises labour like a teacher's comment rather than craft; 'Brokentail' also does not match 'Brokenstar'.",
		},
		{
			id: "B2",
			at: "Especially, the canon-divergent ending struck me as more emotionally powerful than canon.",
			route: "p2",
			why: "Sentence-initial 'Especially,' is a Chinese 'especially' calque, and 'than canon' compares an ending with the whole canon.",
		},
		{
			id: "B3",
			at: "“This is more than I deserve from you,” Apart from coming to terms with his fate out of, what you said, \"captain's integrity\", he's also somehow accepting her as his mother and feeling gratitude for her final care",
			route: "p2",
			why: "The quote is bolted to a new capitalised sentence, 'what you said' interrupts, and two ideas are crammed into one sentence.",
		},
		{
			id: "B4",
			at: ", and was there even a bit regret of what he had done to her?",
			route: "p2",
			why: "The question is tacked onto the statement with 'and', 'a bit regret of' is wrong, and the question lacks a set-up.",
		},
		{
			id: "kudos",
			at: "Kudo attached~",
			route: "p1",
			fix: "Kudos left~",
			why: "The set phrase is 'Kudos left' (AO3's own wording); 'Kudo attached' is not English.",
		},
	],
	spots: [
		{
			id: "B1",
			at: "The way you wrote Brokenstar’s inner dialogue explains so well how he manipulated his clanmates for his own ambition and hunger for power, while also manipulating himself into ignoring and distrusting every act of kindness around him. It makes so much sense that he would come to see force and fear as the only real way to earn respect, and insist that what he did was the sole right path.",
			type: "段落密度",
			mode: "ask",
			readings: [
				"你写的 Brokenstar 内心独白很有说服力：他推开身边所有的善意，认定只有恐惧才能换来尊重，而且从不怀疑自己是对的。",
				"我想展示我读懂了他的心理：他为了被尊重而操纵族猫，又说服自己不去相信任何善意，最后认定恐惧是唯一的路，并坚信自己是对的。",
			],
			why: "Two very long sentences stack the whole analysis into one, so readers lose the point and the author gets little emotion.",
			refs: [
				"I loved getting [inside] Brokenstar's head. His logic makes [awful] sense: he pushes away every bit of kindness and decides that fear is the only way to earn respect. And he never [doubts] that he was right.",
				"Your Brokenstar is so convincing. He [manipulates] his clanmates because he needs to be respected, and he [talks] himself out of trusting any kindness. [Of] [course] he ends up believing fear is the only way to earn respect, and that he was right all along.",
				"Brokenstar's inner voice was so convincing: every bit of kindness [twisted] into suspicion, and fear as the [only] way to earn respect.",
			],
		},
		{
			id: "B5",
			at: "The effort you put into Yellowfang and Brokentail’s interactions in his final days adds so much depth",
			type: "夸奖的角度",
			mode: "one",
			readings: [
				"你写 Yellowfang 和 Brokenstar 最后那几天的互动写得很好，让她和儿子之间复杂的关系更有层次了。",
				"他们最后那几天的相处本身就很打动我，让这段母子关系更有层次。",
			],
			why: "'The effort you put into' praises labour like a teacher's comment rather than craft; 'Brokentail' also does not match 'Brokenstar'.",
			refs: [
				"The [way] you [handled] Yellowfang and Brokenstar's interactions in his final days adds so much depth to her complicated relationship with her son.",
				"Yellowfang and Brokenstar's last days [together] add so much depth to their complicated relationship.",
				"I [loved] [how] you wrote Yellowfang and Brokenstar's last days together. It adds so much depth to her complicated relationship with her son.",
			],
		},
		{
			id: "B2",
			at: "Especially, the canon-divergent ending struck me as more emotionally powerful than canon.",
			type: "强调与比较",
			mode: "one",
			readings: ["尤其是这个改写了原作的结局，比原作的结局更打动我。", "另外，这个改写的结局比原作的更有冲击力。（只是递进，不是重点）"],
			why: "Sentence-initial 'Especially,' is a Chinese 'especially' calque, and 'than canon' compares an ending with the whole canon.",
			refs: [
				"What [really] [got] me was the canon-divergent ending. It felt even more powerful than the [original].",
				"[In] [particular], the canon-divergent ending struck me as even more powerful than [the] [canon] [one].",
				"And the canon-divergent ending! It hit me even [harder] than the [original].",
			],
		},
		{
			id: "B3",
			at: "“This is more than I deserve from you,” Apart from coming to terms with his fate out of, what you said, \"captain's integrity\", he's also somehow accepting her as his mother and feeling gratitude for her final care",
			type: "引语与转述",
			mode: "ask",
			readings: [
				"他说「这已经超出我应得的了」的时候，不只是像你说的那样，像个船长一样坦然接受命运；他也在用自己的方式承认她是母亲，感谢她最后的照顾。",
				"这句台词让我很受触动：一面是船长与船同沉，一面是儿子终于肯让母亲照顾自己。",
			],
			why: "The quote is bolted to a new capitalised sentence, 'what you said' interrupts, and two ideas are crammed into one sentence.",
			refs: [
				"When he [says], \"This is more than I deserve from you,\" he's not [just] facing his fate like a true captain, [as] you [put] it. In his own way, he's also accepting her as his mother and thanking her for her final care.",
				"That line, \"This is more than I deserve from you,\" [broke] me. It's a captain going down with his ship, as you put it, but it's also a [son] finally letting his mother care for him.",
				"\"This is more than I deserve from you\" [says] so much. He's facing his fate like a true captain, as you put it, but he's also finally accepting Yellowfang as his mother.",
			],
		},
		{
			id: "B4",
			at: ", and was there even a bit regret of what he had done to her?",
			type: "提问的铺垫",
			mode: "ask",
			readings: [
				"他之前明明说过「我不后悔」，所以我忍不住想：在最后，他对自己对她做过的事，是不是有一点点后悔？",
				"我一直在想，他心里是不是也有一点后悔。（不需要作者回答）",
			],
			why: "The question is tacked onto the statement with 'and', 'a bit regret of' is wrong, and the question lacks a set-up.",
			refs: [
				"Coming from a cat who [insisted] \"I'm not sorry,\" I can't [help] but [wonder]: was there maybe a little regret for what he'd done to her?",
				"I keep [wondering] [if] there was a little regret in there too, for what he'd done to her.",
				"And after \"I'm not sorry,\" I couldn't help [wondering]: was there a little regret in there [too]?",
			],
		},
	],
	provenance:
		"Spots (type, readings, refs) come from the hand-made demo (index.html, doc broken). Pass-1 gold items were drafted by an assistant and need human review.",
};
