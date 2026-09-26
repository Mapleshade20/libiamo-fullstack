export type TranslationEvaluationLiveDemoTask = {
	title: string;
	description: string;
	context: string;
	sourceLanguage: string;
	targetLanguage: string;
	feedbackLanguage: string;
	sourceParagraphs: string[];
	defaultLearnerParagraphs: string[];
	referenceParagraphs: string[];
};

export const LIVE_DEMO_TEMPERATURE = {
	min: 0,
	max: 1,
	step: 0.1,
	default: 0.4,
} as const;

/** The complete Warriors example from docs/references/2026-07-15.md. */
export const TRANSLATION_EVALUATION_LIVE_DEMO_TASK: TranslationEvaluationLiveDemoTask = {
	title: "Crowfeather and Tawnypelt",
	description: "Translate a strongly worded Warriors fandom commentary from Chinese into natural English.",
	context:
		"A strongly worded but analytical Warriors fandom commentary criticizing Crowfeather and Tawnypelt becoming a couple. Preserve the writer's frustrated, conversational fan-discussion voice and franchise terminology.",
	sourceLanguage: "zh",
	targetLanguage: "en",
	feedbackLanguage: "zh",
	sourceParagraphs: [
		"我该从何说起呢？鸦羽和褐皮成为一对伴侣简直荒谬至极。这完全没有铺垫，对两人来说都极其不符合角色设定。它还削弱了他们既有故事和关系中那些重要部分，为了一个我们压根没要求过的配对，重写了多年的世界观。",
		"鸦羽这个角色的特点始终围绕他与羽尾、叶池之间复杂而深沉的情感纠葛，以及这些爱恋对他留下的持久影响。把他硬塞进与褐皮的恋情里，完全无视了那些长期以来塑造他的情感包袱和成长历程。同样，褐皮的故事从未像鸦羽那样围绕爱情展开。她一直以极其独立、忠于影族的形象出现，那她为什么突然表现得像个少女？",
		"别误会，我很喜欢两只年长一些的猫在各自伴侣去世后再次相爱的想法——但这两只猫绝不是适合这种发展的角色。",
	],
	defaultLearnerParagraphs: [
		"Where should I start? There's nothing more ridiculous than Crowfeather and Tawnypelt becoming mates. This has no set up at all, and is extremely out of character for both of them. It also weakens the crucial parts in their existing stories and bonds, rewriting the whole backstory going for years, for a ship we have never asked for.",
		"The character feature of Crowfeather is always about his emotional struggles between Feathertail and Leafpool, and their long-lasting impact on him. Brutely tugging him into a romance with Tawnypelt completely disregards the emotional baggage and personal growth that have shaped him for a long time. On the other hand, Tawnypelt's story never unfolded around romance like Crowfeather. She has always appeared as a figure very independent and loyal to ShadowClan, but why does she suddenly behave like a teenage girl?",
		"Don't get me wrong. I like the idea of two older cats falling in love again after their respective mates passed away--but these two are definitely not for that.",
	],
	referenceParagraphs: [
		"Where do I even start? Crowfeather and Tawnypelt as a couple is ridiculous. There was absolutely no buildup to it, and it feels completely out of character for both of them. It also undermines major parts of their established stories and relationships and rewrites years of lore for the sake of a pairing that we literally never asked for.",
		"Crowfeather's character has always been defined by his complicated, deeply emotional relationships with Feathertail and Leafpool and the lasting impact those loves had on him. Throwing him into a romance with Tawnypelt ignores the emotional baggage and growth that have shaped him for so long. Likewise, Tawnypelt's story has never revolved around romance in the way Crowfeather's has. She's been portrayed as fiercely independent, devoted to ShadowClan, so why has she suddenly started acting like a teenage girl?",
		"Don't get me wrong, I love the idea of two older cats falling in love even after the deaths of their respective mates--but these two are not the characters for that.",
	],
};
