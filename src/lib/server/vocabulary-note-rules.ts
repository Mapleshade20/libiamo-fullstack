import { NOTE_EXAMPLE_COUNT } from "$lib/note";

/**
 * The rules every generated vocabulary Note follows, shared by practice-feedback Notes and
 * translation Generation 2 so both sources teach vocabulary the same way. Callers add their own
 * source-specific rules (which input to derive vocab from, coverage, limits) around these.
 */
export function vocabularyNoteRules(targetLanguage: string, nativeLanguage: string): string[] {
	return [
		`vocab must be the exact reusable ${targetLanguage} expression: choose a single word when the learner needs that word itself, or a lexical chunk when this context requires a fixed or semi-fixed collocation, phrasal verb, fixed phrase, idiom, or functional formula. Never output an abstract grammar pattern, sentence structure, study instruction, slash-separated bundle, or the learner's incorrect wording.`,
		`targetDefinition is a concise dictionary-style definition entirely in ${targetLanguage}. nativeDefinition is the equivalent concise dictionary-style definition entirely in ${nativeLanguage}. Neither field is a grammar lesson or study advice.`,
		`Every note has exactly ${NOTE_EXAMPLE_COUNT} distinct examples in varied everyday situations. Each targetText is an independently natural ${targetLanguage} sentence that uses vocab, allowing grammatically required inflection. Each nativeText is an independently natural ${nativeLanguage} translation with exactly the same meaning. Never write cloze prompts, definitions, fragments, or copies with only names changed.`,
		"Do not force every detail of the source into an example. Before returning, silently audit every pair for meaning preservation, word forms, grammar, register, and collocation; rewrite anything a native speaker would find awkward.",
		"Do not add fields.",
	];
}
