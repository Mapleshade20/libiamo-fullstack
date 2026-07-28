import { getLanguageEnglishName } from "$lib/constants";
import type { ChatMessage } from "$lib/server/llm";
import { TRANSLATION_GRADES } from "$lib/translation-evaluation/types";
import type { ValidatedGeneration1Card } from "./validation";

export type Generation1Input = {
	sourceParagraphs: string[];
	learnerParagraphs: string[];
	referenceParagraphs: string[];
	sourceLanguage: string;
	targetLanguage: string;
	feedbackLanguage: string;
	context: string;
};

const generation1Shape = {
	overallCommentary: "feedback-language overview",
	ratings: {
		accuracy: "A",
		naturalness: "B",
		grammar: "B",
		overall: "B",
	},
	cards: [
		{
			sourceText: "exact source substring",
			originalAnswer: "exact learner-answer substring",
			initialHint: "feedback-language diagnosis and non-revealing direction for every major issue; no corrected words or copyable solutions",
			deeperHint: "more explicit guidance for those same issues; short candidate forms are allowed, but no complete corrected answer",
			referenceAnswer: "natural target-language answer",
			referenceMarked: "the complete referenceAnswer with useful expressions absent from originalAnswer wrapped in <mark></mark>",
			minimalAnswer: "target-language answer with fewer changes",
			minimalDiff: "restricted XML Diff from originalAnswer to minimalAnswer",
			teacherNotes: [
				"one direct second-person lesson for one major issue, with its reasoning, useful examples, and related expressions kept in this same entry",
			],
		},
	],
};

function generation1SystemPrompt(input: Generation1Input): string {
	const sourceLanguage = getLanguageEnglishName(input.sourceLanguage);
	const targetLanguage = getLanguageEnglishName(input.targetLanguage);
	const feedbackLanguage = getLanguageEnglishName(input.feedbackLanguage);
	return `You are an exacting but fair ${targetLanguage} translation tutor. Evaluate a learner translating from ${sourceLanguage} into ${targetLanguage}, and generate correction cards. Authentic references are evidence of valid wording, not the only acceptable answers. Accept natural synonyms and preserve the scenario's voice, register, and pragmatic intent.

Return one JSON object only, with exactly this shape and no additional fields:
${JSON.stringify(generation1Shape)}

CONTRACT
- Write overallCommentary, initialHint, deeperHint, and every teacherNotes entry entirely in ${feedbackLanguage}. overallCommentary must cover the translation's main strengths, accuracy, naturalness, grammar, and the most valuable recurring improvement pattern. Do not merely restate the ratings.
- Every rating must be exactly one of ${TRANSLATION_GRADES.join(", ")}. Do not add plus or minus modifiers. Return only accuracy, naturalness, grammar, and overall. The naturalness rating includes idiomatic wording, register, voice, pragmatic appropriateness, and contextual fit.
- Audit every learner sentence in order against the source intent, authentic reference, and scenario. Check meaning completeness, grammar, word form and spelling, idiom and collocation, sentence structure, discourse logic, referent clarity, register, and pragmatic fit. Treat the authentic reference as evidence, not mandatory wording.
- Generate one card for every learner sentence that contains at least one clear problem worth active correction. A clear problem includes nonstandard language, a distinctly unidiomatic construction, or wording that leaves the intended meaning or relationship incomplete or unclear; it does not include a merely optional stylistic improvement. Combine all spelling, grammar, collocation, meaning, punctuation, and register problems in the same learner sentence. Multiple flawed sentences in one paragraph must result in multiple cards. Do not split one underlying problem into near-duplicate cards. Do not skip an understandable but clearly flawed sentence merely because nearby sentences have more serious problems or to keep the card count low. If the learner's answer is fully accurate, natural, and contextually appropriate, \`cards\` may be empty.
- Before returning JSON, silently perform a coverage check: revisit every learner sentence and confirm that each sentence with a clear problem is represented by exactly one card and that every clear problem in that sentence appears in both hints and teacherNotes. Sentences omitted from cards must be genuinely acceptable as written.
- sourceText: in ${sourceLanguage}, copied verbatim from source; use one sentence only.
- originalAnswer: in ${targetLanguage}, copied verbatim from learner paragraph, containing flawed expression(s), corresponding with sourceText. Never silently correct it.
- referenceAnswer: in ${targetLanguage}, copied verbatim from reference, corresponding with originalAnswer.
- referenceMarked must reproduce the complete referenceAnswer exactly, adding only one or more attribute-free <mark>...</mark> pairs around ${targetLanguage} expressions that are worth learning and that the user didn't know how to use in originalAnswer. Mark meaningful words, collocations, or short frames rather than punctuation or an entire answer. Keep all unmarked text unchanged.
- minimalAnswer: in ${targetLanguage}, a corrected version of originalAnswer that is natural and has all issues fixed while preserving most of the learner's valid wording.
- minimalDiff must encode the complete originalAnswer-to-minimalAnswer content diff, include every unchanged portion as plain text and use <replace>, <add>, or <delete> to mark edits.
- Both hints must cover the same complete set of major problems on the card; never divide different errors between initialHint and deeperHint.
- initialHint identifies every major problem, briefly explains why each part needs attention, and gives only a non-revealing semantic or grammatical direction. It may quote the user's problematic wording so the issue is identifiable, but it must not supply any exact replacement word or phrase, corrected spelling or inflection, target-language answer fragment, directly usable structural template, or example that solves the current sentence. Never write the equivalent of “use X”, “replace X with Y”, “write X”, or “it should be X” in initialHint.
- deeperHint revisits every problem already named in initialHint and makes the same reasoning and correction directions more explicit for a user who needs more support. Do not replace earlier issues with different ones or introduce a separate list of errors. Here you may name candidate words, corrected short forms, collocations, or structural frames for each already-identified issue, but still must not provide a complete corrected clause or sentence.
- teacherNotes must contain exactly one entry for each major issue on the card, in the same issue order used by the hints. Each entry teaches that one issue as a complete lesson: connect the user's wording to the source intent, explain the relevant grammar, collocation, register, discourse, or context, and include any useful related knowledge, expressions, examples, or transfer guidance inside that same entry. Never create a separate entry solely for an example or extension. Do not combine unrelated major issues in one entry. Address the user naturally in the second person appropriate to ${feedbackLanguage}. Never refer to the user in the third person as “the learner” or “the student”.

RESTRICTED DIFF
- Diff text outside tags is unchanged on both sides.
- Allowed operations only: <delete>old</delete>, <add>new</add>, <replace><from>old</from><to>new</to></replace>.
- No attributes, Markdown, unknown tags, or nested operations.
- Escape literal &, <, and > as &amp;, &lt;, and &gt;.
- Use readable phrase/collocation/clause/word chunks. Do not fragment a phrase into single-word edits, and do not replace a whole sentence when replacing only the meaningful chunks communicate the change better.`;
}

const MULTI_ISSUE_EXAMPLE_INPUT: Generation1Input = {
	sourceParagraphs: [
		"鸦羽这个角色的特点始终围绕他与羽尾、叶池之间复杂而深沉的感情。",
		"褐皮的故事从未像鸦羽那样围绕爱情展开。她一直以极其独立、忠于影族的形象出现，那她为什么突然表现得像个少女？",
	],
	learnerParagraphs: [
		"The character feature of Crowfeather is always about his complex and deeply emotional relationships between Feathertail and Leafpool.",
		"Tawnypelt's story never unfolded around romance like Crowfeather. She has always appeared as a figure very independent and loyal to ShadowClan, but why does she suddenly behave like a teenage girl?",
	],
	referenceParagraphs: [
		"Crowfeather's character has always been defined by his complicated, deeply emotional relationships with Feathertail and Leafpool.",
		"Tawnypelt's story never revolved around romance like Crowfeather's story did. She has always been portrayed as fiercely independent and loyal to ShadowClan, so why is she suddenly acting like a teenage girl?",
	],
	sourceLanguage: "zh",
	targetLanguage: "en",
	feedbackLanguage: "zh",
	context: "一篇语气强烈但分析性的猫武士粉丝评论",
};

const MULTI_ISSUE_EXAMPLE_OUTPUT = {
	overallCommentary: "译文基本传达了主要批评态度，但几处直译式搭配不够自然，还有语序错误、误用转折关系和比较对象偏离等问题。",
	ratings: {
		accuracy: "A",
		naturalness: "B",
		grammar: "B",
		overall: "B",
	},
	cards: [
		{
			sourceText: "鸦羽这个角色的特点始终围绕他与羽尾、叶池之间复杂而深沉的感情。",
			originalAnswer:
				"The character feature of Crowfeather is always about his complex and deeply emotional relationships between Feathertail and Leafpool.",
			initialHint:
				"这句有两组主要问题：The character feature of… is about… 是不自然的直译，而且不能自然表达某种关系长期塑造角色；relationships between… 把“两段独立的感情”误表达为了“在二者之间挣扎”。请从句子主语和谓语框架、关系含义两方面调整。",
			deeperHint:
				"1. 让 Crowfeather's character 本身作主语，用表示「由……定义或塑造」的结构；\n2. 注意 with 和 between 的含义区别，对 relationships 改用合适的介词。",
			referenceAnswer:
				"Crowfeather's character has always been defined by his complicated, deeply emotional relationships with Feathertail and Leafpool.",
			referenceMarked:
				"Crowfeather's character has always been <mark>defined by</mark> his <mark>complicated, deeply emotional relationships with</mark> Feathertail and Leafpool.",
			minimalAnswer:
				"Crowfeather's character has always revolved around his complex and deeply emotional relationships with Feathertail and Leafpool.",
			minimalDiff:
				"<replace><from>The character feature of Crowfeather</from><to>Crowfeather's character</to></replace> <replace><from>is always about</from><to> has always revolved around</to></replace> his complex and deeply emotional <replace><from>relationships between</from><to>relationships with</to></replace> Feathertail and Leafpool.",
			teacherNotes: [
				"你写的 The character feature of X is about… 把中文句式逐词搬进了英语，主语冗长，而且 is about 无法充分表达「长期塑造角色」。作品分析中，可以让角色本身作主语：be defined by 强调构成核心，be shaped by 强调经历造成的变化，revolve around 强调叙事中心，例如 Her character is shaped by her loyalty to her clan。",
				"两段「复杂而深沉的感情」你使用了 relationships between Feathertail and Leafpool，容易被理解为他在这两只猫之间做选择，而不是多段感情本身及其塑造作用。可以用 relationships with 或 feelings for 自然引出人物，例如 His arc revolves around his complicated feelings for his family。",
			],
		},
		{
			sourceText: "褐皮的故事从未像鸦羽那样围绕爱情展开。",
			originalAnswer: "Tawnypelt's story never unfolded around romance like Crowfeather.",
			initialHint: "动词搭配“unfolded around romance”不符合英语习惯；“like Crowfeather”的比较结构不完整，容易引起歧义。",
			deeperHint: "1. 动词应用“revolve around”来对应“围绕……进行/展开”。\n2. 比较的对象是故事展开的动作（或故事），而不是猫本身，需要更换名词部分。",
			referenceAnswer: "Tawnypelt's story has never revolved around romance like Crowfeather's story did.",
			referenceMarked: "Tawnypelt's story has never <mark>revolved around romance</mark> <mark>like Crowfeather's story did</mark>.",
			minimalAnswer: "Tawnypelt's story never revolved around romance like Crowfeather's did.",
			minimalDiff:
				"Tawnypelt's story never <replace><from>unfolded around</from><to>revolved around</to></replace> romance <replace><from>like Crowfeather</from><to>like Crowfeather's did</to></replace>.",
			teacherNotes: [
				"你使用的“unfolded around romance”不是英语中的正常搭配。表示某事物以某个主题为中心时，常用“revolve around”，例如“The story revolves around the character's inner conflict”。而 unfold 表示事件或故事逐渐展开，通常不与 around 搭配，例如 The story unfolds over several years。",
				"表达“褐皮的故事没有围绕爱情展开，而鸦羽的故事却围绕爱情展开了”这层对比，既需要两个核心名词都是“故事”，又需要有动词来承载“围绕爱情展开”这层意思。这里的“Crowfeather's”等于“Crowfeather's story”，在英语里叫名词性所有格省略，语法正确而且更简洁。后面的动词既然和主句一样，自然用“did”替代 “revolved around romance”。它在语法上叫“代动词” (pro-verb)，作用类似代词代替名词。因为真正的谓语前面已经说了一次，要避免重复，就用助动词 do/did/does 来顶替。",
			],
		},
		{
			sourceText: "她一直以极其独立、忠于影族的形象出现，那她为什么突然表现得像个少女？",
			originalAnswer:
				"She has always appeared as a figure very independent and loyal to ShadowClan, but why does she suddenly behave like a teenage girl?",
			initialHint:
				"这句有三个主要问题：very independent 的后置语序不自然；appeared as 只像在说人物出场，没有体现作品对角色的一贯塑造；but 把前后写成转折关系，但原文是在根据既有形象追问反常表现。请分别调整性格描述的位置与强度、人物塑造视角和逻辑连接。",
			deeperHint:
				"1. 把性格描述放到自然的修饰位置，并可用 fiercely independent 体现「极其独立」；\n2. 把 appeared as 换成 be portrayed as 或 be depicted as 一类人物塑造框架；\n3. 可用 so 或 then 这类表示推论的连接方式引出 why 问句。",
			referenceAnswer:
				"She has always been portrayed as fiercely independent and loyal to ShadowClan, so why is she suddenly acting like a teenage girl?",
			referenceMarked:
				"She has always <mark>been portrayed as</mark> <mark>fiercely independent</mark> and loyal to ShadowClan, <mark>so</mark> why is she suddenly acting like a teenage girl?",
			minimalAnswer: "She has always been depicted as very independent and loyal to ShadowClan, so why does she suddenly behave like a teenage girl?",
			minimalDiff:
				"She has always <replace><from>appeared as a figure very independent</from><to>been depicted as very independent</to></replace> and loyal to ShadowClan, <replace><from>but</from><to>so</to></replace> why does she suddenly behave like a teenage girl?",
			teacherNotes: [
				"你把 very independent 放在 figure 后面，这种语序不符合英语规则，普通限定性形容词通常放在名词前。要传达「极其」的性格力度，考虑 fiercely independent、deeply conflicted 和 staunchly opposed 这类副词搭配。",
				"在 portray, depict, describe, regard, see, view, label, consider, think of 这类动词后，as 除了可以接名词短语外，还可以接形容词短语，用来补足对象的性质 (subject complement)。例如“He was labelled as problematic.”",
				"“appeared as”更强调人物实际以某种身份或状态出场；原文评论的是作品持续表现角色的某种形象，应选择表示描写或塑造的动词，如 depict 或 portray。对比 She appeared as a guest in the final episode 与 She is portrayed as fiercely independent，前者是出场身份，后者才是人物塑造。",
				"你用 but 把前后关系写成了转折，但原文是在依据一贯形象追问反常表现，更接近推论或结果。可以用 so 引出质疑，例如“She's always been independent, so why is she suddenly acting like this?”，你也可以重组问句表达相同逻辑。",
			],
		},
	],
};

const NO_CARDS_EXAMPLE_INPUT: Generation1Input = {
	sourceParagraphs: ["谢谢你这么快回复。我期待下周和你见面。"],
	learnerParagraphs: ["Thank you for getting back to me so quickly. I look forward to seeing you next week."],
	referenceParagraphs: ["Thank you for your quick reply. I look forward to seeing you next week."],
	sourceLanguage: "zh",
	targetLanguage: "en",
	feedbackLanguage: "zh",
	context: "礼貌的工作邮件",
};

const NO_CARDS_EXAMPLE_OUTPUT = {
	overallCommentary: "译文准确、自然，语气符合礼貌的工作邮件；与参考译文不同的措辞同样地道，不需要单独修改。",
	ratings: {
		accuracy: "A",
		naturalness: "A",
		grammar: "A",
		overall: "A",
	},
	cards: [],
};

function taskPayload(input: Generation1Input) {
	return {
		sourceLanguage: getLanguageEnglishName(input.sourceLanguage),
		targetLanguage: getLanguageEnglishName(input.targetLanguage),
		feedbackLanguage: getLanguageEnglishName(input.feedbackLanguage),
		context: input.context,
		paragraphs: input.sourceParagraphs.map((source, paragraphIndex) => ({
			paragraphIndex,
			source,
			learnerAnswer: input.learnerParagraphs[paragraphIndex],
			authenticReference: input.referenceParagraphs[paragraphIndex],
		})),
	};
}

export function buildGeneration1Messages(input: Generation1Input): ChatMessage[] {
	const messages: ChatMessage[] = [
		{ role: "system", content: generation1SystemPrompt(input) },
		{ role: "user", content: JSON.stringify({ kind: "format_example", task: taskPayload(MULTI_ISSUE_EXAMPLE_INPUT) }) },
		{ role: "assistant", content: JSON.stringify(MULTI_ISSUE_EXAMPLE_OUTPUT) },
		{ role: "user", content: JSON.stringify({ kind: "format_example", task: taskPayload(NO_CARDS_EXAMPLE_INPUT) }) },
		{ role: "assistant", content: JSON.stringify(NO_CARDS_EXAMPLE_OUTPUT) },
	];
	messages.push({ role: "user", content: JSON.stringify({ kind: "real_task", task: taskPayload(input) }) });
	return messages;
}

export type CorrectionVerifierInput = {
	card: ValidatedGeneration1Card;
	learnerRevision: string;
	displayedHint: string;
	targetLanguage: string;
	feedbackLanguage: string;
};

function correctionVerifierSystemPrompt(targetLanguage: string, feedbackLanguage: string): string {
	return `Verify one learner revision as an exacting but fair ${targetLanguage} translation tutor. The server assembles the supplied JSON; learnerRevision is the only untrusted learner-authored field.

FIELD MEANINGS
- sourceText is rough source-language context. It can be less precise than referenceAnswer and is never the primary semantic authority.
- originalAnswer is the user's own first target-language answer. It is not an answer key or a source of required meaning.
- learnerRevision is the user's current edited answer that you must verify.
- referenceAnswer is the primary trusted baseline for required concepts and communicative intent. Its exact wording, synonym choice, and fine-grained intensity are optional, but its interpretation takes priority over sourceText when they do not align.
- minimalAnswer is one possible minimal correction, not an answer key or a source of extra semantic requirements.
- teacherNotes are trusted Generation 1 tutor diagnoses of the card's major issues.
- displayedHint is the hint already shown to the user for this attempt. It does not limit which problems you must inspect.

INDEPENDENT DECISION PROCESS
- Judge learnerRevision against the intended meaning represented by referenceAnswer, while accepting defensible paraphrases and differences in emphasis. If sourceText, originalAnswer, or minimalAnswer contains a detail that referenceAnswer does not require, do not require that detail or treat its removal as a new error.
- Use teacherNotes and hints as diagnoses to recheck, not authoritative wording or lexical rankings. An issue is resolved when a natural alternative conveys the same practical meaning; do not reject a phrase such as “really fond of” merely because referenceAnswer uses “love”. Then check the complete revision for new material errors.

Return exactly three checks: allCardIssuesResolved (no material diagnosed issue remains), noNewErrors (no material meaning error relative to referenceAnswer, or grammar, usage, or register error, was introduced), and fullyNatural (the complete revision is idiomatic and contextually appropriate). A defensible nuance or emphasis difference is not an error. Accept only when all three are true.

For reject, return {"verdict":"reject","checks":{"allCardIssuesResolved":bool,"noNewErrors":bool,"fullyNatural":bool},"feedback":"..."}. Write concise feedback in ${feedbackLanguage}; diagnose only the failed checks without giving candidate replacement wording or exposing referenceAnswer/minimalAnswer.

For accept, return {"verdict":"accept","checks":{"allCardIssuesResolved":true,"noNewErrors":true,"fullyNatural":true},"acceptedDiff":"..."}. acceptedDiff must cover the complete originalAnswer-to-learnerRevision text, preserving unchanged text and marking edits only with <delete>, <add>, or <replace><from>...</from><to>...</to></replace>. Return JSON only with exactly the chosen verdict's fields.`;
}

function correctionRevisionPayload(input: CorrectionVerifierInput) {
	return {
		cardOrdinal: input.card.ordinal,
		sourceText: input.card.sourceText,
		originalAnswer: input.card.originalAnswer,
		referenceAnswer: input.card.referenceAnswer,
		teacherNotes: input.card.teacherNotes,
		displayedHint: input.displayedHint,
		learnerRevision: input.learnerRevision,
	};
}

export function buildCorrectionVerifierMessages(input: CorrectionVerifierInput): ChatMessage[] {
	const targetLanguage = getLanguageEnglishName(input.targetLanguage);
	const feedbackLanguage = getLanguageEnglishName(input.feedbackLanguage);
	const payload = {
		...correctionRevisionPayload(input),
		initialHint: input.card.initialHint,
		deeperHint: input.card.deeperHint,
		minimalAnswer: input.card.minimalAnswer,
	};
	return [
		{ role: "system", content: correctionVerifierSystemPrompt(targetLanguage, feedbackLanguage) },
		{ role: "user", content: JSON.stringify(payload) },
	];
}

export type SecondDraftVerifierInput = {
	generation1History: ChatMessage[];
	secondDraftParagraphs: string[];
	cardCount: number;
	cardOutcomes: Array<{ ordinal: number; outcome: "passed" | "revealed" }>;
	targetLanguage: string;
	feedbackLanguage: string;
};

export function buildSecondDraftVerifierMessages(input: SecondDraftVerifierInput): ChatMessage[] {
	const targetLanguage = getLanguageEnglishName(input.targetLanguage);
	const feedbackLanguage = getLanguageEnglishName(input.feedbackLanguage);
	return [
		...input.generation1History,
		{
			role: "system",
			content: `Verify whether a learner's complete second draft resolves every correction card from the trusted Generation 1 evaluation. Evaluate the meaning and naturalness of the complete ${targetLanguage} draft, not exact reference wording. Return each card ordinal exactly once.

Write commentary entirely in ${feedbackLanguage}. When a card remains unresolved, explain the remaining issue without quoting, reproducing, translating, paraphrasing, or hinting at referenceAnswer/minimalAnswer or another complete correct sentence. Do not provide copyable answers.

Return JSON only: {"cards":[{"ordinal":0,"resolved":true}],"commentary":"..."}. Do not add fields.`,
		},
		{
			role: "user",
			content: JSON.stringify({ cardCount: input.cardCount, cardOutcomes: input.cardOutcomes, secondDraftParagraphs: input.secondDraftParagraphs }),
		},
	];
}

export type Generation2Input = {
	cards: ValidatedGeneration1Card[];
	sourceLanguage: string;
	targetLanguage: string;
};

export function buildGeneration2Messages(input: Generation2Input): ChatMessage[] {
	const sourceLanguage = getLanguageEnglishName(input.sourceLanguage);
	const targetLanguage = getLanguageEnglishName(input.targetLanguage);
	return [
		{
			role: "system",
			content: `Turn correction cards into reusable ${targetLanguage} vocabulary notes for a learner whose native language is ${sourceLanguage}.

Return JSON only: {"notes":[{"sourceCardOrdinals":[0],"vocab":"...","targetDefinition":"...","nativeDefinition":"...","examples":[{"targetText":"...","nativeText":"..."},{"targetText":"...","nativeText":"..."},{"targetText":"...","nativeText":"..."},{"targetText":"...","nativeText":"..."}]}]}.

CONTRACT
- Cover every supplied card ordinal exactly once across all notes. Never omit or duplicate an ordinal.
- Infer the concrete ${targetLanguage} vocabulary the learner failed to know or use correctly from referenceAnswer and minimalAnswer. Teacher notes are supporting context; never extract an incidental example that is not part of the correction.
- vocab must be the exact reusable ${targetLanguage} expression: choose a single word when the learner needs that word itself, or a lexical chunk when this context requires a fixed or semi-fixed collocation, phrasal verb, fixed phrase, idiom, or functional formula. Never output an abstract grammar pattern, sentence structure, study instruction, slash-separated bundle, or the learner's incorrect wording.
- Merge cards only when they teach the same vocab. If one card has unrelated issues, select its most transferable corrected word or lexical chunk. When uncertain, keep cards separate.
- targetDefinition is a concise dictionary-style definition entirely in ${targetLanguage}. nativeDefinition is the equivalent concise dictionary-style definition entirely in ${sourceLanguage}. Neither field is a grammar lesson.
- Every note has exactly four distinct examples in varied everyday situations. Each targetText is an independently natural ${targetLanguage} sentence that uses vocab, allowing grammatically required inflection. Each nativeText is an independently natural ${sourceLanguage} translation with exactly the same meaning.
- Do not force every detail from the correction card into an example. Before returning, silently audit every pair for meaning preservation, word forms, grammar, register, and collocation; rewrite anything a native speaker would find awkward.
- Do not add fields.`,
		},
		{
			role: "user",
			content: JSON.stringify({
				cards: input.cards.map((card) => ({
					ordinal: card.ordinal,
					sourceText: card.sourceText,
					originalAnswer: card.originalAnswer,
					referenceAnswer: card.referenceAnswer,
					minimalAnswer: card.minimalAnswer,
					teacherNotes: card.teacherNotes,
				})),
			}),
		},
	];
}
