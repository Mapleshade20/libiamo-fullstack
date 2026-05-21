import type { LanguageCode } from "$lib/constants";

export const greetings: Record<LanguageCode, string> = {
	en: "Welcome back, {name}.",
	fr: "Bon retour, {name}.",
	es: "Bienvenido de nuevo, {name}.",
	ja: "お帰りなさい、{name}さん。",
};

export const subtitlePool: Record<LanguageCode, string[]> = {
	en: [
		"Which world will you inhabit today?",
		"Ready for today's adventure?",
		"Let's make some progress.",
		"What's the plan for today?",
		"Time to tackle those daily quests.",
		"Consistency is the key to mastery.",
		"Let's clear the board today.",
		"Another day, another set of goals.",
		"Focus up, it's time to build.",
		"Ready to check off some tasks?",
		"Small steps lead to big achievements."
	],
	fr: [
		"Quel monde allez-vous explorer aujourd'hui ?",
		"Prêt pour l'aventure d'aujourd'hui ?",
		"Faisons quelques progrès aujourd'hui.",
		"Quel est le programme d'aujourd'hui ?",
		"Il est temps de s'attaquer aux quêtes du jour.",
		"La régularité est la clé du succès.",
		"Validons ces objectifs un par un.",
		"Un jour nouveau, de nouveaux défis.",
		"Concentration maximale, c'est l'heure.",
		"Prêt à accomplir vos tâches ?",
		"De petits pas font de grandes victoires."
	],
	es: [
		"¿Qué mundo vas a explorar hoy?",
		"¿Listo para la aventura de hoy?",
		"Avancemos un poco más hoy.",
		"¿Cuál es el plan para hoy?",
		"Es hora de completar las misiones diarias.",
		"La constancia es la clave del éxito.",
		"Vamos a tachar tareas de la lista.",
		"Otro día, otro conjunto de metas.",
		"Concéntrate, es hora de trabajar.",
		"¿Listo para cumplir tus objetivos?",
		"Pequeños pasos logran grandes cosas."
	],
	ja: [
		"今日はどの世界を旅しますか？",
		"今日の冒険を始めましょうか。",
		"コツコツ進めていきましょう！",
		"新しい一日、新しい学びを。",
		"今日のクエストをこなしに行きましょう。",
		"継続は力なり、今日も頑張りましょう。",
		"タスクを一つずつクリアしていきましょう。",
		"新たな一日、新たな目標を。",
		"集中して、本日の課題に取り組みましょう。",
		"今日のタスクを終わらせる準備はできましたか？",
		"小さな一歩が大きな成果につながります。"
	],
};

export function getGreeting(lang: LanguageCode, name: string): string {
	return (greetings[lang] ?? greetings.en).replace("{name}", name);
}

export function getRandomSubtitle(lang: LanguageCode): string {
	const pool = subtitlePool[lang] ?? subtitlePool.en;
	return pool[Math.floor(Math.random() * pool.length)];
}