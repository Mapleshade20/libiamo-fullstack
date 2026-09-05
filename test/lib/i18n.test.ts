import { describe, expect, it } from "vitest";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";

describe("task UI translations", () => {
	it.each([
		["en", "Mission Objective", "Overview", "Return to Quest Hall"],
		["es", "Objetivo de la misión", "Resumen", "Volver al Salón de Misiones"],
		["fr", "Objectif de la mission", "Aperçu", "Retour à la Salle des Quêtes"],
		["ja", "ミッション目標", "概要", "クエストホールに戻る"],
	] as const)("localizes card and detail labels for %s", (lang, missionObjective, overview, returnToHall) => {
		expect(t(lang as LanguageCode, "hall.card.missionObjective")).toBe(missionObjective);
		expect(t(lang as LanguageCode, "hall.card.overview")).toBe(overview);
		expect(t(lang as LanguageCode, "task.returnToHall")).toBe(returnToHall);
	});

	it.each([
		["en", "MENU", "Open menu", "Choose a mission"],
		["es", "CARTA", "Abrir la carta", "Elige una misión"],
		["fr", "CARTE", "Ouvrir la carte", "Choisissez une mission"],
		["ja", "メニュー", "メニューを開く", "ミッションを選ぶ"],
	] as const)("localizes menu branding and controls for %s", (lang, brand, open, chooseMission) => {
		expect(t(lang as LanguageCode, "hall.menu.brand")).toBe(brand);
		expect(t(lang as LanguageCode, "hall.menu.open")).toBe(open);
		expect(t(lang as LanguageCode, "hall.menu.chooseMission")).toBe(chooseMission);
	});

	it.each([
		["en", "Replies", "Checking for replies…", "10 unread replies"],
		["es", "Respuestas", "Buscando respuestas…", "10 respuestas sin leer"],
		["fr", "Réponses", "Recherche de réponses…", "10 réponses non lues"],
		["ja", "返信", "返信を確認しています…", "未読の返信が10件あります"],
	] as const)("localizes unread inbox states for %s", (lang, trigger, loading, count) => {
		expect(t(lang as LanguageCode, "hall.unreadTrigger")).toBe(trigger);
		expect(t(lang as LanguageCode, "hall.unreadLoading")).toBe(loading);
		expect(t(lang as LanguageCode, "hall.unreadCountMany").replace("{count}", "10")).toBe(count);
	});

	it.each([
		["en", "Close useful expressions", "Check"],
		["es", "Cerrar expresiones útiles", "Comprobar"],
		["fr", "Fermer les expressions utiles", "Vérifier"],
		["ja", "便利な表現を閉じる", "確認"],
	] as const)("localizes useful-expression dialog controls for %s", (lang, close, check) => {
		expect(t(lang as LanguageCode, "task.usefulExpressions.close")).toBe(close);
		expect(t(lang as LanguageCode, "task.usefulExpressions.check")).toBe(check);
		expect(t(lang as LanguageCode, "task.usefulExpressions.inputLabel")).toContain("{expression}");
	});

	it.each([
		["en", "Recommended task level", "Level 2"],
		["es", "Nivel de tareas recomendado", "Nivel 2"],
		["fr", "Niveau de tâches recommandé", "Niveau 2"],
		["ja", "おすすめ課題レベル", "レベル2"],
	] as const)("localizes self-assigned proficiency for %s", (lang, title, level) => {
		expect(t(lang as LanguageCode, "profile.proficiency")).toBe(title);
		expect(t(lang as LanguageCode, "profile.proficiency.level2")).toBe(level);
		expect(t(lang as LanguageCode, "profile.proficiency.range1")).toBe("A2–B1");
		expect(t(lang as LanguageCode, "profile.proficiency.range2")).toBe("B2–C1");
		expect(t(lang as LanguageCode, "profile.proficiency.range3")).toBe("C2+");
	});
});
