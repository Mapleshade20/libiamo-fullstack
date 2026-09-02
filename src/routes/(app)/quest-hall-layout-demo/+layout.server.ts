import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { LanguageCode } from "$lib/i18n";
import {
	applyQuestHallDemoScenario,
	getQuestHallDemoItems,
	getQuestHallDemoTaskSection,
	parseQuestHallDemoUrlState,
	type QuestHallDemoData,
} from "$lib/quest-hall-demo";
import { requireUser } from "$lib/server/auth/authz";
import { getTaskPreparationData } from "$lib/server/task-preparation";
import { getTranslationPreparationData } from "$lib/server/translation-preparation";
import { load as loadQuestHall } from "../+page.server";
import type { LayoutServerLoad } from "./$types";

function taskIdFromKey(value: string): number | null {
	const match = /^(?:daily|weekly|translation)-(\d+)$/.exec(value);
	if (!match) return null;
	const id = Number(match[1]);
	return Number.isSafeInteger(id) && id >= 0 ? id : null;
}

export const load: LayoutServerLoad = async (event) => {
	if (!dev) error(404);

	const user = requireUser(event);
	const source = await loadQuestHall(event as unknown as Parameters<typeof loadQuestHall>[0]);
	if (!source) error(500, "Quest Hall demo data could not be loaded");

	const demoState = parseQuestHallDemoUrlState(event.url.searchParams);
	const demoData = applyQuestHallDemoScenario(source as unknown as QuestHallDemoData, demoState.scenario);
	let selectedPreparation:
		| { kind: "quest"; data: NonNullable<Awaited<ReturnType<typeof getTaskPreparationData>>> }
		| { kind: "translation"; data: NonNullable<Awaited<ReturnType<typeof getTranslationPreparationData>>> }
		| null = null;

	if (demoState.view === "prepare" && demoState.task) {
		const section = getQuestHallDemoTaskSection(demoState.task);
		const taskId = taskIdFromKey(demoState.task);
		if (section && taskId !== null) {
			if (section === "translation") {
				const preparation = await getTranslationPreparationData({
					userId: user.id,
					templateId: taskId,
					activeLanguage: user.activeLanguage as LanguageCode,
					nativeLanguage: user.nativeLanguage,
				});
				if (preparation) selectedPreparation = { kind: "translation", data: preparation };
			} else {
				const preparation = await getTaskPreparationData({ userId: user.id, taskId });
				if (preparation) {
					const simulated = getQuestHallDemoItems(demoData, section).find((item) => item.id === taskId);
					if (simulated?.kind === "quest") {
						preparation.task.sessionStatus = simulated.task.sessionStatus;
					}
					selectedPreparation = { kind: "quest", data: preparation };
				}
			}
		}
	}

	return {
		...demoData,
		demoState,
		selectedPreparation,
	};
};
