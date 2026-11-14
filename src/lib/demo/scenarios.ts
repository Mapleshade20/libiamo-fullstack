import { hasScenarios } from "$lib/constants";
import type { Exchange, ExMsg } from "$lib/session/types";
import { app } from "./app.svelte";
import { myWriting } from "./data";

/*
 * Scenarios, as the step-2 library has them: an evergreen pool the admin writes and leaves in place (no schedule), and
 * occasional issues, a themed handful with a publication date. Stand-ins for what the main app would load; the pool is
 * ranked by code (§ rank below), never by a calendar.
 *
 * A scenario is a scene the learner does not have to describe: a place, something to respond to (the situation, shown
 * in the place's look and highlightable like anything read), and a brief the session reads as the learner's notes.
 */
type Local = Record<string, string>;
export type Situation =
	| { kind: "ao3"; work: string; author: string; chapter: string; excerpt: string; note: string }
	| {
			kind: "reddit";
			sub: string;
			title: string;
			author: string;
			body: string;
			time?: string;
			comments: { author: string; body: string; depth?: number; time?: string }[];
	  }
	| { kind: "email"; from: string; to?: string; subject: string; body: string; time?: string }
	| { kind: "chat"; place: string; messages: { author: string; text: string; time?: string }[] }
	/** original: the text as it was first written, in the language learnt (the native version the passes compare with);
	 *  glossary: names and terms given, as the source shows them (src/translate/source.ts);
	 *  where / readers: where the translation will appear and who reads it, for the session (in English). */
	| {
			kind: "translate";
			brief: string;
			source: string;
			sourceLang: string;
			original?: string;
			glossary?: { term: string; shown: string; gloss: string }[];
			where?: string;
			readers?: string;
	  };
export type Scenario = {
	id: string;
	site: "AO3" | "Reddit" | "Email" | "Discord" | "iMessage" | "Translate";
	min: number;
	/** When it entered the pool (newest ranks a little higher). */
	added: string;
	title: Local;
	line: Local;
	/**
	 * The introduction: what a newcomer would not know (the game, what happened before), in the language learnt, shown
	 * above the scene and read by every model; most scenarios need none. A translation's tells who wants it and why.
	 */
	brief: Local;
	situation: Record<string, Situation>;
};
/**
 * What the main app's simulation would leave behind (the demo does not run it: a placeholder stands in for the
 * platform surface). `you`: the learner's role; `goals`: what they want out of it (the main app's objectives);
 * `cast`: who is there; `mine`: what the learner sent; `ending`: how the others answered, last in the thread.
 */
export type Sim = {
	you: string;
	goals: string[];
	cast: { name: string; who: string }[];
	mine: string[];
	ending: { author: string; text: string }[];
	/** The whole exchange in order, when it went back and forth ("me" is the learner); `mine` and `ending` follow from it. */
	turns?: { author: string; text: string }[];
};
export const SIMS: Record<string, Sim> = {
	"ao3-fic": {
		you: "A reader who followed the fic for two years",
		goals: ["Tell the author which scene stayed with you", "Say why, so it means something to them"],
		cast: [
			{ name: "mossfur_writes", who: "the author" },
			{ name: "lichenpaw", who: "another reader" },
		],
		mine: [],
		ending: [],
		// AO3 authors answer comments, often with a question back; readers there do not argue.
		turns: [
			{
				author: "me",
				text: "I read this fic since the first chapter and the ending make me cry. The scene when Bluestar not look back at the camp is staying with me, because she choose to go alone even she is scared.",
			},
			{
				author: "mossfur_writes",
				text: "Two years!! Thank you so much 😭 Can I ask, did you read her as scared of the journey, or of what she'd find at the Moonstone? I went back and forth on that a lot.",
			},
			{
				author: "me",
				text: "I think more about what she find. The journey she did many times, but this time maybe StarClan will tell her Oakheart is not waiting for her. That is why she make herself stop thinking of him, I think.",
			},
			{ author: "mossfur_writes", text: "Oh. That's exactly it, and I never said it out loud in the text. Thank you for reading her so closely." },
		],
	},
	"reddit-practice": {
		you: "A Redditor who writes in English every day",
		goals: ["Share what you actually do", "Be specific enough that someone could try it"],
		cast: [
			{ name: "u/quietfern", who: "asked the question" },
			{ name: "u/tallgrass_42", who: "already answered" },
		],
		mine: [
			"For me the most useful is to write comments for things I really care. I write fanfic comments on AO3 nearly everyday, at first it took me one hour for one comment but now is faster. Also I keep a list of phrases I steal from other comments.",
		],
		ending: [{ author: "u/quietfern", text: "Stealing phrases from other comments is genius, honestly. Do you keep the list in a doc or an app?" }],
	},
	"email-extension": {
		you: "A student with a family emergency",
		goals: ["Ask for one more week", "Give a reason that holds up", "Stay polite and brief"],
		cast: [{ name: "Prof. Hannah Lin", who: "your professor" }],
		mine: [
			"Dear Professor Lin,\n\nI want to ask if I can have one more week for the essay. Because my grandmother is in hospital and I go there every day.\n\nThank you,\nMaple",
		],
		ending: [{ author: "Prof. Hannah Lin", text: "I'm sorry to hear that. Take until next Friday, and let me know if you need anything else." }],
	},
	"discord-ending": {
		you: "A book-club regular who liked the ending",
		goals: ["Take a side on the ending", "Back it up with something from the book"],
		cast: [
			{ name: "juniper", who: "thinks it was rushed" },
			{ name: "theo", who: "thinks it was earned" },
			{ name: "mira", who: "runs the club" },
		],
		mine: [],
		ending: [],
		turns: [
			{ author: "me", text: "i'm with theo actually" },
			{ author: "me", text: "the letters in ch 9 is not just setup, she already forgive him there, she just don't say it" },
			{ author: "juniper", text: "wait which letters? she burns all of them in ch 9" },
			{ author: "me", text: "not all! the one with his drawing she keep it. so the ending is only her saying it loud" },
			{ author: "juniper", text: "ok that's... a good point. the letter where she keeps his drawing" },
			{ author: "mira", text: "putting this in the pinned takes 📌" },
		],
	},

	"translate-menu": {
		you: "Helping a small café with its menu",
		goals: ["Keep each line short", "Make it sound like food, not a dictionary"],
		cast: [{ name: "Lin", who: "owns the café" }],
		mine: [
			"Osmanthus latte: home made osmanthus sauce, with a little sea salt milk cap.\nChestnut basque: the outside is baked a bit burnt, inside still soft.\nHot red wine (no alcohol version): cinnamon, orange skin and clove, suitable for rainy day.",
		],
		ending: [],
	},
	"translate-crow": {
		you: "Posting a fellow fan's rant for them",
		goals: ["Keep every point, and the heat", "Sound like a fan, not a translation"],
		cast: [{ name: "r/WarriorCats", who: "fans who know the books" }],
		mine: [
			"I don't even know where to start. Crowfeather and Tawnypelt become couple is so ridiculous. There is completely no 铺垫, and both of them are very OOC. It also make a mess of their original story and relationship, and rewrite many years' setting for a CP nobody want.\n\nCrowfeather's character is always supported by his complicated and emotional relationship with Feathertail and Leafpool, and the long influence of those feelings on him. Force him into a love with Tawnypelt is ignoring his emotional baggage and growth for so many years. Tawnypelt's story is never about love, not like Crowfeather. She is always a very independent cat who is 死心塌地 loyal to ShadowClan, why suddenly she start to fall in love like a young girl?\n\nDon't misunderstand, I really like the idea of two old cats fall in love again after lose their partners, but these two characters are really not suitable for this kind of story.",
		],
		ending: [],
	},
	"reddit-theory": {
		you: "A Warriors fan with a theory",
		goals: ["Put forward your theory", "Point to something in the books"],
		cast: [
			{ name: "u/ashpelt_fan", who: "asked for theories" },
			{ name: "u/frostkit", who: "blames the Moonpool" },
		],
		mine: [],
		ending: [],
		turns: [
			{
				author: "me",
				text: "I think it is not StarClan's fault. When the Clans at the Moonstone the sky is overcast, so the moonlight cannot reach the stone, maybe the clouds alone explain it?",
			},
			{ author: "u/frostkit", text: "Wait, so you think StarClan just... isn't real? That's a pretty big claim lol" },
			{
				author: "me",
				text: "No no, I mean StarClan didn't abandon them on purpose. They wanted to come but without moonlight the Moonstone can't work, so they can't reach the cats.",
			},
			{ author: "u/frostkit", text: "Ohh got it. Then the clouds theory is actually solid. Moonstone only works with moonlight anyway." },
		],
	},

	"imessage-thanks": {
		you: "Sam's close friend, on your birthday",
		goals: ["Thank Sam", "Say which song got you"],
		cast: [{ name: "Sam", who: "made you a playlist" }],
		mine: [],
		ending: [],
		// A chat goes in bursts: consecutive messages are one turn.
		turns: [
			{ author: "me", text: "omg sam thank you!!" },
			{ author: "me", text: "the 4th song make me cry on the bus, how you know i love that band" },
			{ author: "me", text: "the name is so weird but correct lol" },
			{ author: "Sam", text: "HAHA i knew it. which one got you, the long one?? sea glass?" },
			{ author: "me", text: "yes sea glass!! i listen it three times on the way home" },
			{ author: "me", text: "now the whole bus think i'm crazy" },
			{ author: "Sam", text: "happy birthday you dramatic bus crier 💛" },
		],
	},
	"email-landlord": {
		you: "A tenant whose heating stopped working",
		goals: ["Say what's broken and since when", "Ask for a date it'll be fixed"],
		cast: [{ name: "David", who: "Greenway Lettings" }],
		mine: [],
		ending: [],
		turns: [
			{
				author: "me",
				text: "Hi David,\n\nThe heating in my flat is broken since Monday, it is very cold in the night. You must send someone to repair it this week. When it can be fixed?\n\nBest,\nMaple",
			},
			{
				author: "David",
				text: "Hi Maple,\n\nSorry to hear that. Please bear in mind our engineers are fully booked, so I can't promise anything for this week. I'll let you know when I hear back.\n\nDavid",
			},
			{
				author: "me",
				text: "Hi David,\n\nSorry, I didn't mean to be rude. I understand the engineers are busy. Is it possible to know roughly which day they can come? I am at home every morning, so any morning is ok for me.\n\nThanks,\nMaple",
			},
			{
				author: "David",
				text: "Thanks Maple, that helps. An engineer can come Thursday morning, 9–12. I'll drop off a heater tomorrow in the meantime.",
			},
		],
	},

	"ao3-ghost": {
		you: "A reader who got properly scared",
		goals: ["Tell the author what scared you", "Be specific"],
		cast: [{ name: "hollowbirch", who: "the author" }],
		mine: [
			"Oh my god this get me so much!! The part when the lantern is standing at the bottom of the stairs, lit, I was really scared and I can't sleep well. You are very good at making the quiet things scary.",
		],
		ending: [{ author: "hollowbirch", text: '"Making the quiet things scary" is going on my wall. Sorry about your sleep (not sorry).' }],
	},
	"reddit-costume": {
		you: "Someone good at last-minute costumes",
		goals: ["Give one idea that works with a bedsheet and a lamp", "Make it doable in two hours"],
		cast: [{ name: "u/panic_pumpkin", who: "needs a costume" }],
		mine: [
			"Be a lighthouse! Wrap the bedsheet around you, draw red stripes with marker, and hold the lamp on your head (careful with the cable). Everyone will understand immediately.",
		],
		ending: [{ author: "u/panic_pumpkin", text: "A LIGHTHOUSE. I'm doing it. Thank you, stranger" }],
	},
	"discord-movie": {
		you: "A friend who wants a real horror film",
		goals: ["Pick a film", "Win the vote"],
		cast: [
			{ name: "ren", who: "gave the options" },
			{ name: "ines", who: "wants Paddington 2" },
		],
		mine: ["The Others!! is scary but not gore, so ines can survive", "and the twist is so good, you will want to watch again"],
		ending: [{ author: "ines", text: "fine. but if I scream you're all making me tea" }],
	},
	"email-neighbour": {
		you: "A neighbour with a bowl of sweets",
		goals: ["Invite the kids", "Say when and where"],
		cast: [{ name: "Marta", who: "flat 3" }],
		mine: [
			"Hi everyone,\n\nI will have sweets for the kids at flat 7 on Friday from 6 to 8pm, please knock! I also make some decoration on the door.\n\nMaple (flat 7)",
		],
		ending: [{ author: "Marta", text: "Lovely! We'll come by around 6:30 with the twins 🎃" }],
	},
	"email-club": {
		you: "A student who missed the sign-up",
		goals: ["Ask to join late", "Give a short reason"],
		cast: [{ name: "Chess Society", who: "the organisers" }],
		mine: [
			"Hello,\n\nI saw the registration is closed. I just arrived to the university last week because of visa problem. Is it still possible to join the society this term?\n\nThanks,\nMaple",
		],
		ending: [{ author: "Chess Society", text: "Hi Maple, no problem, come to Thursday's session and we'll add you." }],
	},
	"discord-roommate": {
		you: "A fresher looking for a study partner",
		goals: ["Introduce yourself", "Find someone to study with"],
		cast: [{ name: "kai", who: "also doing stats" }],
		mine: ["me too! i'm maple, first year in psychology, stats is scaring me already", "library on wednesday afternoon?"],
		ending: [{ author: "kai", text: "wednesday works!! 3pm, second floor by the windows" }],
	},
};

/** The exchange in order: the learner's consecutive messages are one turn (bubbles sent together). */
export function simTurns(sim: Sim): { author: string; text: string; me: boolean }[] {
	const raw = sim.turns ?? [...sim.mine.map((text) => ({ author: "me", text })), ...sim.ending];
	const out: { author: string; text: string; me: boolean }[] = [];
	for (const m of raw) {
		const me = m.author === "me";
		const last = out.at(-1);
		if (me && last?.me) last.text += `\n${m.text}`;
		else out.push({ author: m.author, text: m.text, me });
	}
	return out;
}
for (const sim of Object.values(SIMS)) {
	if (!sim.turns) continue;
	const t = simTurns(sim);
	const lastMine = t.findLastIndex((m) => m.me);
	sim.mine = t.filter((m) => m.me).map((m) => m.text);
	sim.ending = t.slice(lastMine + 1).map(({ author, text }) => ({ author, text }));
}

const PLACE: Record<string, Exchange["place"]> = { AO3: "ao3", Reddit: "reddit", Email: "mail", Discord: "discord", iMessage: "imessage" };
/** What the session reads of a finished scenario (rehearsal-lab src/scenario/exchange.ts): the scene, what was there, the exchange. */
export function exchangeOf(q: Scenario, sim: Sim, me: string, lang = app.lang): Exchange | undefined {
	const place = PLACE[q.site];
	const s = situationOf(q, lang);
	if (!place || !s) return undefined;
	const before: ExMsg[] = [];
	let where: string = q.site;
	if (s.kind === "reddit") {
		where = `r/${s.sub}`;
		before.push(
			{ id: "b0", author: s.author, text: `${s.title}\n\n${s.body}` },
			...s.comments.map((c, i) => ({ id: `b${i + 1}`, author: c.author, text: c.body, replyTo: "b0" })),
		);
	} else if (s.kind === "ao3") {
		where = `“${s.work}”, ${s.chapter}`;
		before.push({ id: "b0", author: s.author, text: `${s.excerpt}\n\nAuthor's note: ${s.note}` });
	} else if (s.kind === "email") {
		where = `email: ${s.subject}`;
		before.push({ id: "b0", author: s.from, text: `Subject: ${s.subject}\n\n${s.body}` });
	} else if (s.kind === "chat") {
		where = s.place;
		before.push(...s.messages.map((m, i) => ({ id: `b${i}`, author: m.author, text: m.text })));
	}
	const transcript: ExMsg[] = simTurns(sim).map((m, i) => ({
		id: `t${i + 1}`,
		author: m.me ? me : m.author,
		text: m.text,
		...(m.me ? { learner: true } : {}),
	}));
	return { place, lang, scene: { platform: q.site, where, you: sim.you, goals: sim.goals, cast: sim.cast }, before, transcript };
}
export type Issue = { id: string; date: string; title: Local; line: Local; tone: string; deep: string; scenarios: string[] };

export const SCENARIOS: Scenario[] = [
	{
		id: "ao3-fic",
		site: "AO3",
		min: 10,
		added: "2026-09-02",
		title: {
			en: "Comment on a fic you loved",
			es: "Comenta un fic que te encantó",
			fr: "Commente une fic que tu as adorée",
			ja: "好きだった二次創作に感想を書く",
		},
		line: {
			en: "The author asked readers which scene stayed with them.",
			es: "La autora preguntó qué escena se les quedó grabada.",
			fr: "L'autrice demande quelle scène vous a marqués.",
			ja: "作者が、どの場面が心に残ったかを読者に聞いている。",
		},
		brief: {
			en: "Warriors is a series of novels about clans of wild cats. Bluestar, a clan leader, once loved Oakheart of a rival clan; this fic retells her last journey to the Moonstone, where leaders meet the spirits of their ancestors.",
		},
		situation: {
			en: {
				kind: "ao3",
				work: "Long Way Home",
				author: "mossfur_writes",
				chapter: "Chapter 24: The Moonstone",
				excerpt:
					"Bluestar did not look back at the camp. The moor was silver under a moon that had not been there an hour ago, and the cold came up through her paws like an old argument she had never finished. She thought of Oakheart, and then she made herself stop thinking of him, and walked on.",
				note: "That's the end! Thank you for sticking with this for two years. If you have a second, tell me which scene stayed with you, I read every comment.",
			},
			es: {
				kind: "ao3",
				work: "El largo camino",
				author: "lunadepapel",
				chapter: "Capítulo 24: La piedra lunar",
				excerpt:
					"Estrella Azul no miró atrás. El páramo brillaba bajo una luna que una hora antes no estaba, y el frío le subía por las patas como una discusión que nunca terminó.",
				note: "¡Fin! Gracias por acompañarme dos años. Si tienen un momento, díganme qué escena se les quedó grabada: leo todos los comentarios.",
			},
			fr: {
				kind: "ao3",
				work: "Le long chemin",
				author: "plume_de_lune",
				chapter: "Chapitre 24 : La Pierre de Lune",
				excerpt:
					"Étoile Bleue ne se retourna pas. La lande était argentée sous une lune qui n'était pas là une heure plus tôt, et le froid lui montait dans les pattes comme une vieille dispute jamais finie.",
				note: "C'est fini ! Merci de m'avoir suivie pendant deux ans. Si vous avez une seconde, dites-moi quelle scène vous a marqués, je lis tous les commentaires.",
			},
			ja: {
				kind: "ao3",
				work: "帰り道",
				author: "tsukiyo_kaku",
				chapter: "第24章 月の石",
				excerpt:
					"ブルースターは野営地を振り返らなかった。一時間前にはなかった月の下で荒野は銀色に光り、冷たさが、決着のつかなかった口論のように足の裏から這い上がってきた。",
				note: "完結です！二年間ありがとうございました。もしよければ、どの場面が心に残ったか教えてください。コメントは全部読んでいます。",
			},
		},
	},
	{
		id: "reddit-practice",
		site: "Reddit",
		min: 12,
		added: "2026-09-10",
		title: {
			en: "Answer a question in r/languagelearning",
			es: "Responde una pregunta en r/languagelearning",
			fr: "Réponds à une question sur r/languagelearning",
			ja: "r/languagelearning の質問に答える",
		},
		line: {
			en: "Someone asks how you practise writing every day.",
			es: "Alguien pregunta cómo practicas la escritura cada día.",
			fr: "Quelqu'un demande comment tu t'entraînes à écrire chaque jour.",
			ja: "毎日どうやって書く練習をしているか聞かれている。",
		},
		brief: {},
		situation: {
			en: {
				kind: "reddit",
				sub: "languagelearning",
				title: "How do you actually practise writing? Not apps, real writing.",
				author: "u/quietfern",
				body: "I can read pretty well at this point (B2-ish) but whenever I try to write a comment or an email it takes forever and still sounds stiff. What do you actually do every day? Journals? Discord? I'd love specifics.",
				comments: [
					{ author: "u/tallgrass_42", body: "Honestly, replying to things I care about. Fandom comments got me further than any textbook." },
				],
			},
			es: {
				kind: "reddit",
				sub: "languagelearning",
				title: "¿Cómo practicáis la escritura de verdad?",
				author: "u/helecho_quieto",
				body: "Leo bastante bien (B2) pero escribir un correo me cuesta muchísimo y suena rígido. ¿Qué hacéis cada día? Me encantarían detalles concretos.",
				comments: [],
			},
			fr: {
				kind: "reddit",
				sub: "languagelearning",
				title: "Comment vous entraînez-vous vraiment à écrire ?",
				author: "u/fougere_calme",
				body: "Je lis plutôt bien (B2) mais écrire un mail me prend une éternité et ça sonne raide. Vous faites quoi, concrètement, chaque jour ?",
				comments: [],
			},
			ja: {
				kind: "reddit",
				sub: "languagelearning",
				title: "みんな実際どうやって書く練習してる？",
				author: "u/shizuka_shida",
				body: "読むのはそこそこできる（B2くらい）けど、メールやコメントを書くとすごく時間がかかって不自然になる。毎日具体的に何をしてる？",
				comments: [],
			},
		},
	},
	{
		id: "email-extension",
		site: "Email",
		min: 8,
		added: "2026-09-15",
		title: {
			en: "Ask your professor for an extension",
			es: "Pide una prórroga a tu profesora",
			fr: "Demande un délai à ton professeur",
			ja: "教授に締め切りの延長をお願いする",
		},
		line: {
			en: "Polite, short, with a reason that holds up.",
			es: "Educado, breve y con un motivo creíble.",
			fr: "Poli, court, avec une raison qui tient la route.",
			ja: "丁寧に、短く、納得できる理由を添えて。",
		},
		brief: {},
		situation: {
			en: {
				kind: "email",
				from: "Prof. Hannah Lin",
				subject: "Reminder: essay due Friday",
				body: "Dear all,\n\nA quick reminder that the comparative essay is due this Friday at 5 pm. If something serious is getting in the way, write to me before the deadline, not after.\n\nBest,\nHannah Lin",
			},
			es: {
				kind: "email",
				from: "Prof. Lucía Ortega",
				subject: "Recordatorio: ensayo el viernes",
				body: "Hola a todos:\n\nOs recuerdo que el ensayo se entrega este viernes a las 17 h. Si tenéis algún problema serio, escribidme antes del plazo, no después.\n\nUn saludo,\nLucía Ortega",
			},
			fr: {
				kind: "email",
				from: "M. Laurent Petit",
				subject: "Rappel : dissertation vendredi",
				body: "Bonjour à tous,\n\nPetit rappel : la dissertation est à rendre vendredi à 17 h. En cas de vrai problème, écrivez-moi avant la date limite, pas après.\n\nBien à vous,\nLaurent Petit",
			},
			ja: {
				kind: "email",
				from: "林 先生",
				subject: "リマインダー：レポート締め切りは金曜",
				body: "皆さん\n\n比較レポートの締め切りは今週金曜17時です。やむを得ない事情がある場合は、締め切り前に連絡してください。\n\n林",
			},
		},
	},
	{
		id: "discord-ending",
		site: "Discord",
		min: 10,
		added: "2026-09-20",
		title: {
			en: "Join the talk in #book-club",
			es: "Únete a la charla en #club-de-lectura",
			fr: "Rejoins la discussion dans #club-lecture",
			ja: "#読書会 の話に加わる",
		},
		line: {
			en: "They're arguing about the ending. Pick a side.",
			es: "Discuten sobre el final. Elige un bando.",
			fr: "Ça débat sur la fin. Choisis ton camp.",
			ja: "結末について議論中。どちらかの立場を取ろう。",
		},
		brief: {},
		situation: {
			en: {
				kind: "chat",
				place: "#book-club",
				messages: [
					{ author: "juniper", text: "ok I finished it. the ending felt rushed?? she forgives him in like two pages" },
					{ author: "theo", text: "nah it was set up the whole time, the letters in ch 9" },
					{ author: "juniper", text: "set up ≠ earned imo" },
					{ author: "mira", text: "anyone who hasn't weighed in yet? 👀" },
				],
			},
			es: {
				kind: "chat",
				place: "#club-de-lectura",
				messages: [
					{ author: "nerea", text: "acabé el libro. el final fue muy rápido, ¿no?" },
					{ author: "teo", text: "qué va, estaba preparado desde las cartas del capítulo 9" },
				],
			},
			fr: {
				kind: "chat",
				place: "#club-lecture",
				messages: [
					{ author: "lou", text: "j'ai fini. la fin était bâclée non ?" },
					{ author: "théo", text: "non, tout était préparé avec les lettres du chapitre 9" },
				],
			},
			ja: {
				kind: "chat",
				place: "#読書会",
				messages: [
					{ author: "みお", text: "読み終わった。結末、急すぎない？" },
					{ author: "てつ", text: "いや、9章の手紙からずっと伏線あったよ" },
				],
			},
		},
	},
	{
		id: "translate-menu",
		site: "Translate",
		min: 15,
		added: "2026-09-25",
		title: {
			en: "Translate a café's new menu",
			es: "Traduce la nueva carta de una cafetería",
			fr: "Traduis la nouvelle carte d'un café",
			ja: "カフェの新メニューを翻訳する",
		},
		line: { en: "Keep it short and appetising.", es: "Breve y que abra el apetito.", fr: "Court et appétissant.", ja: "短く、おいしそうに。" },
		brief: {
			en: "A small café wants its autumn menu in English for tourists. Short, appetising lines, not a word-for-word list.",
			es: "Una cafetería quiere su carta de otoño en español. Frases cortas y apetecibles.",
			fr: "Un café veut sa carte d'automne en français. Des lignes courtes et appétissantes.",
			ja: "小さなカフェが秋のメニューを日本語にしたい。短く、おいしそうに。",
		},
		situation: {
			"zh-CN": {
				kind: "translate",
				brief: "秋季限定菜单",
				source:
					"桂花拿铁：用店里自制的桂花糖浆调制，顶上撒一点海盐奶泡。\n栗子巴斯克奶酪蛋糕：外表焦香，里面依然软嫩。\n无酒精热红酒：加了肉桂、橙皮和丁香，适合阴雨天喝。",
				sourceLang: "zh-CN",
				original:
					"Osmanthus latte: house-made osmanthus syrup, a little sea-salt foam on top.\nChestnut basque cheesecake: caramelised outside, still soft inside.\nMulled wine (alcohol-free): cinnamon, orange peel and clove, for rainy days.",
				glossary: [
					{ term: "Osmanthus latte", shown: "桂花拿铁", gloss: "以店内自制桂花糖浆为主要原料的拿铁咖啡，是这里的招牌饮品。" },
					{ term: "Basque cheesecake", shown: "巴斯克奶酪蛋糕", gloss: "一种有名的奶酪蛋糕做法，这里指外部焦糖化、内部柔软的蛋糕。" },
				],
				where: "the café's printed autumn menu",
				readers: "tourists who read English, choosing at the counter",
			},
			en: {
				kind: "translate",
				brief: "Autumn menu",
				source:
					"Osmanthus latte: house-made osmanthus syrup, a little sea-salt foam on top.\nChestnut basque cheesecake: caramelised outside, still soft inside.\nMulled wine (alcohol-free): cinnamon, orange peel and clove, for rainy days.",
				sourceLang: "en",
			},
		},
	},
	{
		id: "translate-crow",
		site: "Translate",
		min: 20,
		added: "2026-11-08",
		title: { en: "Translate a fan's rant about Crow & Tawny" },
		line: { en: "Keep the heat: fans should hear one of their own." },
		brief: {
			en: "A fellow fan wants their rant about Crowfeather and Tawnypelt posted to r/WarriorCats. It should read like a fan wrote it in English.",
		},
		situation: {
			"zh-CN": {
				kind: "translate",
				brief: "r/WarriorCats 的吐槽帖",
				source:
					"从哪说起呢？鸦羽和褐皮在一起简直离谱。完全没有任何铺垫，而且感觉两个人都极其不符合他们的性格。这还破坏了他们各自故事和关系里的重要部分，为了一对我们压根没人想要的组合，把好几年的设定都改写了。\n\n鸦羽这个角色一直以来都是靠他和羽尾、叶池之间复杂又深刻的感情来塑造的，那些感情对他的影响也一直延续到现在。把他硬塞进和褐皮的恋情里，就等于无视了这么多年来塑造他的情感包袱和成长。褐皮的故事也从来不是像鸦羽那样围绕爱情展开的，她一直被写成独立坚强、忠于影族的样子，那怎么突然就像个青春期少女一样了？\n\n别误会，我很喜欢两个年纪大的猫在各自伴侣死后又重新相爱的设定，但这两个角色不适合这样的故事。",
				sourceLang: "zh-CN",
				original:
					"Where do I even start? Crowfeather and Tawnypelt as a couple is ridiculous. There was absolutely no buildup to it, and it feels completely out of character for both of them. It also undermines major parts of their established stories and relationships and rewrites years of lore for the sake of a pairing that we literally never asked for.\n\nCrowfeather's character has always been defined by his complicated, deeply emotional relationships with Feathertail and Leafpool and the lasting impact those loves had on him. Throwing him into a romance with Tawnypelt ignores the emotional baggage and growth that have shaped him for so long. Likewise, Tawnypelt's story has never revolved around romance in the way Crowfeather's has. She's been portrayed as fiercely independent, devoted to ShadowClan, so why has she suddenly started acting like a teenage girl?\n\nDon't get me wrong, I love the idea of two older cats falling in love even after the deaths of their respective mates--but these two are not the characters for that.",
				glossary: [
					{ term: "Crowfeather", shown: "鸦羽", gloss: "角色名，一只公猫，其过去的恋情是羽尾和叶池，文中讨论他与她们的感情。" },
					{ term: "Tawnypelt", shown: "褐皮", gloss: "角色名，一只母猫，文中被描写为独立坚强、忠于影族，被与鸦羽配对。" },
					{ term: "Feathertail", shown: "羽尾", gloss: "角色名，鸦羽过去的爱人之一。" },
					{ term: "Leafpool", shown: "叶池", gloss: "角色名，鸦羽过去的爱人之一。" },
					{ term: "ShadowClan", shown: "影族", gloss: "群体名，猫族的一个部族，褐皮效忠于它。" },
				],
				where: "a post in r/WarriorCats, the Warriors fan subreddit",
				readers: "Warriors fans who have read the books",
			},
		},
	},
	{
		id: "reddit-theory",
		site: "Reddit",
		min: 12,
		added: "2026-10-12",
		title: { en: "Post your theory in r/WarriorCats" },
		line: { en: "A thread about why StarClan went quiet." },
		brief: {
			en: "In Warriors, StarClan are the spirits of dead cats, and medicine cats meet them at the Moonstone. In the recent books they have gone quiet, and fans argue about why.",
		},
		situation: {
			en: {
				kind: "reddit",
				sub: "WarriorCats",
				title: "Why did StarClan go quiet in the Broken Code arc? Theories?",
				author: "u/ashpelt_fan",
				body: "Rereading and I still don't get it. Was it the impostor, or were they always weaker than the Clans thought? Give me your best theory with evidence.",
				comments: [{ author: "u/frostkit", body: "I think the Moonpool itself was the problem, not StarClan." }],
			},
		},
	},
	{
		id: "imessage-thanks",
		site: "iMessage",
		min: 5,
		added: "2026-10-20",
		title: { en: "Thank a friend for a birthday playlist" },
		line: { en: "Say which song got you, not just thanks." },
		brief: {},
		situation: {
			en: {
				kind: "chat",
				place: "Sam",
				messages: [
					{ author: "Sam", text: "happy birthday!! made you something 🎧" },
					{ author: "Sam", text: "it's called 'songs that sound like your handwriting' don't ask" },
				],
			},
		},
	},
	{
		id: "email-landlord",
		site: "Email",
		min: 8,
		added: "2026-10-26",
		title: { en: "Tell your landlord the heating is broken" },
		line: { en: "Firm but friendly, and ask when it'll be fixed." },
		brief: {},
		situation: {
			en: {
				kind: "email",
				from: "Greenway Lettings",
				subject: "Welcome to your new flat",
				body: "Hi,\n\nWelcome! If anything needs fixing, just email this address and we'll get back to you within two working days.\n\nKind regards,\nDavid, Greenway Lettings",
			},
		},
	},
	// The current issue's own scenarios (they join the pool once the issue is past).
	{
		id: "ao3-ghost",
		site: "AO3",
		min: 8,
		added: "2026-10-28",
		title: { en: "Comment on a ghost story" },
		line: { en: "Tell the author what actually scared you." },
		brief: {},
		situation: {
			en: {
				kind: "ao3",
				work: "The Lantern on the Stairs",
				author: "hollowbirch",
				chapter: "Oneshot",
				excerpt:
					"Every night the lantern moved one step lower. Nobody carried it. By the thirteenth night it was standing at the bottom of the stairs, lit, as if it was waiting for someone to go up.",
				note: "Happy Halloween! Short and spooky, as promised. Did it get you?",
			},
		},
	},
	{
		id: "reddit-costume",
		site: "Reddit",
		min: 10,
		added: "2026-10-28",
		title: { en: "Help someone with a last-minute costume" },
		line: { en: "They have a bedsheet, a lamp and two hours." },
		brief: {},
		situation: {
			en: {
				kind: "reddit",
				sub: "halloween",
				title: "Party in 2 hours, I own a white bedsheet and a desk lamp. Help.",
				author: "u/panic_pumpkin",
				body: "Not a ghost, everyone will be a ghost. Ideas?",
				comments: [],
			},
		},
	},
	{
		id: "discord-movie",
		site: "Discord",
		min: 8,
		added: "2026-10-28",
		title: { en: "Pick tonight's horror film in #movie-night" },
		line: { en: "Make your case in two or three messages." },
		brief: {},
		situation: {
			en: {
				kind: "chat",
				place: "#movie-night",
				messages: [
					{ author: "ren", text: "options: The Others, Hereditary, or Paddington 2 for the cowards" },
					{ author: "ines", text: "I vote paddington and I'm not ashamed" },
				],
			},
		},
	},
	{
		id: "email-neighbour",
		site: "Email",
		min: 6,
		added: "2026-10-28",
		title: { en: "Invite your neighbours to trick-or-treat" },
		line: { en: "A note for the building's mailing list." },
		brief: {},
		situation: {
			en: {
				kind: "email",
				from: "Building 14 residents",
				subject: "Halloween?",
				body: "Hi all,\n\nIs anyone doing anything for the kids this year? Last year it was a bit quiet.\n\nMarta (flat 3)",
			},
		},
	},
	// A past issue's.
	{
		id: "email-club",
		site: "Email",
		min: 8,
		added: "2026-09-01",
		title: { en: "Ask to join a university club late" },
		line: { en: "Sign-ups closed last week." },
		brief: {},
		situation: {
			en: {
				kind: "email",
				from: "Chess Society",
				subject: "Sign-ups are closed",
				body: "Thanks to everyone who signed up! Registration is now closed for this term.\n\nChess Society",
			},
		},
	},
	{
		id: "discord-roommate",
		site: "Discord",
		min: 6,
		added: "2026-09-01",
		title: { en: "Find a study buddy in #freshers" },
		line: { en: "Introduce yourself without being boring." },
		brief: {},
		situation: {
			en: {
				kind: "chat",
				place: "#freshers",
				messages: [{ author: "kai", text: "anyone else doing intro to stats? looking for people to suffer with" }],
			},
		},
	},
];

export const ISSUES: Issue[] = [
	{
		id: "halloween",
		date: "2026-10-28",
		title: { en: "The spooky issue" },
		line: { en: "Ghost stories, costumes and a vote on tonight's film." },
		tone: "#e8c9a6",
		deep: "#4a3424",
		scenarios: ["ao3-ghost", "reddit-costume", "discord-movie", "email-neighbour"],
	},
	{
		id: "back-to-school",
		date: "2026-09-01",
		title: { en: "Back to school" },
		line: { en: "Late sign-ups, new people, first emails." },
		tone: "#cfdcc4",
		deep: "#33442c",
		scenarios: ["email-club", "discord-roommate", "email-extension"],
	},
];

export const scenarioById = (id: string) => SCENARIOS.find((q) => q.id === id);
/** What the learner has done with a scenario: nothing yet, a piece in progress, or a piece written. */
export function scenarioState(id: string): "new" | "open" | "written" {
	const w = myWriting().filter((x) => x.scenarioId === id);
	return w.some((x) => x.open) ? "open" : w.length ? "written" : "new";
}
const forLang = (q: Scenario, lang: string) => !!q.title[lang] && !!situationOf(q, lang);
/** A scenario's situation for this learner: in the language learnt, or for a translation, in their own language. */
export function situationOf(q: Scenario, lang = app.lang): Situation | undefined {
	if (q.site === "Translate") return q.situation[app.prefs.native] ?? (app.prefs.native !== lang ? q.situation.en : undefined);
	return q.situation[lang];
}
/** The current issue: the latest one published, if it is recent (an issue stands for about a month). */
export function currentIssue(lang = app.lang, now = new Date()): Issue | undefined {
	const latest = [...ISSUES].sort((a, b) => b.date.localeCompare(a.date))[0];
	return latest &&
		now.getTime() - new Date(latest.date).getTime() < 30 * 864e5 &&
		latest.scenarios.some((id) => forLang(scenarioById(id) as Scenario, lang))
		? latest
		: undefined;
}
/** Every scenario of this language, the current issue's apart. */
export function pool(lang = app.lang): Scenario[] {
	const cur = new Set(currentIssue(lang)?.scenarios ?? []);
	return SCENARIOS.filter((q) => forLang(q, lang) && !cur.has(q.id));
}
/**
 * "For you": not written yet first; within that, places take turns (so two of the same place never lead), newer first.
 * The main app ranks the same way on the server.
 */
export function rank(list: Scenario[]): Scenario[] {
	const fresh = (q: Scenario) => (scenarioState(q.id) === "written" ? 1 : 0);
	const byNew = [...list].sort((a, b) => fresh(a) - fresh(b) || b.added.localeCompare(a.added));
	const out: Scenario[] = [];
	const left = [...byNew];
	while (left.length) {
		const last = out[out.length - 1]?.site;
		const at = left.findIndex((q) => q.site !== last && fresh(q) === fresh(left[0]));
		out.push(left.splice(at < 0 ? 0 : at, 1)[0]);
	}
	return out;
}
/** The shelf's two prompts: from the current issue when there is one, then the pool, in rank order. */
export function shelfScenarios(lang = app.lang): Scenario[] {
	if (!hasScenarios(lang)) return [];
	const issue = currentIssue(lang);
	const fromIssue = issue
		? rank(issue.scenarios.map((id) => scenarioById(id) as Scenario).filter((q) => forLang(q, lang))).filter((q) => scenarioState(q.id) !== "written")
		: [];
	const rest = rank(pool(lang)).filter((q) => scenarioState(q.id) === "new");
	return [...fromIssue.slice(0, 1), ...rest].slice(0, 2);
}

/** The situation as plain text, for the session to read as the piece's context. */
export function situationText(s: Situation): string {
	switch (s.kind) {
		case "ao3":
			return `AO3 work "${s.work}" by ${s.author}, ${s.chapter}.\n\n${s.excerpt}\n\nAuthor's note: ${s.note}`;
		case "reddit":
			return `r/${s.sub}, post by ${s.author}: ${s.title}\n\n${s.body}${s.comments.map((c) => `\n\n${c.author}: ${c.body}`).join("")}`;
		case "email":
			return `Email from ${s.from}. Subject: ${s.subject}\n\n${s.body}`;
		case "chat":
			return `${s.place}\n${s.messages.map((m) => `${m.author}: ${m.text}`).join("\n")}`;
		case "translate":
			return `To translate (${s.brief}):\n\n${s.source}`;
	}
}
