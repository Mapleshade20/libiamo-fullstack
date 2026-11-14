// The hint ladder from rehearsal.html, as plain text: skeleton (content words hidden) → initials → the whole sentence.
// Function words stay visible, per target language. Japanese (no spaces) still needs its own approach.

const FUNCTION_WORDS: Record<string, Set<string>> = {
	en: new Set(
		"i i'm me my he he'd his him she her they them their it its it's we us our you your the a an to of in on at for and but or so that which who when where why whenever even back with about was were is are be been have had has do did didn't couldn't wasn't wouldn't would not no this these those all some any as if then than also just really very will can could might may much too more because though before after up out what how one don't can't".split(
			" ",
		),
	),
	es: new Set(
		"yo me mi mis tú te tu tus usted él lo le se su sus ella la nosotros nos nuestro nuestra vosotros os ustedes ellos ellas los les el un una unos unas de del a al en con por para sin sobre y e o u pero que qué quien quién cuando cuándo donde dónde como cómo porque si no ni ya muy más menos también tan es son era eran fue fueron ser estar está están estaba estoy soy he ha han había hay este esta estos estas ese esa eso esto lo todo toda todos todas algo nada cada otro otra mucho poco bien aquí allí".split(
			" ",
		),
	),
	fr: new Set(
		"je j' me m' moi mon ma mes tu te t' toi ton ta tes il elle on se s' son sa ses nous notre nos vous votre vos ils elles leur leurs le la l' les un une des du de d' à au aux en dans sur pour par avec sans et ou mais donc que qu' qui quand où comme si ne n' pas plus très aussi est sont était étaient être ai a ont avait ce c' cet cette ces ça cela tout tous toute toutes bien y".split(
			" ",
		),
	),
};

function maskWords(s: string, lang: string, content: (w: string, key: boolean) => string): string {
	const fn = FUNCTION_WORDS[lang] ?? FUNCTION_WORDS.en;
	const body = s.replace(/\[([^\]]+)\]/g, "\u0000$1\u0001");
	return (
		body
			// biome-ignore lint/suspicious/noControlCharactersInRegex: NUL and SOH are this function's own brackets, never in learner text
			.split(/(\u0000[^\u0001]*\u0001|[\p{L}'’]+)/u)
			.map((part) => {
				if (part.startsWith("\u0000")) return content(part.slice(1, -1), true);
				if (!/^[\p{L}'’]+$/u.test(part)) return part;
				if (fn.has(part.toLowerCase().replace(/’/g, "'")) || /\p{Lu}/u.test(part)) return part;
				return content(part, false);
			})
			.join("")
	);
}

export const plain = (s: string) => s.replace(/\[([^\]]+)\]/g, "$1");
export const skeleton = (ref: string, lang = "en") => maskWords(ref, lang, (w, key) => (key ? "____" : "·".repeat(Math.min(w.length, 8))));
export const initials = (ref: string, lang = "en") =>
	maskWords(ref, lang, (w) =>
		w
			.split(/\s+/)
			.map((x) => `${x[0]}…`)
			.join(" "),
	);
export const rung = (ref: string, n: number, lang = "en") => [skeleton, initials, (r: string) => plain(r)][Math.min(n, 3) - 1](ref, lang);
