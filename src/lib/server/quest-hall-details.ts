import { adaptHallDataToQuestMenu, type QuestMenuItemKey, type QuestMenuSection } from "$lib/quest-hall/menu";
import type { HallLocation } from "$lib/quest-hall/navigation";
import type { QuestHallPreparation } from "$lib/quest-hall/preparation";
import type { HallData } from "$lib/server/quest-hall";

/** Detail identity does not depend on membership in today's catalog. */
export function questHallDetails(hall: HallData, preparation: QuestHallPreparation) {
	const id = preparation.kind === "quest" ? preparation.data.task.id : preparation.data.template.id;
	const month =
		preparation.kind === "translation"
			? (hall.translationTasks.find((task) => task.id === id)?.createdMonth ?? hall.translationMonth)
			: hall.translationMonth;
	const catalog = adaptHallDataToQuestMenu(hall, month, "year");
	const section: QuestMenuSection =
		preparation.kind === "translation" ? "translation" : hall.weeklyTasks.some((task) => task.id === id) ? "weekly" : "daily";
	const key = `${section}-${id}` as QuestMenuItemKey;
	const leaf = catalog.spreads[section].find((spread) => spread.items.some((item) => item.key === key))?.leaf ?? 1;
	const route = {
		hall,
		hallLocation: { view: "prepare", section, leaf, task: key } satisfies HallLocation,
		catalogMonth: month,
		initialPreparation: { ...preparation, key },
	};
	return { ...route, questMenu: route };
}
