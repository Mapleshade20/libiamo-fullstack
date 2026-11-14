import type { Fixture } from "./types.ts";

// Real post: an American English speaker learning Spanish (AskMexico), lightly cut at the end where Reddit truncated it.
export const esNarcos: Fixture = {
	draft: {
		id: "es-narcos",
		title: "Que delicado es el tema de narcotraficante en México?",
		text: "Hola, soy de los Estados Unidos y estoy tomando clases de español con un tutor en México. Cuando yo estaba hablando con él sobre mis otros formas de práctica mencioné que veo el serie, Narcos México, para entender español hablado más mejor. Sin embargo cuando lo dije él veía muy incómodo/nervioso. ¿Estuvo mal mencionarlo?   \nPerdón si mi español no es muy bueno.",
		background:
			"Asking r/AskMexico whether I did something wrong by telling my Mexico-based Spanish tutor that I watch Narcos: Mexico to practice listening. He seemed uneasy and I want to know if the topic is touchy.",
		target: "es",
		learner: "en",
		level: "B1",
		scene: {
			platform: "Reddit, a post in r/AskMexico",
			audience: "Mexican redditors",
			purpose: "ask whether mentioning a narco show to a Mexican tutor was a mistake, and apologize for imperfect Spanish",
		},
	},
	gold: [
		{
			id: "cuando-yo",
			at: "Cuando yo estaba",
			route: "p1",
			fix: "Cuando estaba",
			optional: true,
			why: "The subject pronoun is redundant; the verb ending already says who.",
		},
		{
			id: "otros-formas",
			at: "otros formas",
			route: "p1",
			fix: "otras formas",
			why: "Gender agreement: forma is feminine, so the adjective is otras.",
		},
		{ id: "el-serie", at: "el serie", route: "p1", fix: "la serie", why: "Serie is feminine." },
		{ id: "mas-mejor", at: "más mejor", route: "p1", fix: "mejor", why: "Mejor is already comparative; más mejor is not used." },
		{
			id: "sin-embargo",
			at: "Sin embargo cuando",
			route: "p1",
			fix: "Sin embargo, cuando",
			optional: true,
			why: "Sin embargo is set off by a comma.",
		},
		{
			id: "el-veia",
			at: "él veía",
			route: "p1",
			fix: "se veía",
			why: "To look/seem a certain way is verse (se veía) with an adjective; veía alone means 'he saw'.",
		},
		{
			id: "incomodo-nervioso",
			at: "incómodo/nervioso",
			route: "p2",
			why: "Slash hesitation between two different feelings: uncomfortable (awkward) versus nervous (afraid). The writer must pick, and the choice changes how the question reads.",
		},
	],
	spots: [
		{
			id: "incomodo-nervioso",
			at: "incómodo/nervioso",
			mode: "ask",
			readings: [
				"He looked uncomfortable or awkward about the topic.",
				"He looked nervous or afraid, as if the topic could be risky to talk about.",
				"Both, he seemed tense and uneasy.",
			],
			why: "Incómodo and nervioso are different reactions; which one the writer saw changes the answer they will get about whether the topic is dangerous or just awkward.",
			refs: [
				"Cuando se lo dije, [se puso muy incómodo].",
				"Cuando lo dije, él [se veía muy nervioso].",
				"Cuando se lo mencioné, [se notó] que [se puso tenso] y [como incómodo].",
			],
		},
	],
	provenance:
		"Real Reddit post (https://www.reddit.com/r/AskMexico/comments/1taosp9/que_delicado_es_el_tema_de_narcotraficante_en/), fetched 2026-10-23; gold drafted by an assistant and needs human review.",
};
