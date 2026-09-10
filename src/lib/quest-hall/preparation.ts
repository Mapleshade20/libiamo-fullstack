import type { QuestMenuItemKey } from "$lib/quest-hall/menu";
import type { HallLocation } from "$lib/quest-hall/navigation";
import type { HallData } from "$lib/server/quest-hall";
import type { TaskPreparationData } from "$lib/server/task-preparation";
import type { TranslationPreparationData } from "$lib/server/translation-preparation";

export type QuestHallPreparation =
	| { kind: "quest"; key: QuestMenuItemKey; data: TaskPreparationData }
	| { kind: "translation"; key: QuestMenuItemKey; data: TranslationPreparationData };

export interface QuestMenuRouteData {
	hall: HallData;
	hallLocation: HallLocation;
	/**
	 * Which year the translation catalog opens on. Kept separate from
	 * `hall.translationMonth`, which must stay the real current month because
	 * `adaptHallDataToQuestMenu` classifies archived entries against it.
	 */
	catalogMonth: string;
	initialPreparation: QuestHallPreparation | null;
}
