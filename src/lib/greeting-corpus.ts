import type { LanguageCode } from "$lib/constants";

export const greetings: Record<LanguageCode, string> = {
	en: "Welcome back, {name}.",
	fr: "Bon retour, {name}.",
	es: "Bienvenido de nuevo, {name}.",
	ja: "お帰りなさい、{name}さん。",
};

export const subtitlePool: Record<LanguageCode, string[]> = {
	en: [
		"Let's roll up our sleeves and get to work.",
		"Time to check a few more tasks off your list.",
		"Every small step brings you closer to your goal.",
		"Ready to make some steady progress today?",
		"Let's pick up right where you left off.",
		"A new day, a fresh set of quests to tackle.",
	],
	fr: [
		"Il est temps de se mettre au travail.",
		"Bon courage pour les tâches qui vous attendent aujourd'hui.",
		"Prêt à avancer sur vos projets du jour ?",
		"Chaque petite étape vous rapproche de votre but.",
		"Reprenons exactement là où vous vous êtes arrêté.",
		"Une nouvelle journée pour accomplir vos quêtes.",
	],
	es: [
		"¡Manos a la obra! Vamos a sacar adelante el día.",
		"Es un buen momento para empezar a tachar tareas.",
		"Paso a paso, vamos completando los objetivos de hoy.",
		"¿Listo para avanzar un poco más en tus proyectos?",
		"Retomemos el trabajo donde lo dejaste.",
		"Un nuevo día para completar tus misiones diarias.",
	],
	ja: [
		"今日も自分のペースで、一つずつタスクをこなしていきましょう。",
		"焦らず、今日もコツコツと作業を進めていきましょう。",
		"さて、今日のクエストに取り掛かりましょうか。",
		"目標に向かって、今日も少しだけ前進してみませんか。",
		"準備はいいですか？今日の作業を始めましょう。",
		"新しい一日です。リストのタスクを片付けていきましょう。",
	],
};

export function getGreeting(lang: LanguageCode, name: string): string {
	return (greetings[lang] ?? greetings.en).replace("{name}", name);
}

export function getRandomSubtitle(lang: LanguageCode): string {
	const pool = subtitlePool[lang] ?? subtitlePool.en;
	return pool[Math.floor(Math.random() * pool.length)];
}
