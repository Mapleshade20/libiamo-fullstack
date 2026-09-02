import type { HallQuest, HallQuestSessionStatus } from "$lib/quest-hall";
import { isHallQuestFinished } from "$lib/quest-hall";

export const QUEST_HALL_DEMO_SCENARIOS = [
	"actual",
	"fresh",
	"first-complete",
	"mixed",
	"third-in-progress",
	"all-complete",
	"feedback-unread",
	"daily-five",
	"daily-empty",
	"weekly-empty",
	"translation-empty",
] as const;
export const QUEST_HALL_DEMO_VIEWS = ["home", "catalog", "prepare"] as const;
export const QUEST_HALL_DEMO_SECTIONS = ["daily", "weekly", "translation"] as const;
export const QUEST_HALL_DEMO_RESOURCES = ["ready", "loading", "error"] as const;
export const QUEST_HALL_DEMO_MOTIONS = ["system", "reduce"] as const;

export type QuestHallDemoScenario = (typeof QUEST_HALL_DEMO_SCENARIOS)[number];
export type QuestHallDemoView = (typeof QUEST_HALL_DEMO_VIEWS)[number];
export type QuestHallDemoSection = (typeof QUEST_HALL_DEMO_SECTIONS)[number];
export type QuestHallDemoResource = (typeof QUEST_HALL_DEMO_RESOURCES)[number];
export type QuestHallDemoMotion = (typeof QUEST_HALL_DEMO_MOTIONS)[number];
export type QuestHallDemoTaskKey = `${QuestHallDemoSection}-${number}`;

export interface QuestHallDemoUrlState {
	scenario: QuestHallDemoScenario;
	view: QuestHallDemoView;
	section: QuestHallDemoSection;
	leaf: number;
	task: QuestHallDemoTaskKey | null;
	resource: QuestHallDemoResource;
	motion: QuestHallDemoMotion;
}

export const DEFAULT_QUEST_HALL_DEMO_URL_STATE: Readonly<QuestHallDemoUrlState> = {
	scenario: "mixed",
	view: "home",
	section: "daily",
	leaf: 1,
	task: null,
	resource: "ready",
	motion: "system",
};

export interface QuestHallTranslationSummary {
	id: number;
	titleBase: string;
	descriptionBase: string | null;
	difficulty: number;
	createdMonth: string;
}

export interface QuestHallDemoData {
	dailyTasks: HallQuest[];
	weeklyTasks: HallQuest[];
	translationTasks: QuestHallTranslationSummary[];
	translationStatusMap: Record<string, string>;
	translationMonth: string;
	editionDate: string;
	greeting: string;
	subtitle: string;
}

type SearchParamsInput = URL | URLSearchParams | Pick<URLSearchParams, "get"> | string;

function isOneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
	return typeof value === "string" && (values as readonly string[]).includes(value);
}

function readSearchParams(input: SearchParamsInput): Pick<URLSearchParams, "get"> {
	if (typeof input !== "string") return input instanceof URL ? input.searchParams : input;
	if (input.startsWith("?") || (!input.includes("://") && !input.startsWith("/"))) {
		return new URLSearchParams(input.replace(/^\?/, "").split("#", 1)[0]);
	}
	return new URL(input, "https://quest-hall-demo.invalid").searchParams;
}

function normalizeLeaf(value: unknown): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function getQuestHallDemoTaskKey(section: QuestHallDemoSection, id: number): QuestHallDemoTaskKey {
	if (!Number.isSafeInteger(id) || id < 0) throw new RangeError("Quest Hall demo task ids must be non-negative safe integers");
	return `${section}-${id}`;
}

export function getQuestHallDemoTaskSection(key: string | null | undefined): QuestHallDemoSection | null {
	const match = /^(daily|weekly|translation)-(\d+)$/.exec(key ?? "");
	return match ? (match[1] as QuestHallDemoSection) : null;
}

function normalizeTaskKey(value: unknown): QuestHallDemoTaskKey | null {
	return typeof value === "string" && getQuestHallDemoTaskSection(value) ? (value as QuestHallDemoTaskKey) : null;
}

export function normalizeQuestHallDemoUrlState(state: Partial<QuestHallDemoUrlState>): QuestHallDemoUrlState {
	const scenario = isOneOf(QUEST_HALL_DEMO_SCENARIOS, state.scenario) ? state.scenario : DEFAULT_QUEST_HALL_DEMO_URL_STATE.scenario;
	let view = isOneOf(QUEST_HALL_DEMO_VIEWS, state.view) ? state.view : DEFAULT_QUEST_HALL_DEMO_URL_STATE.view;
	let section = isOneOf(QUEST_HALL_DEMO_SECTIONS, state.section) ? state.section : DEFAULT_QUEST_HALL_DEMO_URL_STATE.section;
	let task = normalizeTaskKey(state.task);

	if (view === "prepare" && !task) view = "catalog";
	if (view !== "prepare") task = null;
	if (task) section = getQuestHallDemoTaskSection(task) ?? section;

	return {
		scenario,
		view,
		section,
		leaf: normalizeLeaf(state.leaf),
		task,
		resource: isOneOf(QUEST_HALL_DEMO_RESOURCES, state.resource) ? state.resource : DEFAULT_QUEST_HALL_DEMO_URL_STATE.resource,
		motion: isOneOf(QUEST_HALL_DEMO_MOTIONS, state.motion) ? state.motion : DEFAULT_QUEST_HALL_DEMO_URL_STATE.motion,
	};
}

export function parseQuestHallDemoUrlState(input: SearchParamsInput): QuestHallDemoUrlState {
	const params = readSearchParams(input);
	const scenarioValue = params.get("scenario") ?? params.get("demoState");
	const viewValue = params.get("view");
	const sectionValue = params.get("section");
	const resourceValue = params.get("resource");
	const motionValue = params.get("motion");

	return normalizeQuestHallDemoUrlState({
		scenario: isOneOf(QUEST_HALL_DEMO_SCENARIOS, scenarioValue) ? scenarioValue : undefined,
		view: isOneOf(QUEST_HALL_DEMO_VIEWS, viewValue) ? viewValue : undefined,
		section: isOneOf(QUEST_HALL_DEMO_SECTIONS, sectionValue) ? sectionValue : undefined,
		leaf: Number(params.get("leaf")),
		task: normalizeTaskKey(params.get("task")),
		resource: isOneOf(QUEST_HALL_DEMO_RESOURCES, resourceValue) ? resourceValue : undefined,
		motion: isOneOf(QUEST_HALL_DEMO_MOTIONS, motionValue) ? motionValue : undefined,
	});
}

export function serializeQuestHallDemoUrlState(state: QuestHallDemoUrlState, includeDefaults = false): string {
	const normalized = normalizeQuestHallDemoUrlState(state);
	const params = new URLSearchParams();
	const defaults = DEFAULT_QUEST_HALL_DEMO_URL_STATE;

	if (includeDefaults || normalized.scenario !== defaults.scenario) params.set("scenario", normalized.scenario);
	if (includeDefaults || normalized.view !== defaults.view) params.set("view", normalized.view);
	if (includeDefaults || normalized.section !== defaults.section) params.set("section", normalized.section);
	if (includeDefaults || normalized.leaf !== defaults.leaf) params.set("leaf", String(normalized.leaf));
	if (normalized.task) params.set("task", normalized.task);
	if (includeDefaults || normalized.resource !== defaults.resource) params.set("resource", normalized.resource);
	if (includeDefaults || normalized.motion !== defaults.motion) params.set("motion", normalized.motion);
	return params.toString();
}

type SimulatedQuestState = "fresh" | "first-complete" | "mixed" | "all-complete" | "feedback-unread";

function simulateQuestTasks(tasks: HallQuest[], state: SimulatedQuestState): HallQuest[] {
	return tasks.map((task, index) => {
		let sessionStatus: HallQuestSessionStatus = null;
		let unreadCount: number | null = null;
		if (state === "first-complete" && index === 0) sessionStatus = "completed";
		if (state === "mixed") {
			if (index === 0) sessionStatus = "completed";
			if (index === 2) sessionStatus = "in_progress";
		}
		if (state === "all-complete") sessionStatus = "completed";
		if (state === "feedback-unread" && index === 0) {
			sessionStatus = "evaluated";
			unreadCount = 1;
		}

		return { ...task, sessionStatus, unreadCount, hasUnreadReply: unreadCount !== null && unreadCount > 0 };
	});
}

function expandDailyTasksToFive(data: QuestHallDemoData): HallQuest[] {
	if (data.dailyTasks.length >= 5) return [...data.dailyTasks];
	const seen = new Set(data.dailyTasks.map((task) => task.id));
	const borrowed = data.weeklyTasks.filter((task) => !seen.has(task.id)).slice(0, 5 - data.dailyTasks.length);
	return [...data.dailyTasks, ...borrowed];
}

export function applyQuestHallDemoScenario<T extends QuestHallDemoData>(
	data: T,
	scenario: QuestHallDemoScenario,
): T & { demoScenario: QuestHallDemoScenario } {
	if (scenario === "actual") return { ...data, demoScenario: scenario };

	const dailyMode: SimulatedQuestState =
		scenario === "fresh" || scenario === "first-complete" || scenario === "all-complete" || scenario === "feedback-unread" ? scenario : "mixed";
	const dailyTasks = scenario === "daily-five" ? expandDailyTasksToFive(data) : data.dailyTasks;

	return {
		...data,
		demoScenario: scenario,
		dailyTasks: scenario === "daily-empty" ? [] : simulateQuestTasks(dailyTasks, scenario === "daily-five" ? "fresh" : dailyMode),
		weeklyTasks: scenario === "weekly-empty" ? [] : simulateQuestTasks(data.weeklyTasks, scenario === "all-complete" ? "all-complete" : "fresh"),
		translationTasks: scenario === "translation-empty" ? [] : data.translationTasks.map((task) => ({ ...task })),
		translationStatusMap: scenario === "all-complete" ? Object.fromEntries(data.translationTasks.map((task) => [String(task.id), "completed"])) : {},
	};
}

export function getQuestHallDemoUnreadReplyCount(data: Pick<QuestHallDemoData, "dailyTasks" | "weeklyTasks">): number {
	return [...data.dailyTasks, ...data.weeklyTasks].reduce((total, task) => total + Math.max(0, Math.floor(task.unreadCount ?? 0)), 0);
}

export type QuestHallDemoItemStatus = "not-started" | "in-progress" | "completed" | "abandoned";

interface QuestHallDemoItemBase {
	key: QuestHallDemoTaskKey;
	section: QuestHallDemoSection;
	id: number;
	ordinal: number;
	status: QuestHallDemoItemStatus;
	hasUnread: boolean;
}

export type QuestHallDemoItem =
	| (QuestHallDemoItemBase & { kind: "quest"; task: HallQuest })
	| (QuestHallDemoItemBase & { kind: "translation"; task: QuestHallTranslationSummary; workflowPhase: string | null });

function getQuestItemStatus(task: HallQuest): QuestHallDemoItemStatus {
	if (isHallQuestFinished(task.sessionStatus)) return "completed";
	if (task.sessionStatus === "in_progress") return "in-progress";
	if (task.sessionStatus === "abandoned") return "abandoned";
	return "not-started";
}

export function getQuestHallDemoItems(data: QuestHallDemoData, section: QuestHallDemoSection): QuestHallDemoItem[] {
	if (section === "translation") {
		return data.translationTasks.map((task, index) => {
			const workflowPhase = data.translationStatusMap[String(task.id)] ?? null;
			return {
				kind: "translation" as const,
				key: getQuestHallDemoTaskKey(section, task.id),
				section,
				id: task.id,
				ordinal: index + 1,
				task,
				workflowPhase,
				status: workflowPhase === "completed" ? "completed" : workflowPhase ? "in-progress" : "not-started",
				hasUnread: false,
			};
		});
	}

	const tasks = section === "daily" ? data.dailyTasks : data.weeklyTasks;
	return tasks.map((task, index) => ({
		kind: "quest" as const,
		key: getQuestHallDemoTaskKey(section, task.id),
		section,
		id: task.id,
		ordinal: index + 1,
		task,
		status: getQuestItemStatus(task),
		hasUnread: task.hasUnreadReply,
	}));
}

const RECOMMENDATION_STATUS_RANK = { "in-progress": 0, "not-started": 1, abandoned: 2 } as const;

function getRecommendationRank(item: QuestHallDemoItem): number {
	if (item.hasUnread) return -1;
	return RECOMMENDATION_STATUS_RANK[item.status as keyof typeof RECOMMENDATION_STATUS_RANK] ?? Number.POSITIVE_INFINITY;
}

export function deriveQuestHallDemoRecommendations(data: QuestHallDemoData): QuestHallDemoItem[] {
	const candidates = QUEST_HALL_DEMO_SECTIONS.flatMap((section) => getQuestHallDemoItems(data, section))
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => item.status !== "completed" || item.hasUnread)
		.sort((a, b) => {
			const leftRank = getRecommendationRank(a.item);
			const rightRank = getRecommendationRank(b.item);
			return leftRank - rightRank || a.index - b.index;
		})
		.map(({ item }) => item);

	const immediate = candidates.filter((item) => item.hasUnread || item.status === "in-progress").slice(0, 2);
	if (immediate.length === 2) return immediate;

	const selected = [...immediate];
	const first = selected[0] ?? candidates[0];
	if (!first) return [];
	if (selected.length === 0) selected.push(first);
	const remaining = candidates.filter((item) => !selected.some((selectedItem) => selectedItem.key === item.key));
	const second = remaining.find((item) => item.section !== first.section) ?? remaining[0];
	if (second) selected.push(second);
	return selected.slice(0, 2);
}

export interface QuestHallDemoBookSpread {
	leaf: number;
	totalLeaves: number;
	items: QuestHallDemoItem[];
	leftItems: QuestHallDemoItem[];
	rightItems: QuestHallDemoItem[];
}

export function deriveQuestHallDemoBookSpreads(data: QuestHallDemoData, section: QuestHallDemoSection): QuestHallDemoBookSpread[] {
	const items = getQuestHallDemoItems(data, section);
	const pages = [
		{ leftItems: items.slice(0, 1), rightItems: items.slice(1, 3) },
		...Array.from({ length: Math.ceil(Math.max(0, items.length - 3) / 4) }, (_, index) => {
			const offset = 3 + index * 4;
			return { leftItems: items.slice(offset, offset + 2), rightItems: items.slice(offset + 2, offset + 4) };
		}),
	];
	const totalLeaves = pages.length;
	return pages.map((page, index) => ({
		leaf: index + 1,
		totalLeaves,
		items: [...page.leftItems, ...page.rightItems],
		...page,
	}));
}

export function getQuestHallDemoBookSpread(data: QuestHallDemoData, section: QuestHallDemoSection, requestedLeaf: number): QuestHallDemoBookSpread {
	const spreads = deriveQuestHallDemoBookSpreads(data, section);
	const leaf = Math.min(normalizeLeaf(requestedLeaf), spreads.length);
	return spreads[leaf - 1];
}

export interface QuestHallDemoCatalogPagePosition {
	current: number;
	total: number;
}

function deriveQuestHallDemoCatalogPageLocations(data: QuestHallDemoData): Array<{ section: QuestHallDemoSection; leaf: number }> {
	return QUEST_HALL_DEMO_SECTIONS.flatMap((section) =>
		deriveQuestHallDemoBookSpreads(data, section).map((spread) => ({ section, leaf: spread.leaf })),
	);
}

export function getQuestHallDemoCatalogPagePosition(
	data: QuestHallDemoData,
	section: QuestHallDemoSection,
	leaf: number,
): QuestHallDemoCatalogPagePosition {
	const pages = deriveQuestHallDemoCatalogPageLocations(data);
	const normalizedLeaf = getQuestHallDemoBookSpread(data, section, leaf).leaf;
	const pageIndex = pages.findIndex((page) => page.section === section && page.leaf === normalizedLeaf);
	return { current: Math.max(0, pageIndex) + 1, total: pages.length };
}

export function getQuestHallDemoCatalogTurnTarget(
	data: QuestHallDemoData,
	section: QuestHallDemoSection,
	leaf: number,
	direction: -1 | 1,
): { section: QuestHallDemoSection; leaf: number } | null {
	const pages = deriveQuestHallDemoCatalogPageLocations(data);
	const normalizedLeaf = getQuestHallDemoBookSpread(data, section, leaf).leaf;
	const currentIndex = pages.findIndex((page) => page.section === section && page.leaf === normalizedLeaf);
	return pages[currentIndex + direction] ?? null;
}

export type QuestHallDemoHistoryIntent = "push" | "replace" | "back" | "none";
export type QuestHallDemoEvent =
	| { type: "open-catalog"; section?: QuestHallDemoSection }
	| { type: "close-catalog" }
	| { type: "switch-section"; section: QuestHallDemoSection; leaf?: number }
	| { type: "turn-leaf"; leaf: number }
	| { type: "select-task"; task: QuestHallDemoTaskKey }
	| { type: "return-from-prepare"; destination?: "home" | "catalog" }
	| { type: "set-scenario"; scenario: QuestHallDemoScenario }
	| { type: "set-resource"; resource: QuestHallDemoResource }
	| { type: "set-motion"; motion: QuestHallDemoMotion };

export interface QuestHallDemoTransition {
	state: QuestHallDemoUrlState;
	historyIntent: QuestHallDemoHistoryIntent;
}

const QUEST_HALL_DEMO_URL_STATE_KEYS: ReadonlyArray<keyof QuestHallDemoUrlState> = [
	"scenario",
	"view",
	"section",
	"leaf",
	"task",
	"resource",
	"motion",
];

function statesEqual(left: QuestHallDemoUrlState, right: QuestHallDemoUrlState): boolean {
	return QUEST_HALL_DEMO_URL_STATE_KEYS.every((key) => left[key] === right[key]);
}

function makeTransition(
	current: QuestHallDemoUrlState,
	next: Partial<QuestHallDemoUrlState>,
	historyIntent: Exclude<QuestHallDemoHistoryIntent, "none">,
): QuestHallDemoTransition {
	const state = normalizeQuestHallDemoUrlState({ ...current, ...next });
	return statesEqual(current, state) ? { state: current, historyIntent: "none" } : { state, historyIntent };
}

export function reduceQuestHallDemoState(current: QuestHallDemoUrlState, event: QuestHallDemoEvent): QuestHallDemoTransition {
	switch (event.type) {
		case "open-catalog":
			return makeTransition(
				current,
				{
					view: "catalog",
					section: event.section ?? current.section,
					leaf: event.section && event.section !== current.section ? 1 : current.leaf,
					task: null,
				},
				"push",
			);
		case "close-catalog":
			return makeTransition(current, { view: "home", task: null }, "back");
		case "switch-section":
			return makeTransition(current, { section: event.section, leaf: event.leaf ?? 1, task: null }, "replace");
		case "turn-leaf":
			return makeTransition(current, { leaf: event.leaf }, "replace");
		case "select-task":
			return makeTransition(
				current,
				{ view: "prepare", section: getQuestHallDemoTaskSection(event.task) ?? current.section, task: event.task },
				"push",
			);
		case "return-from-prepare":
			return makeTransition(current, { view: event.destination ?? "catalog", task: null }, "back");
		case "set-scenario":
			return makeTransition(current, { scenario: event.scenario }, "replace");
		case "set-resource":
			return makeTransition(current, { resource: event.resource }, "replace");
		case "set-motion":
			return makeTransition(current, { motion: event.motion }, "replace");
	}
}

// Compatibility surface for the first-generation layout demos.
export const QUEST_HALL_DEMO_STATES = ["actual", "fresh", "first-complete", "third-in-progress", "all-complete"] as const;
export type QuestHallDemoState = (typeof QUEST_HALL_DEMO_STATES)[number];
export const QUEST_HALL_DEMO_STATE_OPTIONS: ReadonlyArray<{ value: QuestHallDemoState; label: string; description: string }> = [
	{ value: "actual", label: "真实状态", description: "直接使用当前账号的任务状态。" },
	{ value: "fresh", label: "0/3 未开始", description: "三个今日任务都尚未开始。" },
	{ value: "first-complete", label: "1/3 已完成", description: "01 完成并降级，02 晋升为主任务。" },
	{ value: "third-in-progress", label: "03 进行中", description: "01 已完成，03 因正在进行而优先晋升。" },
	{ value: "all-complete", label: "3/3 已完成", description: "今日任务全部完成，页面进入结刊状态。" },
];

export function parseQuestHallDemoState(value: string | null | undefined): QuestHallDemoState {
	return isOneOf(QUEST_HALL_DEMO_STATES, value) ? value : "actual";
}

export function applyQuestHallDemoState<T extends Pick<QuestHallDemoData, "dailyTasks">>(
	data: T,
	state: QuestHallDemoState,
): T & { demoState: QuestHallDemoState } {
	if (state === "actual") return { ...data, demoState: state };
	return {
		...data,
		demoState: state,
		dailyTasks: simulateQuestTasks(data.dailyTasks, state === "third-in-progress" ? "mixed" : state),
	};
}
