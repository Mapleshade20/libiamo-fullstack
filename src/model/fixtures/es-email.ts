import type { Fixture } from "./types.ts";

// Authored realistic English-speaker draft (B1) for a Spanish email to a homestay / school owner.
export const esEmail: Fixture = {
	draft: {
		id: "es-email",
		title: "Un mes de curso en septiembre",
		text: "Estimada Sra. Morales:\n\nMi nombre es Daniel y yo soy de Manchester, en Inglaterra. Le escribo porque quiero aplicar para el curso de septiembre. Vengo por mejorar mi español: mi novia es de Granada, conocí a su familia el año pasado pero no entendí casi nada, y estoy muy excitado de aprender para poder hablar con ellos.\n\n¿Es posible que usted me envía información sobre los precios? También tengo algunas preguntas. Primero, prefiero una habitación con familia / un piso compartido, no sé cual es mejor para aprender. ¿Es el piso cerca de la escuela? Necesito una habitación tranquilo para estudiar. Segundo, ¿puedo traer mi bicicleta? Me gusta montar en bici y quiero explorar las montañas. Tercero, soy vegetariano (I'm not picky but I don't eat meat) y espero que la familia puede cocinar algo para mí. Mi novia viene conmigo el primer fin de semana.\n\n¿Me puedes decir cuándo empiezan los cursos? Necesito una respuesta antes de fin de mes porque tengo que comprar el vuelo. Estoy seguro de que voy a tener un buen tiempo en su escuela. Mirando adelante a oír de usted.\n\nSaludos,\nDaniel Clarke",
		background:
			"An email to Mrs Morales, who runs a small language school with homestays in Granada. I want to come for a month in September to improve my Spanish (my girlfriend is from Granada and I couldn't follow her family when I met them). I'm asking about prices, the room, my bike, and food, and I need an answer soon because of flights. I'm not sure how formal to be.",
		target: "es",
		learner: "en",
		level: "B1",
		scene: {
			platform: "email",
			audience: "the owner of a small language school and homestay in Granada, a stranger",
			purpose: "arrange a month-long stay: ask about prices, dates, room type, bringing a bike and vegetarian food",
		},
	},
	gold: [
		{
			id: "yo-soy",
			at: "yo soy",
			route: "p1",
			fix: "soy",
			why: "Subject pronoun is unnecessary in Spanish; the verb ending already says who.",
			optional: true,
		},
		{
			id: "aplicar",
			at: "aplicar para",
			route: "p1",
			fix: "inscribirme en",
			why: "'Aplicar' is a false friend of English 'apply'; for a course you 'inscribirse en' or 'solicitar plaza en'.",
		},
		{ id: "por-para", at: "por mejorar", route: "p1", fix: "para mejorar", why: "Purpose before an infinitive is 'para', not 'por'." },
		{
			id: "imperf",
			at: "no entendí casi nada",
			route: "p1",
			fix: "no entendía casi nada",
			why: "A state that lasted through the visit reads more naturally in the imperfect; the preterite is possible but sounds like a single closed event.",
			optional: true,
		},
		{
			id: "excitado",
			at: "excitado de aprender",
			route: "p1",
			fix: "ilusionado por aprender",
			why: "'Excitado' means sexually aroused; for 'excited' use 'ilusionado' or 'emocionado' (or 'con muchas ganas de').",
		},
		{ id: "subj-envie", at: "me envía", route: "p1", fix: "me envíe", why: "'¿Es posible que...?' takes the subjunctive." },
		{ id: "cual", at: "cual es mejor", route: "p1", fix: "cuál es mejor", why: "Interrogative 'cuál' in an indirect question needs the accent." },
		{ id: "ser-estar", at: "¿Es el piso cerca", route: "p1", fix: "¿Está el piso cerca", why: "Location uses 'estar', not 'ser'." },
		{ id: "tranquila", at: "tranquilo", route: "p1", fix: "tranquila", why: "Adjective must agree with feminine 'habitación'." },
		{ id: "subj-pueda", at: "la familia puede", route: "p1", fix: "la familia pueda", why: "'Espero que' takes the subjunctive." },
		{
			id: "puedes",
			at: "puedes",
			route: "p1",
			fix: "puede",
			why: "The email addresses a stranger as 'usted' (Le escribo, usted); 'puedes' switches to tú mid-message.",
		},
		{
			id: "buen-tiempo",
			at: "voy a tener un buen tiempo",
			route: "p1",
			fix: "voy a pasarlo muy bien",
			why: "'Tener un buen tiempo' is a calque of 'have a good time'; Spanish says 'pasarlo bien'.",
		},
		{
			id: "M1",
			at: "una habitación con familia / un piso compartido",
			route: "p2",
			why: "The writer left both options in; only they know whether they want the homestay, the flat, or are asking for advice.",
		},
		{
			id: "M2",
			at: "(I'm not picky but I don't eat meat)",
			route: "p2",
			why: "Left in English; the writer must decide what exactly to say (does he eat fish, eggs, dairy? is he flexible?).",
		},
		{
			id: "M3",
			at: "Mi novia viene conmigo el primer fin de semana.",
			route: "p2",
			why: "A bare statement that may be an implicit request (can she stay?) or just information; only the writer knows.",
		},
		{
			id: "F1",
			at: "Necesito una respuesta antes de fin de mes",
			route: "p2",
			why: "'Necesito' is blunt for a first email to a stranger; Spanish email norms soften the request with a reason first or a conditional.",
		},
		{
			id: "F2",
			at: "Mirando adelante a oír de usted.",
			route: "p2",
			why: "Calque of 'Looking forward to hearing from you'; Spanish closes with a different formula.",
		},
	],
	spots: [
		{
			id: "M1",
			at: "una habitación con familia / un piso compartido",
			mode: "ask",
			readings: [
				"I would prefer the homestay with a family, but I am also open to the shared flat.",
				"I can't decide between the two and would like her advice on which is better for learning.",
				"I want to compare the prices and options of both before choosing.",
			],
			why: "The slash leaves two options and the next clause says the writer doesn't know which is better, so the sentence says 'I prefer' and 'I don't know' at once.",
			refs: [
				"Todavía no sé si prefiero una habitación con una familia o un piso compartido; ¿qué [me] [recomendaría] para aprender más?",
				"[Me gustaría] alojarme con una familia, pero [estoy abierto] a un piso compartido.",
				"No me [decido] entre una habitación con familia y un piso compartido; ¿[podría explicarme] cómo son?",
			],
		},
		{
			id: "M2",
			at: "(I'm not picky but I don't eat meat)",
			mode: "ask",
			readings: [
				"I am vegetarian but easy to feed: I don't eat meat, and anything else is fine (fish, eggs and dairy included).",
				"I don't eat meat or fish, and would like that respected, but I don't need special dishes.",
				"I don't mind much, I just want to warn her.",
			],
			why: "The parenthesis in English hides a real decision: what does he eat, and how much effort is he asking of the family? Only the writer can say.",
			refs: [
				"soy vegetariano, pero [no soy exigente]: como huevos y lácteos, [solo no como carne]",
				"soy vegetariano, no como ni carne ni pescado, [aunque no necesito] [platos especiales]",
				"soy vegetariano; [no pido nada especial], solo que [no haya] carne en mis comidas",
			],
		},
		{
			id: "M3",
			at: "Mi novia viene conmigo el primer fin de semana.",
			mode: "ask",
			readings: [
				"My girlfriend will visit during the first weekend and I'd like to know whether she can stay with me at the house.",
				"My girlfriend is only coming with me to settle in, and will stay elsewhere; this is just information.",
				"She travels with me and I'd like to be picked up or shown around together.",
			],
			why: "The sentence gives a fact but not its point; the owner cannot tell whether a question is being asked.",
			refs: [
				"Mi novia me [acompañará] el primer fin de semana; ¿[sería posible] que [se quedara] también en la casa?",
				"Mi novia me [acompañará] el primer fin de semana, pero [se alojará] en casa de su familia.",
				"El primer fin de semana vendrá [también] mi novia, [por si] hay que [tenerlo en cuenta] para la habitación.",
			],
		},
		{
			id: "F1",
			at: "Necesito una respuesta antes de fin de mes",
			mode: "one",
			readings: [
				"I need to book flights, so I would be grateful for an answer by the end of the month.",
				"I am pushing for a firm commitment by the end of the month.",
			],
			why: "The reason comes after a bare 'I need', which sounds like a demand to a stranger.",
			refs: [
				"Como tengo que comprar el vuelo, [le agradecería mucho] una respuesta antes de fin de mes.",
				"Si [le fuera posible], [me vendría muy bien] saberlo antes de fin de mes, porque tengo que comprar el vuelo.",
				"[Querría tener] su respuesta antes de fin de mes para poder comprar el vuelo.",
			],
		},
		{
			id: "F2",
			at: "Mirando adelante a oír de usted.",
			mode: "one",
			readings: [
				"I hope to hear from her soon and would like to close politely.",
				"I'm looking forward to the stay and want to say thanks in advance.",
			],
			why: "Word-for-word 'Looking forward to hearing from you'; Spanish closes with a thanks or a wish plus a formal sign-off.",
			refs: [
				"[Quedo a la espera] de su respuesta.",
				"[Le agradezco de antemano] su atención y [espero su respuesta].",
				"[Espero noticias suyas] pronto.",
			],
		},
	],
	provenance: "Authored by an assistant as a realistic English-speaker draft; gold needs human review.",
};
