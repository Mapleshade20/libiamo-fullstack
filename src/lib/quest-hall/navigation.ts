import type { QuestMenuCatalog, QuestMenuItemKey, QuestMenuSection } from "$lib/quest-hall/menu";
import { getQuestMenuItemSection, getQuestMenuSpread } from "$lib/quest-hall/menu";

export const QUEST_HALL_DEPENDENCY = "quest-hall:data";
export const HALL_VIEWS = ["home", "catalog", "prepare"] as const;
export type HallView = (typeof HALL_VIEWS)[number];

export interface HallLocation {
	view: HallView;
	section: QuestMenuSection;
	leaf: number;
	task: QuestMenuItemKey | null;
}

export const DEFAULT_HALL_LOCATION: Readonly<HallLocation> = {
	view: "home",
	section: "daily",
	leaf: 1,
	task: null,
};

type SearchParamsInput = URL | URLSearchParams | Pick<URLSearchParams, "get"> | string;

function readSearchParams(input: SearchParamsInput): Pick<URLSearchParams, "get"> {
	if (typeof input !== "string") return input instanceof URL ? input.searchParams : input;
	if (input.startsWith("?") || (!input.includes("://") && !input.startsWith("/"))) {
		return new URLSearchParams(input.replace(/^\?/, "").split("#", 1)[0]);
	}
	return new URL(input, "https://quest-hall.invalid").searchParams;
}

function isView(value: unknown): value is HallView {
	return typeof value === "string" && (HALL_VIEWS as readonly string[]).includes(value);
}

function isSection(value: unknown): value is QuestMenuSection {
	return value === "daily" || value === "weekly" || value === "translation";
}

function normalizeLeaf(value: unknown): number {
	const leaf = typeof value === "number" ? value : Number(value);
	return Number.isSafeInteger(leaf) && leaf > 0 ? leaf : 1;
}

export function normalizeHallLocation(value: Partial<HallLocation>, catalog?: QuestMenuCatalog): HallLocation {
	let view = isView(value.view) ? value.view : DEFAULT_HALL_LOCATION.view;
	let section = isSection(value.section) ? value.section : DEFAULT_HALL_LOCATION.section;
	let task = typeof value.task === "string" && getQuestMenuItemSection(value.task) ? value.task : null;
	if (task) section = getQuestMenuItemSection(task) ?? section;
	if (task && catalog && !catalog.sections[section].some((item) => item.key === task)) task = null;
	if (view === "prepare" && !task) view = "catalog";
	if (view !== "prepare") task = null;

	const requestedLeaf = normalizeLeaf(value.leaf);
	const leaf = catalog ? getQuestMenuSpread(catalog, section, requestedLeaf).leaf : requestedLeaf;
	return { view, section, leaf, task };
}

export function parseHallLocation(input: SearchParamsInput, catalog?: QuestMenuCatalog): HallLocation {
	const params = readSearchParams(input);
	return normalizeHallLocation(
		{
			view: params.get("view") ?? undefined,
			section: params.get("section") ?? undefined,
			leaf: params.get("leaf") ?? undefined,
			task: params.get("task") ?? undefined,
		} as Partial<HallLocation>,
		catalog,
	);
}

export function hallLocationUrl(location: HallLocation, base: string): string {
	const normalized = normalizeHallLocation(location);
	const params = new URLSearchParams();
	if (normalized.view !== "home") params.set("view", normalized.view);
	if (normalized.section !== "daily") params.set("section", normalized.section);
	if (normalized.leaf !== 1) params.set("leaf", String(normalized.leaf));
	if (normalized.task) params.set("task", normalized.task);
	const query = params.toString();
	return `${base}/${query ? `?${query}` : ""}`;
}

export type HallHistoryIntent = "push" | "replace" | "back" | "none";
export type HallNavigationEvent =
	| { type: "open-catalog"; section?: QuestMenuSection }
	| { type: "close-catalog" }
	| { type: "switch-section"; section: QuestMenuSection; leaf?: number }
	| { type: "turn-leaf"; section: QuestMenuSection; leaf: number }
	| { type: "select-item"; task: QuestMenuItemKey }
	| { type: "return-from-prepare"; destination?: "home" | "catalog" };

export interface HallNavigationTransition {
	location: HallLocation;
	historyIntent: HallHistoryIntent;
}

function locationsEqual(left: HallLocation, right: HallLocation): boolean {
	return left.view === right.view && left.section === right.section && left.leaf === right.leaf && left.task === right.task;
}

function transition(
	current: HallLocation,
	next: Partial<HallLocation>,
	historyIntent: Exclude<HallHistoryIntent, "none">,
	catalog?: QuestMenuCatalog,
): HallNavigationTransition {
	const location = normalizeHallLocation({ ...current, ...next }, catalog);
	return locationsEqual(current, location) ? { location: current, historyIntent: "none" } : { location, historyIntent };
}

export function reduceHallLocation(current: HallLocation, event: HallNavigationEvent, catalog?: QuestMenuCatalog): HallNavigationTransition {
	switch (event.type) {
		case "open-catalog":
			return transition(
				current,
				{
					view: "catalog",
					section: event.section ?? current.section,
					leaf: event.section && event.section !== current.section ? 1 : current.leaf,
					task: null,
				},
				"push",
				catalog,
			);
		case "close-catalog":
			return transition(current, { view: "home", task: null }, "back", catalog);
		case "switch-section":
			return transition(current, { view: "catalog", section: event.section, leaf: event.leaf ?? 1, task: null }, "replace", catalog);
		case "turn-leaf":
			return transition(current, { view: "catalog", section: event.section, leaf: event.leaf, task: null }, "replace", catalog);
		case "select-item":
			return transition(
				current,
				{ view: "prepare", section: getQuestMenuItemSection(event.task) ?? current.section, task: event.task },
				"push",
				catalog,
			);
		case "return-from-prepare":
			return transition(current, { view: event.destination ?? "catalog", task: null }, "back", catalog);
	}
}
