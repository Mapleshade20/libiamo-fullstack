import type { QuestMenuItemKey } from "$lib/quest-hall/menu";
import type { HallLocation } from "$lib/quest-hall/navigation";
import type { TaskPreparationData } from "$lib/server/practice/preparation";
import type { HallData } from "$lib/server/quest-hall/hall";
import type { TranslationPreparationData } from "$lib/server/translation/preparation";

/** `pin` is the task URL's attempt pin (see `pinQuery`), which every link and form on the page keeps. */
export type QuestHallPreparation =
	| { kind: "quest"; key: QuestMenuItemKey; data: TaskPreparationData; pin: string }
	| { kind: "translation"; key: QuestMenuItemKey; data: TranslationPreparationData; pin: string };

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
