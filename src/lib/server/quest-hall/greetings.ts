import type { LanguageCode } from "$lib/constants";

const greetings: Record<LanguageCode, string> = {
	en: "Welcome back, {name}.",
	fr: "Bon retour, {name}.",
	es: "Bienvenido de nuevo, {name}.",
	ja: "お帰りなさい、{name}さん。",
};

const subtitlePool: Record<LanguageCode, string[]> = {
	en: [
		"What world will you inhabit today?",
		"Step through the door and let the language answer.",
		"Listen for the city behind the words.",
		"Choose a scene, borrow a voice, and begin.",
		"Today's conversation is waiting just beyond the threshold.",
		"Let the day unfold in another language.",
	],
	fr: [
		"Quel monde allez-vous habiter aujourd'hui ?",
		"Entrez dans la scène, laissez la langue vous répondre.",
		"Écoutez la ville derrière les mots.",
		"Choisissez une situation, trouvez votre voix, commencez.",
		"Une conversation vous attend, juste de l'autre côté du seuil.",
		"Laissez la journée se déplier dans une autre langue.",
	],
	es: [
		"¿Qué mundo vas a habitar hoy?",
		"Cruza el umbral y deja que el idioma te responda.",
		"Escucha la ciudad que vive detrás de las palabras.",
		"Elige una escena, encuentra tu voz y empieza.",
		"Hay una conversación esperándote al otro lado.",
		"Deja que el día se despliegue en otro idioma.",
	],
	ja: [
		"今日はどんな世界で過ごしてみますか。",
		"言葉の向こうにある街の気配に耳を澄ませて。",
		"ひとつの場面に入り込み、あなたの声で始めましょう。",
		"扉を開ければ、別の言葉の日常が待っています。",
		"今日の会話は、もうすぐその先で始まります。",
		"別の言葉で、いつもの一日を少し違って眺めてみませんか。",
	],
};

export function getGreeting(lang: LanguageCode, name: string): string {
	return (greetings[lang] ?? greetings.en).replace("{name}", name);
}

export function getRandomSubtitle(lang: LanguageCode): string {
	const pool = subtitlePool[lang] ?? subtitlePool.en;
	return pool[Math.floor(Math.random() * pool.length)];
}
