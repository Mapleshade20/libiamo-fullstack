/**
 * Fixed fixtures for the translation evaluation visual demo.
 * Diffs are phrase/chunk-level (teachable collocations), not word-level shards.
 */

import type { CorrectionCardData, DiffPart, EvaluationData, LocalCardState, TransferNoteFixture } from "$lib/components/translate-evaluation/types";

const ANSWER_0 =
	"It also weakens the crucial parts in their existing stories and bonds, rewriting the whole backstory going for years, for a ship we have never asked for.";

const MINIMAL_0 =
	"It also weakens the crucial parts of their existing stories and relationships, rewriting years of backstory for a ship we have never asked for.";

const REF_0 =
	"It also undermines major parts of their established stories and relationships and rewrites years of lore for the sake of a pairing that we literally never asked for.";

/**
 * Phrase/chunk Diffs: each replace is one teachable collocation or clause unit
 * (prepositional phrase, verb collocation, time phrase). Never a whole half-sentence,
 * and never single-function-word shards.
 */
const CARD_0_MINIMAL: DiffPart[] = [
	{ type: "unchanged", text: "It also weakens the " },
	{
		type: "replace",
		from: "crucial parts in",
		to: "crucial parts of",
	},
	{ type: "unchanged", text: " their existing stories and " },
	{
		type: "replace",
		from: "bonds",
		to: "relationships",
	},
	{ type: "unchanged", text: ", rewriting " },
	{
		type: "replace",
		from: "the whole backstory going for years",
		to: "years of backstory",
	},
	{ type: "unchanged", text: " for a ship we have never asked for." },
];

const ACCEPTED_0 =
	"It also weakens the crucial parts of their existing stories and relationships, rewriting years of backstory for a ship we never asked for.";

export const ACCEPTED_DIFF_0: DiffPart[] = [
	{ type: "unchanged", text: "It also weakens the crucial parts " },
	{
		type: "replace",
		from: "in their existing stories and bonds",
		to: "of their existing stories and relationships",
	},
	{ type: "unchanged", text: ", " },
	{
		type: "replace",
		from: "rewriting the whole backstory going for years",
		to: "rewriting years of backstory",
	},
	{ type: "unchanged", text: " for a ship " },
	{
		type: "replace",
		from: "we have never asked for",
		to: "we never asked for",
	},
	{ type: "unchanged", text: "." },
];

export const ACCEPTED_ANSWER_0 = ACCEPTED_0;

const ANSWER_1 =
	"The character feature of Crowfeather is always about his emotional struggles between Feathertail and Leafpool, and their long-lasting impact on him.";

const MINIMAL_1 =
	"Crowfeather's character is always defined by his emotional struggles between Feathertail and Leafpool, and their long-lasting impact on him.";

const REF_1 =
	"Crowfeather's character has always been defined by his complicated, deeply emotional relationships with Feathertail and Leafpool and the lasting impact those loves had on him.";

const CARD_1_MINIMAL: DiffPart[] = [
	{
		type: "replace",
		from: "The character feature of Crowfeather is always about",
		to: "Crowfeather's character is always defined by",
	},
	{
		type: "unchanged",
		text: " his emotional struggles between Feathertail and Leafpool, and their long-lasting impact on him.",
	},
];

const ANSWER_2 =
	"Brutely tugging him into a romance with Tawnypelt completely disregards the emotional baggage and personal growth that have shaped him for a long time.";

const MINIMAL_2 =
	"Brutally forcing him into a romance with Tawnypelt completely disregards the emotional baggage and personal growth that have shaped him for a long time.";

const REF_2 = "Throwing him into a romance with Tawnypelt ignores the emotional baggage and growth that have shaped him for so long.";

const CARD_2_MINIMAL: DiffPart[] = [
	{ type: "replace", from: "Brutely tugging", to: "Brutally forcing" },
	{
		type: "unchanged",
		text: " him into a romance with Tawnypelt completely disregards the emotional baggage and personal growth that have shaped him for a long time.",
	},
];

const SOURCE_P0 =
	"我该从何说起呢？鸦羽和褐皮成为一对伴侣简直荒谬至极。这完全没有铺垫，对两人来说都极其不符合角色设定。它还削弱了他们既有故事和关系中那些重要部分，为了一个我们压根没要求过的配对，重写了多年的世界观。";
const SOURCE_P1 =
	"鸦羽这个角色的特点始终围绕他与羽尾、叶池之间复杂而深沉的情感纠葛，以及这些爱恋对他留下的持久影响。把他硬塞进与褐皮的恋情里，完全无视了那些长期以来塑造他的情感包袱和成长历程。同样，褐皮的故事从未像鸦羽那样围绕爱情展开。她一直以极其独立、忠于影族的形象出现，那她为什么突然表现得像个少女？";
const SOURCE_P2 = "别误会，我很喜欢两只年长一些的猫在各自伴侣去世后再次相爱的想法——但这两只猫绝不是适合这种发展的角色。";

const DRAFT_P0 =
	"Where should I start? There's nothing more ridiculous than Crowfeather and Tawnypelt becoming mates. This has no set up at all, and is extremely out of character for both of them. It also weakens the crucial parts in their existing stories and bonds, rewriting the whole backstory going for years, for a ship we have never asked for.";
const DRAFT_P1 =
	"The character feature of Crowfeather is always about his emotional struggles between Feathertail and Leafpool, and their long-lasting impact on him. Brutely tugging him into a romance with Tawnypelt completely disregards the emotional baggage and personal growth that have shaped him for a long time. On the other hand, Tawnypelt's story never unfolded around romance like Crowfeather. She has always appeared as a figure very independent and loyal to ShadowClan, but why does she suddenly behave like a teenage girl?";
const DRAFT_P2 =
	"Don't get me wrong. I like the idea of two older cats falling in love again after their respective mates passed away--But these two are definitely not for that.";

const SOURCE_CARD_0 = "它还削弱了他们既有故事和关系中那些重要部分，为了一个我们压根没要求过的配对，重写了多年的世界观。";
const SOURCE_CARD_1 = "鸦羽这个角色的特点始终围绕他与羽尾、叶池之间复杂而深沉的情感纠葛，以及这些爱恋对他留下的持久影响。";
const SOURCE_CARD_2 = "把他硬塞进与褐皮的恋情里，完全无视了那些长期以来塑造他的情感包袱和成长历程。";

const NOTES_0 = [
	"你用 weakens 表达「削弱」可以理解，但这里说的是新配对损害原有叙事的说服力，undermine 更有分析色彩，例如 The retcon undermines her earlier character arc。它常用于某件事逐步破坏基础、可信度或既有成果。",
	"你写的 parts in their existing stories and bonds 在介词与名词选择上不够自然：英语通常说 parts of a story，而分析角色互动时 relationships 比 bonds 更直接。类似场景可用 established storylines 强调既有剧情线，用 existing relationships 强调已经建立的人际关系。",
	"你写的 the whole backstory going for years 缺少清楚的修饰关系；在系列小说语境里，lore 指长期积累的历史、规则和设定，比人物前史 backstory 更贴切。可以比较 years of lore、years of continuity，以及 This twist contradicts years of established lore。",
];

const NOTES_1 = [
	"你写的 The character feature of Crowfeather is always about… 是逐词直译；英语人物分析通常直接让角色作主语。be defined by 强调核心特质，be shaped by 强调经历造成的变化，revolve around 强调叙事中心，例如 Her arc is shaped by the loss of her family。",
	"你用 emotional struggles between… 把「复杂而深沉的情感纠葛」写成了在两人之间挣扎，偏离了关系及其塑造作用。relationships with 能准确引出关系对象，例如 His storyline revolves around his complicated relationships with his family。",
	"你写的 their long-lasting impact 中 their 指向不清，读者无法立即判断它指两只猫还是多段感情。把所指内容直接写成 those loves 或 those relationships 会更清楚，例如 the lasting impact those relationships had on him。",
];

const NOTES_2 = [
	"你写的 Brutely 是拼写错误；若要表达「粗暴地」，副词应为 brutally，例如 The writers brutally dismissed his earlier development。不过即使拼写正确，也还要继续检查它所修饰的动作是否符合叙事语境。",
	"你用 tugging 描绘具体的拖拉动作，不适合「编剧硬把角色塞进恋情」这种叙事安排。forcing him into a romance 是稳妥表达，throwing him into 更口语，shoehorn a character into a romance 则专指生硬地把元素塞进作品。",
];

export const DEMO_CARDS: CorrectionCardData[] = [
	{
		ordinal: 0,
		sourceText: SOURCE_CARD_0,
		originalAnswer: ANSWER_0,
		initialHint:
			"这句有三处主要问题：weakens 没充分体现对叙事基础的损害；parts in…bonds 的介词和关系名词不自然；the whole backstory going for years 的修饰结构松散。请按语义力度、关系搭配和时间语块三个方向调整。",
		deeperHint:
			"沿着同样三处处理：为「削弱既有叙事」选择更有破坏基础含义的动词；用 parts of…relationships 一类搭配；再把长期积累的世界观收成 years of lore / continuity 这类清楚名词组。",
		referenceAnswer: REF_0,
		referenceMarked: [
			{ type: "text", content: "It also " },
			{ type: "mark", content: "undermines major parts of their established stories and relationships" },
			{ type: "text", content: " and " },
			{ type: "mark", content: "rewrites years of lore for the sake of" },
			{ type: "text", content: " a pairing that we " },
			{ type: "mark", content: "literally never asked for" },
			{ type: "text", content: "." },
		],
		minimalAnswer: MINIMAL_0,
		minimalDiff: CARD_0_MINIMAL,
		teacherNotes: NOTES_0,
		warnings: [],
	},
	{
		ordinal: 1,
		sourceText: SOURCE_CARD_1,
		originalAnswer: ANSWER_1,
		initialHint:
			"这句有三处主要问题：The character feature of… 是直译框架；emotional struggles between 偏离了多段深厚关系的含义；their 的所指不清。请分别调整人物分析句式、关系描述和代词指向。",
		deeperHint:
			"沿着同样三处处理：让 Crowfeather's character 作主语并用表示塑造的谓语；用 relationships with 表达他与两人的关系；最后把 their 改成明确指向这些感情或关系的名词短语。",
		referenceAnswer: REF_1,
		referenceMarked: [
			{ type: "text", content: "Crowfeather's character " },
			{ type: "mark", content: "has always been defined by" },
			{ type: "text", content: " his " },
			{ type: "mark", content: "complicated, deeply emotional relationships with" },
			{ type: "text", content: " Feathertail and Leafpool and " },
			{ type: "mark", content: "the lasting impact those loves had on him" },
			{ type: "text", content: "." },
		],
		minimalAnswer: MINIMAL_1,
		minimalDiff: CARD_1_MINIMAL,
		teacherNotes: NOTES_1,
		warnings: [],
	},
	{
		ordinal: 2,
		sourceText: SOURCE_CARD_2,
		originalAnswer: ANSWER_2,
		initialHint: "这句开头有两个相关但不同的问题：Brutely 拼写错误；tugging 又把叙事上的「硬塞」写成了具体拉扯动作。请分别修正副词拼写和动作搭配。",
		deeperHint:
			"沿着同样两个问题处理：先使用 brutally 的正确拼写，再把 tugging 换成表示强行安排角色进入恋情的 forcing、throwing 或 shoehorning 一类动词。",
		referenceAnswer: REF_2,
		referenceMarked: [
			{ type: "mark", content: "Throwing him into a romance with" },
			{ type: "text", content: " Tawnypelt " },
			{ type: "mark", content: "ignores the emotional baggage and growth that have shaped him for so long" },
			{ type: "text", content: "." },
		],
		minimalAnswer: MINIMAL_2,
		minimalDiff: CARD_2_MINIMAL,
		teacherNotes: NOTES_2,
		warnings: [],
	},
];

export const DEMO_CARDS_WITH_WARNING: CorrectionCardData[] = [
	DEMO_CARDS[0],
	{
		...DEMO_CARDS[1],
		originalAnswer: "A rewritten answer that does not appear in the first draft at all.",
		warnings: ["answer_unmatched"],
	},
	DEMO_CARDS[2],
];

export const DEMO_EVALUATION: EvaluationData = {
	overallCommentary:
		"整体来看，您的译文准确传达了原文的批判性和略带激动的语气，核心意思都表达到位了。但存在几处中式英语痕迹、一处拼写错误以及少数搭配不当，使得行文不够地道。重点注意：避免直译中文的主谓结构（如「XX的特点是……」），多积累英文中「人/角色作主语 + 被动/动态动词」的表达习惯。",
	ratings: {
		accuracy: "A",
		naturalness: "B",
		grammar: "B",
		overall: "B",
	},
	cards: DEMO_CARDS,
	firstDraft: [DRAFT_P0, DRAFT_P1, DRAFT_P2].join("\n\n"),
	firstDraftParagraphs: [DRAFT_P0, DRAFT_P1, DRAFT_P2],
	sourceParagraphs: [SOURCE_P0, SOURCE_P1, SOURCE_P2],
};

export const DEMO_EVALUATION_WARNING: EvaluationData = {
	...DEMO_EVALUATION,
	cards: DEMO_CARDS_WITH_WARNING,
};

export const DEMO_EVALUATION_NO_CARDS: EvaluationData = {
	...DEMO_EVALUATION,
	overallCommentary: "译文自然流畅，语义准确，语域契合 AO3 评论语境。没有需要单独修改的句子。",
	ratings: {
		accuracy: "A",
		naturalness: "A",
		grammar: "A",
		overall: "A",
	},
	cards: [],
};

export function emptyCardState(): LocalCardState {
	return {
		phase: "initial",
		attemptCount: 0,
		input: "",
		feedback: null,
		acceptedAnswer: null,
		acceptedDiff: null,
	};
}

export function firstRejectState(): LocalCardState {
	return {
		phase: "first_reject",
		attemptCount: 1,
		input: "It also weakens crucial parts in their stories, rewriting backstory for years.",
		feedback: "这次改写缩短了句子，但丢掉了 existing stories and bonds 的具体信息，且结构仍偏松。请在保留原意的前提下收紧语块。",
		acceptedAnswer: null,
		acceptedDiff: null,
	};
}

export function acceptedState(): LocalCardState {
	return {
		phase: "accepted",
		attemptCount: 1,
		input: ACCEPTED_ANSWER_0,
		feedback: null,
		acceptedAnswer: ACCEPTED_ANSWER_0,
		acceptedDiff: ACCEPTED_DIFF_0,
	};
}

export function secondRejectState(): LocalCardState {
	return {
		phase: "second_reject",
		attemptCount: 2,
		input: "It also weakens parts of stories for a ship.",
		feedback: "第二次尝试过度删减，原意不完整。",
		acceptedAnswer: null,
		acceptedDiff: null,
	};
}

export function providerErrorState(): LocalCardState {
	return {
		phase: "provider_error",
		attemptCount: 0,
		input: "It also weakens the crucial parts of their existing stories and relationships.",
		feedback: null,
		acceptedAnswer: null,
		acceptedDiff: null,
	};
}

export const DEMO_TRANSFER_NOTES: TransferNoteFixture[] = [
	{
		id: 1,
		vocab: "be defined by",
		targetDefinition: "to have a particular quality or feature as the most important part of something",
		nativeDefinition: "以……为最重要的特征；由……界定",
		queueKind: "new",
		examples: [
			{ nativeText: "她的个性一直以独立和倔强为特征。", targetText: "Her personality has always been defined by independence and stubbornness." },
			{ nativeText: "这部小说以细腻的人物弧线见长。", targetText: "The novel is defined by its carefully drawn character arcs." },
			{ nativeText: "他的领导风格以倾听和果断著称。", targetText: "His leadership style is defined by listening and decisiveness." },
			{ nativeText: "该系列的世界观由复杂的氏族政治塑造。", targetText: "The series' world is defined by intricate clan politics." },
		],
	},
	{
		id: 2,
		vocab: "lore",
		targetDefinition: "traditional knowledge and stories about a subject, especially a fictional world",
		nativeDefinition: "（尤指虚构世界的）背景知识、传说与设定",
		queueKind: "review",
		examples: [
			{ nativeText: "他们重写了多年积累的世界观设定。", targetText: "They rewrote years of lore." },
			{ nativeText: "这款游戏有丰富而复杂的背景设定。", targetText: "The game has rich and complicated lore." },
			{ nativeText: "粉丝们喜欢讨论这个系列的设定。", targetText: "Fans love discussing the lore of the series." },
			{ nativeText: "我需要先补一下背景设定。", targetText: "I need to catch up on the lore first." },
		],
	},
];

export const DEMO_REJECT_FEEDBACK =
	"这次改写缩短了句子，但丢掉了 existing stories and bonds 的具体信息，且结构仍偏松。请在保留原意的前提下收紧语块。";

export const DEMO_SECOND_DRAFT_PASS_COMMENTARY = "二稿已经把「is defined by」、拼写和 years of lore 等点落实到全文语境中，整体自然度明显提升。";

export const DEMO_SECOND_DRAFT_UNRESOLVED_COMMENTARY = "第一段仍保留 weakens … bonds 和 going for years 的松散结构；请回到相关句再收紧一次。";

/** Fixed demo duration for simulated LLM waits (ms). */
export const DEMO_LLM_WAIT_MS = 2000;
