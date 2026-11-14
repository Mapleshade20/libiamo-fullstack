import type { Fixture } from "./types.ts";

// Real post: an American English speaker learning Spanish (MexicoCity), lightly cut at the end where Reddit truncated it.
export const esCdmx: Fixture = {
	draft: {
		id: "es-cdmx",
		title:
			"¿Donde puedo ir a la Ciudad de México que es agradable para vivir pero sin muchos angloparlantes? Para practicar me español con inmersión",
		text: "Hola, yo voy vivo en la Ciudad de México la próxima año, en el barrio Obrera. Mi español no es muy bueno pero quiero practicar y ser fluido. \n\nI want to be in a position where I’m forced to speak Spanish as with the hours I work I won’t be able to spend more time on Spanish classes. From what I hear from other expats and nomads etc., all the best places to live in CDMX are full of gringos and otherwise locals who speak great English, obviously nothing against gringos but I won’t learn Spanish if I’m spending time with English speakers. \n\nI also of course don’t want to necessarily live somewhere that will be dangerous for someone who does not speak very good Spanish. \n\nPor favor responda en español jajaja",
		background:
			"A post for r/MexicoCity. I'm moving to Colonia Obrera next year and want to live somewhere I'm forced to speak Spanish, not in gringo areas, but still safe. Asking for neighborhood suggestions, answers in Spanish please.",
		target: "es",
		learner: "en",
		level: "B1",
		scene: {
			platform: "Reddit, a post in r/MexicoCity",
			audience: "Mexican redditors and residents of Mexico City",
			purpose: "ask for neighborhoods that are pleasant, safe and low in English speakers, for Spanish immersion",
		},
	},
	gold: [
		{
			id: "yo-voy-vivo",
			at: "yo voy vivo",
			route: "p1",
			fix: "voy a vivir",
			why: "Near future is ir a + infinitive; the pronoun is also unnecessary.",
		},
		{
			id: "proxima-ano",
			at: "la próxima año",
			route: "p1",
			fix: "el próximo año",
			why: "Año is masculine, so article and adjective are el próximo.",
		},
		{
			id: "barrio",
			at: "el barrio Obrera",
			route: "p1",
			fix: "la colonia Obrera",
			optional: true,
			why: "In Mexico City neighborhoods are called colonias; the Colonia Obrera is feminine.",
		},
		{
			id: "en-1",
			at: "I want to be in a position where I’m forced to speak Spanish as with the hours I work I won’t be able to spend more time on Spanish classes.",
			route: "p2",
			why: "Written in English: the writer's main goal (a place that forces daily Spanish, since there is no time for more classes) must be said in Spanish.",
		},
		{
			id: "en-2",
			at: "From what I hear from other expats and nomads etc., all the best places to live in CDMX are full of gringos and otherwise locals who speak great English,",
			route: "p2",
			why: "Written in English: the reason the usual expat areas are ruled out.",
		},
		{
			id: "en-3",
			at: "obviously nothing against gringos but I won’t learn Spanish if I’m spending time with English speakers.",
			route: "p2",
			why: "Written in English: a softened disclaimer plus the consequence; tone matters in a local sub.",
		},
		{
			id: "en-4",
			at: "I also of course don’t want to necessarily live somewhere that will be dangerous for someone who does not speak very good Spanish.",
			route: "p2",
			why: "Written in English: the safety constraint.",
		},
		{
			id: "responda",
			at: "responda",
			route: "p1",
			fix: "respondan",
			optional: true,
			why: "Addressing the whole thread, the plural command respondan (or conteste/contesten) is more natural than singular usted.",
		},
	],
	spots: [
		{
			id: "en-1",
			at: "I want to be in a position where I’m forced to speak Spanish as with the hours I work I won’t be able to spend more time on Spanish classes.",
			mode: "given",
			readings: ["I want to live somewhere I am pushed to speak Spanish every day, because my work hours leave no time for more classes."],
			why: "The core request, left in English; the Spanish needs a natural way to say 'forced to speak' and 'no time for classes'.",
			refs: [
				"Quiero vivir en un lugar donde [me vea obligado a hablar español], porque con mi horario de trabajo no voy a poder [tomar más clases].",
				"Busco una zona donde [tenga que hablar español] todos los días, ya que con mis horas de trabajo [no me alcanza el tiempo] para más clases.",
				"Quiero que [el entorno me obligue] a usar el español, porque no puedo [dedicarle más tiempo] a las clases.",
			],
		},
		{
			id: "en-2",
			at: "From what I hear from other expats and nomads etc., all the best places to live in CDMX are full of gringos and otherwise locals who speak great English,",
			mode: "given",
			readings: ["Expats and digital nomads say the nicest areas of CDMX are full of gringos, or of locals who speak very good English."],
			why: "Reported hearsay about expat areas; the Spanish needs a way to attribute it and name the two groups.",
			refs: [
				"Por lo que [he escuchado] de otros expats y nómadas digitales, las mejores zonas de la CDMX están [llenas de gringos] o de gente que [habla muy bien inglés],",
				"Según [me dicen] otros extranjeros y nómadas, en las colonias más [bonitas] de la CDMX hay [puros gringos] o locales que [hablan inglés perfecto],",
				"Lo que [he oído] es que las mejores colonias de la CDMX están [llenas de gringos] y de mexicanos que [hablan muy bien inglés],",
			],
		},
		{
			id: "en-3",
			at: "obviously nothing against gringos but I won’t learn Spanish if I’m spending time with English speakers.",
			mode: "given",
			readings: ["I have nothing against gringos, but I will not learn Spanish if I spend my time with English speakers."],
			why: "A polite disclaimer followed by the consequence; the Spanish needs the right softening for a Mexican audience.",
			refs: [
				"No tengo nada [en contra] de los gringos, pero [no voy a aprender] español si [me la paso con] angloparlantes.",
				"Obvio no tengo nada [contra] los gringos, pero si [convivo con] gente que habla inglés, [no voy a aprender] español.",
				"No es que [tenga algo] contra los gringos, pero [no voy a aprender] español [rodeado de] angloparlantes.",
			],
		},
		{
			id: "en-4",
			at: "I also of course don’t want to necessarily live somewhere that will be dangerous for someone who does not speak very good Spanish.",
			mode: "given",
			readings: ["I also do not want to live somewhere dangerous for a person whose Spanish is not good."],
			why: "The safety constraint; the awkward 'don't want to necessarily' needs a natural Spanish shape.",
			refs: [
				"Tampoco quiero vivir en un lugar [peligroso] para alguien que [no habla muy bien] español.",
				"Y claro, [tampoco busco] una zona [insegura] para una persona que [apenas habla] español.",
				"Además, [no quiero] terminar en una colonia [peligrosa] por [no dominar] el español.",
			],
		},
	],
	provenance:
		"Real Reddit post (https://www.reddit.com/r/MexicoCity/comments/1613aei/donde_puedo_ir_a_la_ciudad_de_méxico_que_es/), fetched 2026-10-23; gold drafted by an assistant and needs human review.",
};
