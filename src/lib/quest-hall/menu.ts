import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";
import type { SelfAssignedLevel, TranslationWorkflowPhase } from "$lib/constants";
import { type HallQuest, type HallQuestSessionStatus, isHallQuestFinished } from "$lib/quest-hall";
import type { HallData, HallTranslationTask } from "$lib/server/quest-hall";

export const QUEST_MENU_SECTIONS = ["daily", "weekly", "translation"] as const;
export type QuestMenuSection = (typeof QUEST_MENU_SECTIONS)[number];
export type QuestMenuItemKey = `${QuestMenuSection}-${number}`;
export type QuestMenuItemState = "ready" | "active" | "finished" | "stopped" | "informational";

interface QuestMenuItemBase {
	key: QuestMenuItemKey;
	section: QuestMenuSection;
	id: number;
	ordinal: number;
	state: QuestMenuItemState;
	hasUnread: boolean;
}

export type QuestMenuItem =
	| (QuestMenuItemBase & { kind: "quest"; task: HallQuest; sessionStatus: HallQuestSessionStatus })
	| (QuestMenuItemBase & { kind: "translation"; task: HallTranslationTask; workflowPhase: TranslationWorkflowPhase | null });

export interface QuestMenuSpread {
	leaf: number;
	totalLeaves: number;
	items: QuestMenuItem[];
	leftItems: QuestMenuItem[];
	rightItems: QuestMenuItem[];
}

export interface QuestMenuCatalog {
	sections: Record<QuestMenuSection, QuestMenuItem[]>;
	spreads: Record<QuestMenuSection, QuestMenuSpread[]>;
	recommendations: QuestMenuItem[];
}

export interface QuestMenuLocationTarget {
	section: QuestMenuSection;
	leaf: number;
}

export interface QuestMenuNarrowTarget extends QuestMenuLocationTarget {
	itemKey: QuestMenuItemKey | null;
}

export function getQuestMenuItemKey(section: QuestMenuSection, id: number): QuestMenuItemKey {
	if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError("Quest menu item ids must be positive safe integers");
	return `${section}-${id}`;
}

export function getQuestMenuItemSection(key: string | null | undefined): QuestMenuSection | null {
	const match = /^(daily|weekly|translation)-([1-9]\d*)$/.exec(key ?? "");
	return match ? (match[1] as QuestMenuSection) : null;
}

export function getQuestMenuItemId(key: string | null | undefined): number | null {
	if (!getQuestMenuItemSection(key)) return null;
	const id = Number(key?.slice((key?.lastIndexOf("-") ?? -1) + 1));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function questState(task: HallQuest): QuestMenuItemState {
	if (isHallQuestFinished(task.sessionStatus)) return "finished";
	if (task.sessionStatus === "in_progress") return "active";
	if (task.sessionStatus === "abandoned") return "stopped";
	if (!isPracticeUiImplemented(task.templateUi)) return "informational";
	return "ready";
}

function translationState(workflowPhase: TranslationWorkflowPhase | null): QuestMenuItemState {
	if (workflowPhase === "completed") return "finished";
	return workflowPhase ? "active" : "ready";
}

function adaptQuestItems(tasks: HallQuest[], section: "daily" | "weekly"): QuestMenuItem[] {
	return tasks.map((source, index) => {
		const task = { ...source };
		return {
			kind: "quest" as const,
			key: getQuestMenuItemKey(section, task.id),
			section,
			id: task.id,
			ordinal: index + 1,
			state: questState(task),
			hasUnread: task.hasUnreadReply,
			sessionStatus: task.sessionStatus,
			task,
		};
	});
}

function adaptTranslationItems(data: Pick<HallData, "translationTasks" | "translationStatusMap">, tasks: HallTranslationTask[]): QuestMenuItem[] {
	return tasks.map((source, index) => {
		const task = { ...source };
		const workflowPhase = data.translationStatusMap[String(task.id)] ?? null;
		return {
			kind: "translation" as const,
			key: getQuestMenuItemKey("translation", task.id),
			section: "translation" as const,
			id: task.id,
			ordinal: index + 1,
			state: translationState(workflowPhase),
			hasUnread: false,
			workflowPhase,
			task,
		};
	});
}

export function buildQuestMenuSpreads(items: QuestMenuItem[]): QuestMenuSpread[] {
	const pagePairs = [
		{ leftItems: items.slice(0, 1), rightItems: items.slice(1, 3) },
		...Array.from({ length: Math.ceil(Math.max(0, items.length - 3) / 4) }, (_, index) => {
			const offset = 3 + index * 4;
			return { leftItems: items.slice(offset, offset + 2), rightItems: items.slice(offset + 2, offset + 4) };
		}),
	];

	return pagePairs.map((page, index) => ({
		leaf: index + 1,
		totalLeaves: pagePairs.length,
		items: [...page.leftItems, ...page.rightItems],
		...page,
	}));
}

const RECOMMENDATION_RANK: Record<QuestMenuItemState, number> = {
	active: 1,
	ready: 2,
	informational: 2,
	stopped: 3,
	finished: Number.POSITIVE_INFINITY,
};

function itemDifficulty(item: QuestMenuItem): number {
	return item.kind === "quest" ? item.task.templateDifficulty : item.task.difficulty;
}

function recommendationRank(item: QuestMenuItem): number {
	return item.hasUnread ? 0 : RECOMMENDATION_RANK[item.state];
}

export function deriveQuestMenuRecommendations(
	sections: Record<QuestMenuSection, QuestMenuItem[]>,
	levelSelfAssign: SelfAssignedLevel = 2,
): QuestMenuItem[] {
	const candidates = QUEST_MENU_SECTIONS.flatMap((section) => sections[section])
		.map((item, stableIndex) => ({ item, stableIndex }))
		.filter(({ item }) => item.state !== "finished" || item.hasUnread)
		.sort((left, right) => {
			const leftRank = recommendationRank(left.item);
			const rightRank = recommendationRank(right.item);
			if (leftRank !== rightRank) return leftRank - rightRank;
			if (leftRank === RECOMMENDATION_RANK.ready || leftRank === RECOMMENDATION_RANK.stopped) {
				const distance = Math.abs(itemDifficulty(left.item) - levelSelfAssign) - Math.abs(itemDifficulty(right.item) - levelSelfAssign);
				if (distance !== 0) return distance;
			}
			return left.stableIndex - right.stableIndex;
		})
		.map(({ item }) => item);

	const urgent = candidates.filter((item) => item.hasUnread || item.state === "active").slice(0, 2);
	if (urgent.length === 2) return urgent;

	const selected = [...urgent];
	const first = selected[0] ?? candidates[0];
	if (!first) return [];
	if (selected.length === 0) selected.push(first);

	const remaining = candidates.filter((item) => !selected.some((selectedItem) => selectedItem.key === item.key));
	const bestRemainingRank = remaining[0] ? recommendationRank(remaining[0]) : null;
	const second = remaining.find((item) => recommendationRank(item) === bestRemainingRank && item.section !== first.section) ?? remaining[0];
	if (second) selected.push(second);
	return selected.slice(0, 2);
}

export function adaptHallDataToQuestMenu(
	data: Pick<HallData, "dailyTasks" | "weeklyTasks" | "translationTasks" | "translationStatusMap" | "translationMonth" | "levelSelfAssign">,
	translationMonth = data.translationMonth,
): QuestMenuCatalog {
	const daily = adaptQuestItems(data.dailyTasks, "daily");
	const weekly = adaptQuestItems(data.weeklyTasks, "weekly");
	const translation = adaptTranslationItems(
		data,
		data.translationTasks.filter((task) => task.createdMonth === translationMonth),
	);
	const sections: Record<QuestMenuSection, QuestMenuItem[]> = {
		daily,
		weekly,
		translation,
	};
	const recommendationSections: Record<QuestMenuSection, QuestMenuItem[]> = {
		daily,
		weekly,
		translation: adaptTranslationItems(data, data.translationTasks),
	};
	return {
		sections,
		spreads: {
			daily: buildQuestMenuSpreads(sections.daily),
			weekly: buildQuestMenuSpreads(sections.weekly),
			translation: buildQuestMenuSpreads(sections.translation),
		},
		recommendations: deriveQuestMenuRecommendations(recommendationSections, data.levelSelfAssign),
	};
}

export function getQuestMenuSpread(catalog: QuestMenuCatalog, section: QuestMenuSection, requestedLeaf: number): QuestMenuSpread {
	const spreads = catalog.spreads[section];
	const leaf = Number.isSafeInteger(requestedLeaf) && requestedLeaf > 0 ? Math.min(requestedLeaf, spreads.length) : 1;
	return spreads[leaf - 1];
}

export function getQuestMenuLocations(catalog: QuestMenuCatalog): QuestMenuLocationTarget[] {
	return QUEST_MENU_SECTIONS.flatMap((section) => catalog.spreads[section].map((spread) => ({ section, leaf: spread.leaf })));
}

export function getQuestMenuFolio(catalog: QuestMenuCatalog, section: QuestMenuSection, leaf: number): { current: number; total: number } {
	const locations = getQuestMenuLocations(catalog);
	const normalizedLeaf = getQuestMenuSpread(catalog, section, leaf).leaf;
	const index = locations.findIndex((location) => location.section === section && location.leaf === normalizedLeaf);
	return { current: Math.max(0, index) + 1, total: locations.length };
}

export function getQuestMenuTurnTarget(
	catalog: QuestMenuCatalog,
	section: QuestMenuSection,
	leaf: number,
	direction: -1 | 1,
): QuestMenuLocationTarget | null {
	const locations = getQuestMenuLocations(catalog);
	const normalizedLeaf = getQuestMenuSpread(catalog, section, leaf).leaf;
	const index = locations.findIndex((location) => location.section === section && location.leaf === normalizedLeaf);
	return locations[index + direction] ?? null;
}

export function getQuestMenuNarrowTarget(
	catalog: QuestMenuCatalog,
	section: QuestMenuSection,
	leaf: number,
	itemKey: QuestMenuItemKey | null,
	direction: -1 | 1,
): QuestMenuNarrowTarget | null {
	const spread = getQuestMenuSpread(catalog, section, leaf);
	const currentIndex = Math.max(
		0,
		spread.items.findIndex((item) => item.key === itemKey),
	);
	const nextItem = spread.items[currentIndex + direction];
	if (nextItem) return { section, leaf: spread.leaf, itemKey: nextItem.key };

	const nextLocation = getQuestMenuTurnTarget(catalog, section, spread.leaf, direction);
	if (!nextLocation) return null;
	const nextSpread = getQuestMenuSpread(catalog, nextLocation.section, nextLocation.leaf);
	const destination = direction === 1 ? nextSpread.items[0] : nextSpread.items.at(-1);
	return { ...nextLocation, itemKey: destination?.key ?? null };
}

export function getQuestMenuItemHref(item: QuestMenuItem, base: string): string {
	return item.kind === "translation" ? `${base}/translate/${item.id}` : `${base}/task/${item.id}`;
}

export function getQuestMenuUnreadCount(catalog: QuestMenuCatalog): number {
	return [...catalog.sections.daily, ...catalog.sections.weekly].reduce(
		(total, item) => total + (item.kind === "quest" ? Math.max(0, Math.floor(item.task.unreadCount ?? 0)) : 0),
		0,
	);
}
