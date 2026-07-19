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

const CARD_0_REF: DiffPart[] = [
	{ type: "unchanged", text: "It also " },
	{
		type: "replace",
		from: "weakens the crucial parts",
		to: "undermines major parts",
	},
	{ type: "unchanged", text: " " },
	{
		type: "replace",
		from: "in their existing stories and bonds",
		to: "of their established stories and relationships",
	},
	{ type: "unchanged", text: " " },
	{
		type: "replace",
		from: "rewriting the whole backstory going for years",
		to: "and rewrites years of lore",
	},
	{ type: "unchanged", text: " " },
	{
		type: "replace",
		from: "for a ship we have never asked for",
		to: "for the sake of a pairing that we literally never asked for",
	},
	{ type: "unchanged", text: "." },
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

const CARD_1_REF: DiffPart[] = [
	{
		type: "replace",
		from: "The character feature of Crowfeather is always about",
		to: "Crowfeather's character has always been defined by",
	},
	{ type: "unchanged", text: " " },
	{
		type: "replace",
		from: "his emotional struggles between Feathertail and Leafpool",
		to: "his complicated, deeply emotional relationships with Feathertail and Leafpool",
	},
	{ type: "unchanged", text: " " },
	{
		type: "replace",
		from: "and their long-lasting impact on him",
		to: "and the lasting impact those loves had on him",
	},
	{ type: "unchanged", text: "." },
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

const CARD_2_REF: DiffPart[] = [
	{ type: "replace", from: "Brutely tugging him into", to: "Throwing him into" },
	{ type: "unchanged", text: " a romance with Tawnypelt " },
	{ type: "replace", from: "completely disregards", to: "ignores" },
	{ type: "unchanged", text: " the emotional baggage and " },
	{ type: "replace", from: "personal growth that have shaped him for a long time", to: "growth that have shaped him for so long" },
	{ type: "unchanged", text: "." },
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

const NOTE_0 =
	"本句的核心问题是搭配与信息压缩：weakens the crucial parts in… 偏直译；bonds 在此不如 relationships；rewriting the whole backstory going for years 定语松散。参考译法用 undermines major parts of their established stories and relationships 收紧评价力度，并用 years of lore / pairing we literally never asked for 把「世界观」与粉丝语境一次说清。注意 lore 比 backstory 更贴虚构设定。";

const NOTE_1 =
	"「The character feature of X is always about…」是典型中式主谓。英文更自然的是 X's character has always been defined by…。同时 emotional struggles 偏「挣扎」，原文强调复杂深沉的情感纠葛，complicated, deeply emotional relationships 更贴切；末尾 lasting impact those loves had on him 比 their long-lasting impact on him 更有指向。";

const NOTE_2 =
	"Brutely 为拼写错误，应为 Brutally；tugging 可接受但 Throwing / forcing 更自然。completely disregards 略重，ignores 更口语流畅；personal growth 可收成 growth，for a long time → for so long 更干脆。";

export const DEMO_CARDS: CorrectionCardData[] = [
	{
		ordinal: 0,
		sourceText: SOURCE_CARD_0,
		originalAnswer: ANSWER_0,
		initialHint: "后半句 rewriting the whole backstory going for years 结构松散；in…bonds 的介词与选词也可更自然。",
		deeperHint: "试着用 of their existing stories and relationships，并把「多年世界观」收成 years of lore / years of backstory 一类语块。",
		referenceAnswer: REF_0,
		minimalAnswer: MINIMAL_0,
		minimalDiff: CARD_0_MINIMAL,
		referenceDiff: CARD_0_REF,
		teachersNote: NOTE_0,
		warnings: [],
	},
	{
		ordinal: 1,
		sourceText: SOURCE_CARD_1,
		originalAnswer: ANSWER_1,
		initialHint: "「The character feature of…」偏中式。想想角色作主语 + is defined by 的写法。",
		deeperHint: "用 Crowfeather's character has always been defined by…，并把 emotional struggles 提升为更贴「复杂而深沉」的 relationships。",
		referenceAnswer: REF_1,
		minimalAnswer: MINIMAL_1,
		minimalDiff: CARD_1_MINIMAL,
		referenceDiff: CARD_1_REF,
		teachersNote: NOTE_1,
		warnings: [],
	},
	{
		ordinal: 2,
		sourceText: SOURCE_CARD_2,
		originalAnswer: ANSWER_2,
		initialHint: "有拼写 Brutely；tugging 也可换成更自然的 forcing / throwing。",
		deeperHint: "修正 Brutally/Throwing，并考虑 ignores … for so long 这类更紧凑的表达。",
		referenceAnswer: REF_2,
		minimalAnswer: MINIMAL_2,
		minimalDiff: CARD_2_MINIMAL,
		referenceDiff: CARD_2_REF,
		teachersNote: NOTE_2,
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
		accuracy: "A-",
		naturalness: "B",
		grammar: "B",
		register: "B+",
		contextualFit: "A-",
		overall: "B+",
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
		naturalness: "A-",
		grammar: "A",
		register: "A",
		contextualFit: "A",
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
		targetPattern: "X's character has always been defined by…",
		explanation: "描述角色特点时，用角色作主语 + is defined by / revolves around，比「The character feature of X is…」更地道。",
		exercises: [
			{ front: "她的个性一直由独立和倔强定义。", back: "Her personality has always been defined by independence and stubbornness." },
			{ front: "这部小说的魅力在于它细腻的人物弧线。", back: "The novel's charm has always been defined by its carefully drawn character arcs." },
			{ front: "他的领导风格以倾听和果断著称。", back: "His leadership style has always been defined by listening and decisiveness." },
			{ front: "该系列的世界观由复杂的氏族政治塑造。", back: "The series' world has always been defined by intricate clan politics." },
		],
	},
	{
		id: 2,
		targetPattern: "years of lore / buildup",
		explanation: "表示虚构世界长期设定时，lore 比 backstory 更精准；剧情铺垫常用 buildup。",
		exercises: [
			{ front: "他们重写了多年积累的世界观。", back: "They rewrote years of lore." },
			{ front: "这场反转完全没有铺垫。", back: "There was absolutely no buildup to this twist." },
			{ front: "粉丝们珍惜那些年的设定细节。", back: "Fans treasure those years of carefully built lore." },
			{ front: "这段感情缺少足够的情感铺垫。", back: "This romance lacks enough emotional buildup." },
		],
	},
];

export const DEMO_REJECT_FEEDBACK =
	"这次改写缩短了句子，但丢掉了 existing stories and bonds 的具体信息，且结构仍偏松。请在保留原意的前提下收紧语块。";

export const DEMO_SECOND_DRAFT_PASS_COMMENTARY = "二稿已经把「is defined by」、拼写和 years of lore 等点落实到全文语境中，整体自然度明显提升。";

export const DEMO_SECOND_DRAFT_UNRESOLVED_COMMENTARY = "第一段仍保留 weakens … bonds 和 going for years 的松散结构；请回到相关句再收紧一次。";

/** Fixed demo duration for simulated LLM waits (ms). */
export const DEMO_LLM_WAIT_MS = 2000;
