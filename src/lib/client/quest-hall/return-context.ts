import type { LanguageCode } from "$lib/constants";
import { getQuestMenuItemId, getQuestMenuItemSection, type QuestMenuItemKey, type QuestMenuSection } from "$lib/quest-hall/menu";
import { hallLocationUrl } from "$lib/quest-hall/navigation";

export const QUEST_HALL_RETURN_CONTEXT_VERSION = 1;
export const QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY = "libiamo:quest-hall:return-context";
const QUEST_HALL_RETURN_ACCOUNT_STORAGE_KEY = "libiamo:quest-hall:return-account";

export type QuestHallReturnOrigin = "home" | "catalog" | "translation-index";
export type QuestHallReturnFocusTarget = "preparation" | "translation-item";

export interface QuestHallReturnContext {
	version: typeof QUEST_HALL_RETURN_CONTEXT_VERSION;
	accountScope: string;
	activeLanguage: LanguageCode;
	edition: string;
	origin: QuestHallReturnOrigin;
	section: QuestMenuSection;
	spread: number;
	narrowItemKey: QuestMenuItemKey | null;
	selectedKey: QuestMenuItemKey;
	translationMonth: string;
	scrollOffset: number;
	focusTarget: QuestHallReturnFocusTarget;
}

export interface QuestHallReturnStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

interface RestoreOptions {
	accountScope: string;
	activeLanguage: LanguageCode;
	edition: string;
	translationMonths: ReadonlySet<string>;
	itemKeys: ReadonlySet<string>;
	translationItemMonths: ReadonlyMap<string, string>;
	spreadCounts: Record<QuestMenuSection, number>;
	storage?: QuestHallReturnStorage | null;
}

interface WorkflowReturnOptions {
	destination: "details" | "home";
	accountScope: string;
	activeLanguage: LanguageCode;
	edition: string;
	item: { kind: "quest" | "translation"; id: number };
	base: string;
	fallbackHref: string;
	storage?: QuestHallReturnStorage | null;
}

function browserStorage(): QuestHallReturnStorage | null {
	if (typeof sessionStorage === "undefined") return null;
	return sessionStorage;
}

function isLanguage(value: unknown): value is LanguageCode {
	return value === "en" || value === "es" || value === "fr" || value === "ja";
}

function isSection(value: unknown): value is QuestMenuSection {
	return value === "daily" || value === "weekly" || value === "translation";
}

function isItemKey(value: unknown): value is QuestMenuItemKey {
	return typeof value === "string" && getQuestMenuItemSection(value) !== null;
}

function isDate(value: unknown): value is string {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMonth(value: unknown): value is string {
	return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function parseContext(raw: string | null): QuestHallReturnContext | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<QuestHallReturnContext>;
		if (
			value.version !== QUEST_HALL_RETURN_CONTEXT_VERSION ||
			typeof value.accountScope !== "string" ||
			!value.accountScope ||
			!isLanguage(value.activeLanguage) ||
			!isDate(value.edition) ||
			(value.origin !== "home" && value.origin !== "catalog" && value.origin !== "translation-index") ||
			!isSection(value.section) ||
			!Number.isSafeInteger(value.spread) ||
			Number(value.spread) < 1 ||
			(value.narrowItemKey !== null && !isItemKey(value.narrowItemKey)) ||
			!isItemKey(value.selectedKey) ||
			!isMonth(value.translationMonth) ||
			typeof value.scrollOffset !== "number" ||
			!Number.isFinite(value.scrollOffset) ||
			value.scrollOffset < 0 ||
			(value.focusTarget !== "preparation" && value.focusTarget !== "translation-item")
		) {
			return null;
		}
		return value as QuestHallReturnContext;
	} catch {
		return null;
	}
}

function removeContext(storage: QuestHallReturnStorage): void {
	try {
		storage.removeItem(QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY);
	} catch {
		/* unavailable */
	}
}

function readContext(storage: QuestHallReturnStorage): QuestHallReturnContext | null {
	try {
		return parseContext(storage.getItem(QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY));
	} catch {
		return null;
	}
}

export function saveQuestHallReturnContext(
	context: Omit<QuestHallReturnContext, "version">,
	storage: QuestHallReturnStorage | null = browserStorage(),
): void {
	if (!storage) return;
	try {
		storage.setItem(
			QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY,
			JSON.stringify({ version: QUEST_HALL_RETURN_CONTEXT_VERSION, ...context } satisfies QuestHallReturnContext),
		);
	} catch {
		/* unavailable */
	}
}

export function restoreQuestHallReturnContext(options: RestoreOptions): QuestHallReturnContext | null {
	const storage = options.storage === undefined ? browserStorage() : options.storage;
	if (!storage) return null;
	const context = readContext(storage);
	if (!context) {
		removeContext(storage);
		return null;
	}
	const accountMatches = context.accountScope === options.accountScope;
	const selectedSection = getQuestMenuItemSection(context.selectedKey);
	const narrowSection = context.narrowItemKey ? getQuestMenuItemSection(context.narrowItemKey) : context.section;
	const originMatches =
		context.origin === "translation-index"
			? context.section === "translation" && context.focusTarget === "translation-item"
			: context.focusTarget === "preparation";
	const translationMonthMatches =
		selectedSection !== "translation" || options.translationItemMonths.get(context.selectedKey) === context.translationMonth;
	const valid =
		accountMatches &&
		context.activeLanguage === options.activeLanguage &&
		context.edition === options.edition &&
		options.translationMonths.has(context.translationMonth) &&
		originMatches &&
		translationMonthMatches &&
		selectedSection === context.section &&
		narrowSection === context.section &&
		options.itemKeys.has(context.selectedKey) &&
		(context.narrowItemKey === null || options.itemKeys.has(context.narrowItemKey)) &&
		context.spread <= options.spreadCounts[context.section];
	if (!valid) {
		removeContext(storage);
		return null;
	}
	return context;
}

export function getQuestHallWorkflowReturnHref(options: WorkflowReturnOptions): string {
	const storage = options.storage === undefined ? browserStorage() : options.storage;
	if (options.destination === "home") {
		if (storage) removeContext(storage);
		return `${options.base}/`;
	}
	if (!storage) return options.fallbackHref;
	const context = readContext(storage);
	if (!context) {
		removeContext(storage);
		return options.fallbackHref;
	}
	if (context.accountScope !== options.accountScope) {
		removeContext(storage);
		return options.fallbackHref;
	}
	if (context.activeLanguage !== options.activeLanguage || context.edition !== options.edition) {
		removeContext(storage);
		return options.fallbackHref;
	}
	const selectedSection = getQuestMenuItemSection(context.selectedKey);
	const originMatches =
		context.origin === "translation-index"
			? context.section === "translation" && context.focusTarget === "translation-item"
			: context.focusTarget === "preparation";
	if (!originMatches || context.section !== selectedSection) {
		removeContext(storage);
		return options.fallbackHref;
	}
	const itemMatches =
		getQuestMenuItemId(context.selectedKey) === options.item.id &&
		(options.item.kind === "translation" ? selectedSection === "translation" : selectedSection === "daily" || selectedSection === "weekly");
	if (!itemMatches) return options.fallbackHref;
	if (context.origin === "translation-index") return `${options.base}/?return=translation`;
	return hallLocationUrl(
		{
			view: "prepare",
			section: context.section,
			leaf: context.spread,
			task: context.selectedKey,
		},
		options.base,
	);
}

export function synchronizeQuestHallReturnAccount(accountScope: string, storage: QuestHallReturnStorage | null = browserStorage()): void {
	if (!storage) return;
	try {
		const previous = storage.getItem(QUEST_HALL_RETURN_ACCOUNT_STORAGE_KEY);
		if (previous && previous !== accountScope) removeContext(storage);
		storage.setItem(QUEST_HALL_RETURN_ACCOUNT_STORAGE_KEY, accountScope);
	} catch {
		/* unavailable */
	}
}

export function clearQuestHallReturnContext(
	storage: QuestHallReturnStorage | null = browserStorage(),
	options: { clearAccount?: boolean } = {},
): void {
	if (!storage) return;
	removeContext(storage);
	if (!options.clearAccount) return;
	try {
		storage.removeItem(QUEST_HALL_RETURN_ACCOUNT_STORAGE_KEY);
	} catch {
		/* unavailable */
	}
}
