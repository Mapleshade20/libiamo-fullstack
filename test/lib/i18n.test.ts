import { describe, expect, it } from "vitest";
import { type LanguageCode, t } from "$lib/i18n";

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
});
