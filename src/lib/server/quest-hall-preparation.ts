import { and, eq } from "drizzle-orm";
import type { LanguageCode } from "$lib/constants";
import { getQuestMenuItemId, getQuestMenuItemSection, type QuestMenuItemKey } from "$lib/quest-hall/menu";
import { db } from "$lib/server/db";
import { task, template } from "$lib/server/db/schema";
import { getLocalDateString, getMondayOfWeekForDate } from "$lib/server/scheduling/dates";
import { getTaskPreparationData, type TaskPreparationData } from "$lib/server/task-preparation";
import { getTranslationPreparationData, type TranslationPreparationData } from "$lib/server/translation-preparation";

export type QuestHallPreparation =
	| { kind: "quest"; key: QuestMenuItemKey; data: TaskPreparationData }
	| { kind: "translation"; key: QuestMenuItemKey; data: TranslationPreparationData };

export class QuestHallPreparationRequestError extends Error {
	constructor(
		public readonly status: 400 | 409,
		message: string,
	) {
		super(message);
		this.name = "QuestHallPreparationRequestError";
	}
}

interface QuestHallPreparationUser {
	id: string;
	activeLanguage: string;
	nativeLanguage?: string | null;
}

interface GetQuestHallPreparationInput {
	user: QuestHallPreparationUser;
	key: string;
	editionDate: string;
	browserTimezone: string;
}

export async function getQuestHallPreparation({
	user,
	key,
	editionDate,
	browserTimezone,
}: GetQuestHallPreparationInput): Promise<QuestHallPreparation | null> {
	const section = getQuestMenuItemSection(key);
	const id = getQuestMenuItemId(key);
	if (!section || !id) throw new QuestHallPreparationRequestError(400, "Invalid Quest Hall selection");

	const localDate = getLocalDateString(browserTimezone);
	if (editionDate !== localDate) throw new QuestHallPreparationRequestError(409, "This Quest Hall edition is no longer current");

	const activeLanguage = user.activeLanguage as LanguageCode;
	if (section === "translation") {
		const [membership] = await db
			.select({ createdAt: template.createdAt })
			.from(template)
			.where(and(eq(template.id, id), eq(template.language, activeLanguage), eq(template.ui, "translator"), eq(template.isActive, true)))
			.limit(1);
		if (!membership || getLocalDateString(browserTimezone, membership.createdAt).slice(0, 7) !== localDate.slice(0, 7)) return null;

		const data = await getTranslationPreparationData({
			userId: user.id,
			templateId: id,
			activeLanguage,
			nativeLanguage: user.nativeLanguage,
		});
		return data ? { kind: "translation", key: key as QuestMenuItemKey, data } : null;
	}

	const expectedDate = section === "daily" ? localDate : getMondayOfWeekForDate(localDate);
	const [membership] = await db
		.select({ id: task.id })
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.id, id), eq(task.language, activeLanguage), eq(task.date, expectedDate), eq(task.cadence, section)))
		.limit(1);
	if (!membership) return null;

	const data = await getTaskPreparationData({ userId: user.id, taskId: id });
	return data ? { kind: "quest", key: key as QuestMenuItemKey, data } : null;
}
