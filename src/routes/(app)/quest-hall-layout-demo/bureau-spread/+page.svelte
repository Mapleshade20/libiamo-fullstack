<script lang="ts">
import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import BookOpen from "@lucide/svelte/icons/book-open";
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import FileText from "@lucide/svelte/icons/file-text";
import Gauge from "@lucide/svelte/icons/gauge";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import Mail from "@lucide/svelte/icons/mail";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Star from "@lucide/svelte/icons/star";
import Wine from "@lucide/svelte/icons/wine";
import { onMount, tick, untrack } from "svelte";
import { goto } from "$app/navigation";
import { base } from "$app/paths";
import {
	CARTE_MOTION_TOKENS,
	type CarteDemoControlGroup,
	type CarteMotionScope,
	CoverEmblem,
	CoverUnreadBadge,
	createCarteMotionScope,
	DemoControls,
	prefersReducedCarteMotion,
	RibbonTabs,
	TaskStatusMark,
} from "$lib/components/quest-hall-demo";
import TaskPreparation from "$lib/components/task/TaskPreparation.svelte";
import TranslationPreparation from "$lib/components/translate/TranslationPreparation.svelte";
import { UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import type { HallQuestSessionStatus } from "$lib/quest-hall";
import {
	deriveQuestHallDemoRecommendations,
	getQuestHallDemoBookSpread,
	getQuestHallDemoCatalogPagePosition,
	getQuestHallDemoCatalogTurnTarget,
	getQuestHallDemoUnreadReplyCount,
	type QuestHallDemoBookSpread,
	type QuestHallDemoEvent,
	type QuestHallDemoItem,
	type QuestHallDemoMotion,
	type QuestHallDemoResource,
	type QuestHallDemoScenario,
	type QuestHallDemoSection,
	type QuestHallDemoUrlState,
	reduceQuestHallDemoState,
	serializeQuestHallDemoUrlState,
} from "$lib/quest-hall-demo";

let { data } = $props();
const initialDemoState = untrack(() => ({ ...data.demoState })) as QuestHallDemoUrlState;

const ROUTE = `${base}/quest-hall-layout-demo/bureau-spread`;
const CATALOG_COVER_OPEN_ROTATION = -180;
const CATALOG_COVER_OPEN_Z = 0;
const CATALOG_COVER_CLOSED_Z = 12;
const TURNING_SHEET_LIFT_Z = 12;
const SECTION_ORDER: QuestHallDemoSection[] = ["daily", "weekly", "translation"];
const SECTION_LABELS: Record<QuestHallDemoSection, string> = {
	daily: "Aujourd’hui",
	weekly: "Cette semaine",
	translation: "Traduction",
};
const SCENARIO_LABELS: ReadonlyArray<{ value: QuestHallDemoScenario; label: string }> = [
	{ value: "actual", label: "État réel" },
	{ value: "fresh", label: "Tout nouveau" },
	{ value: "first-complete", label: "01 terminée" },
	{ value: "mixed", label: "Mixte" },
	{ value: "third-in-progress", label: "03 en cours" },
	{ value: "all-complete", label: "Tout terminé" },
	{ value: "feedback-unread", label: "Réponse non lue" },
	{ value: "daily-five", label: "5 quotidiennes" },
	{ value: "daily-empty", label: "Quotidien vide" },
	{ value: "weekly-empty", label: "Hebdo vide" },
	{ value: "translation-empty", label: "Traduction vide" },
];

let rootEl = $state<HTMLElement>();
let homeStage = $state<HTMLElement>();
let recommendationsEl = $state<HTMLElement>();
let closedBookStack = $state<HTMLElement>();
let closedCover = $state<HTMLElement>();
let coverButton = $state<HTMLButtonElement>();
let catalogStage = $state<HTMLElement>();
let catalogBook = $state<HTMLElement>();
let catalogBookShadow = $state<HTMLElement>();
let catalogCover = $state<HTMLElement>();
let spreadContent = $state<HTMLElement>();
let catalogLeftPage = $state<HTMLElement>();
let catalogRightPage = $state<HTMLElement>();
let catalogLeftPageStack = $state<HTMLElement>();
let turningSheet = $state<HTMLElement>();
let mobileBook = $state<HTMLElement>();
let mobilePaper = $state<HTMLElement>();
let mobileEdgeTabs = $state<HTMLElement>();
let prepareStage = $state<HTMLElement>();
let prepareDock = $state<HTMLElement>();
let dockedCover = $state<HTMLElement>();
let preparationPanel = $state<HTMLElement>();
let coverHandoff = $state<HTMLElement>();

let motionScope: CarteMotionScope | null = null;
let systemReduced = $state(false);
let mounted = $state(false);
let visualView = $state(initialDemoState.view);
let transitionFrom = $state<QuestHallDemoUrlState["view"] | null>(null);
let transitionTo = $state<QuestHallDemoUrlState["view"] | null>(null);
let optimisticState = $state<QuestHallDemoUrlState>({ ...initialDemoState });
let pendingSignature = $state<string | null>(null);
let observedSignature = $state(stateSignature(initialDemoState));
let localHistoryDepth = $state(0);
let catalogReturnScrollY: number | null = null;
let mobilePosition = $state(0);
let mobileLocation = $state(`${initialDemoState.section}-${initialDemoState.leaf}`);
let lastSelectedKey = $state<string | null>(initialDemoState.task);
let isReplayingCompletion = $state(false);
let completionReplaySequence = 0;
let paperTurnSequence = 0;
let lastAnimatedUnreadReplyCount = 0;
let pendingPaperTurnSection: QuestHallDemoSection | null = null;
let turnPreview = $state<{
	direction: -1 | 1;
	usesSheet: boolean;
	fromSection: QuestHallDemoSection;
	toSection: QuestHallDemoSection;
	fromSpread: QuestHallDemoBookSpread;
	toSpread: QuestHallDemoBookSpread;
} | null>(null);
let isPaperTurning = $derived(turnPreview !== null);

let recommendations = $derived(deriveQuestHallDemoRecommendations(data).slice(0, 2));
let unreadReplyCount = $derived(getQuestHallDemoUnreadReplyCount(data));
let unreadReplySummary = $derived(`${unreadReplyCount} ${unreadReplyCount === 1 ? "nouvelle réponse non lue" : "nouvelles réponses non lues"}`);
let currentLeaf = $derived(getQuestHallDemoBookSpread(data, optimisticState.section, optimisticState.leaf));
let catalogPagePosition = $derived(getQuestHallDemoCatalogPagePosition(data, optimisticState.section, currentLeaf.leaf));
let staticLeftPage = $derived.by(() => {
	if (!turnPreview?.usesSheet) return { section: optimisticState.section, spread: currentLeaf };
	return turnPreview.direction > 0
		? { section: turnPreview.fromSection, spread: turnPreview.fromSpread }
		: { section: turnPreview.toSection, spread: turnPreview.toSpread };
});
let staticRightPage = $derived.by(() => {
	if (!turnPreview?.usesSheet) return { section: optimisticState.section, spread: currentLeaf };
	return turnPreview.direction > 0
		? { section: turnPreview.toSection, spread: turnPreview.toSpread }
		: { section: turnPreview.fromSection, spread: turnPreview.fromSpread };
});
let leftPageItems = $derived(staticLeftPage.spread.leftItems);
let rightPageItems = $derived(staticRightPage.spread.rightItems);
let previousTurnTarget = $derived(getQuestHallDemoCatalogTurnTarget(data, optimisticState.section, currentLeaf.leaf, -1));
let nextTurnTarget = $derived(getQuestHallDemoCatalogTurnTarget(data, optimisticState.section, currentLeaf.leaf, 1));
let currentMobileItem = $derived(currentLeaf.items[mobilePosition] ?? currentLeaf.items[0] ?? null);
let forceReduced = $derived(optimisticState.motion === "reduce");
let reducedMotion = $derived(forceReduced || systemReduced);
let liveMessage = $derived.by(() => {
	if (optimisticState.view === "home") {
		return `${recommendations.length} recommandations disponibles.${unreadReplyCount > 0 ? ` ${unreadReplySummary}.` : ""}`;
	}
	if (optimisticState.view === "prepare") return "Préparation de la mission sélectionnée.";
	return `${SECTION_LABELS[optimisticState.section]}, feuillet ${catalogPagePosition.current} sur ${catalogPagePosition.total}.`;
});
let ribbonTabs = $derived([
	{
		id: "daily",
		label: "Aujourd’hui",
		shortLabel: "Auj.",
		count: data.dailyTasks.length,
		tone: "wine" as const,
	},
	{
		id: "weekly",
		label: "Cette semaine",
		shortLabel: "Sem.",
		count: data.weeklyTasks.length,
		tone: "olive" as const,
	},
	{
		id: "translation",
		label: "Traduction",
		shortLabel: "Trad.",
		count: data.translationTasks.length,
		tone: "blue" as const,
	},
]);
let controlGroups = $derived([
	{
		id: "scenario",
		label: "Situation",
		value: optimisticState.scenario,
		options: SCENARIO_LABELS,
		onselect: (value: string) => setScenario(value as QuestHallDemoScenario),
	},
	{
		id: "resource",
		label: "Ressource",
		value: optimisticState.resource,
		options: [
			{ value: "ready", label: "Disponible" },
			{ value: "loading", label: "Chargement" },
			{ value: "error", label: "Erreur" },
		],
		onselect: (value: string) => setResource(value as QuestHallDemoResource),
	},
	{
		id: "motion",
		label: "Mouvement",
		value: optimisticState.motion,
		options: [
			{ value: "system", label: "Système" },
			{ value: "reduce", label: "Réduit" },
		],
		onselect: (value: string) => setMotion(value as QuestHallDemoMotion),
	},
] satisfies CarteDemoControlGroup[]);

function stateSignature(state: QuestHallDemoUrlState): string {
	return serializeQuestHallDemoUrlState(state, true);
}

function stateUrl(state: QuestHallDemoUrlState): string {
	const query = serializeQuestHallDemoUrlState(state);
	return `${ROUTE}${query ? `?${query}` : ""}`;
}

function folioFor(section: QuestHallDemoSection, leaf: number, side: "left" | "right"): string {
	const position = getQuestHallDemoCatalogPagePosition(data, section, leaf);
	const folio = position.current * 2 - (side === "left" ? 1 : 0);
	return String(folio).padStart(2, "0");
}

function isReduced(): boolean {
	return reducedMotion || prefersReducedCarteMotion(forceReduced);
}

function titleFor(item: QuestHallDemoItem): string {
	return item.kind === "quest" ? item.task.title : item.task.titleBase;
}

function objectiveFor(item: QuestHallDemoItem): string | null {
	return item.kind === "quest" ? item.task.shortObjective : item.task.descriptionBase;
}

function difficultyFor(item: QuestHallDemoItem): number {
	return item.kind === "quest" ? item.task.templateDifficulty : item.task.difficulty;
}

function difficultyLabel(level: number): string {
	return ["Débutant", "Intermédiaire", "Avancé"][level - 1] ?? `Niveau ${level}`;
}

function ordinalFor(item: QuestHallDemoItem): string {
	return String(item.ordinal).padStart(2, "0");
}

function channelFor(item: QuestHallDemoItem): string {
	if (item.kind === "translation") return "Traduction";
	return UI_VARIANT_LABELS[item.task.templateUi as UiVariant] ?? item.task.templateUi;
}

function sessionStatusFor(item: QuestHallDemoItem): HallQuestSessionStatus {
	if (item.kind === "quest") return item.task.sessionStatus;
	if (item.status === "completed") return "completed";
	if (item.status === "in-progress") return "in_progress";
	if (item.status === "abandoned") return "abandoned";
	return null;
}

function statusActionLabel(item: QuestHallDemoItem): string {
	if (item.status === "completed") return "Voir le bilan";
	if (item.status === "in-progress") return "Continuer";
	if (item.status === "abandoned") return "Reprendre";
	return "Voir les détails";
}

function setSceneObjectsTerminal(view: QuestHallDemoUrlState["view"]) {
	if (!motionScope) return;
	if (catalogBook) {
		motionScope.set(catalogBook, {
			x: "0%",
			y: 0,
			scaleX: 1,
			scaleY: 1,
			rotateX: 0,
			rotateZ: 0,
		});
	}
	if (catalogCover) {
		motionScope.set(catalogCover, {
			autoAlpha: view === "catalog" ? 0 : 1,
			rotateY: view === "catalog" ? CATALOG_COVER_OPEN_ROTATION : 0,
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			transformOrigin: "left center",
			z: view === "catalog" ? CATALOG_COVER_OPEN_Z : CATALOG_COVER_CLOSED_Z,
			zIndex: view === "catalog" ? 2 : 12,
		});
	}
	if (catalogBookShadow) {
		motionScope.set(catalogBookShadow, {
			autoAlpha: view === "catalog" ? 1 : 0,
			scaleX: view === "catalog" ? 1 : 0.5,
			scaleY: 1,
			transformOrigin: "right center",
		});
	}
	if (turningSheet) motionScope.set(turningSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 });
	if (spreadContent) motionScope.set(spreadContent, { autoAlpha: 1 });
	if (catalogLeftPage) {
		motionScope.set(catalogLeftPage, {
			autoAlpha: view === "catalog" ? 1 : 0,
			rotateY: 0,
			x: 0,
			y: 0,
			transformOrigin: "right center",
		});
	}
	if (catalogRightPage) motionScope.set(catalogRightPage, { autoAlpha: 1 });
	if (catalogLeftPageStack) motionScope.set(catalogLeftPageStack, { autoAlpha: view === "catalog" ? 1 : 0, x: 0 });
	if (mobileBook) motionScope.set(mobileBook, { autoAlpha: view === "catalog" ? 1 : 0, y: 0, scale: 1 });
	if (mobilePaper) motionScope.set(mobilePaper, { autoAlpha: 1, x: 0, y: 0, scale: 1, rotateZ: 0 });
	if (mobileEdgeTabs) motionScope.set(mobileEdgeTabs, { autoAlpha: view === "catalog" ? 1 : 0, x: 0, y: 0, scale: 1, rotateZ: 0 });
	if (recommendationsEl) motionScope.set(recommendationsEl, { autoAlpha: view === "home" ? 1 : 0, x: 0 });
	if (closedBookStack) {
		motionScope.set(closedBookStack, { autoAlpha: view === "home" ? 1 : 0, x: 0, y: 0, scaleX: 1, scaleY: 1 });
	}
	if (prepareDock) motionScope.set(prepareDock, { autoAlpha: view === "prepare" ? 1 : 0, x: 0, y: 0, scaleX: 1, scaleY: 1 });
	if (dockedCover) motionScope.set(dockedCover, { autoAlpha: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 });
	if (preparationPanel) motionScope.set(preparationPanel, { autoAlpha: view === "prepare" ? 1 : 0, x: 0, y: 0 });
	if (rootEl) motionScope.set(rootEl.querySelectorAll(".task-card, .recommendation-card"), { x: 0, y: 0, scaleX: 1, scaleY: 1 });
	if (coverHandoff) {
		motionScope.set(coverHandoff, {
			autoAlpha: 0,
			left: 0,
			top: 0,
			width: 0,
			height: 0,
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
		});
		const handoffParts = coverHandoff.querySelectorAll<HTMLElement>("strong, .cover-emblem");
		motionScope.set(handoffParts, {
			autoAlpha: 1,
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			transformOrigin: "center center",
		});
	}
}

function resetPaperTurnVisuals() {
	if (!motionScope) return;
	paperTurnSequence += 1;
	pendingPaperTurnSection = null;
	turnPreview = null;
	if (spreadContent) motionScope.set(spreadContent, { autoAlpha: 1 });
	if (catalogLeftPage) motionScope.set(catalogLeftPage, { autoAlpha: 1, rotateY: 0, transformOrigin: "right center" });
	if (catalogRightPage) motionScope.set(catalogRightPage, { autoAlpha: 1 });
	if (catalogLeftPageStack) motionScope.set(catalogLeftPageStack, { autoAlpha: 1, x: 0 });
	if (turningSheet) motionScope.set(turningSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 });
	if (catalogBook) motionScope.set(catalogBook, { rotateZ: 0 });
	if (catalogBookShadow) motionScope.set(catalogBookShadow, { autoAlpha: 1, scaleX: 1, scaleY: 1, transformOrigin: "right center" });
	if (mobilePaper) motionScope.set(mobilePaper, { autoAlpha: 1, x: 0, y: 0, scale: 1, rotateZ: 0 });
	if (mobileEdgeTabs) motionScope.set(mobileEdgeTabs, { x: 0, y: 0, rotateZ: 0 });
}

function applyStageTerminal(view: QuestHallDemoUrlState["view"]) {
	if (!motionScope || !homeStage || !catalogStage || !prepareStage) return;
	motionScope.set(homeStage, { autoAlpha: view === "home" ? 1 : 0, pointerEvents: view === "home" ? "auto" : "none" });
	motionScope.set(catalogStage, { autoAlpha: view === "catalog" ? 1 : 0, pointerEvents: view === "catalog" ? "auto" : "none" });
	motionScope.set(prepareStage, { autoAlpha: view === "prepare" ? 1 : 0, pointerEvents: view === "prepare" ? "auto" : "none" });
	setSceneObjectsTerminal(view);
}

function setStageTerminal(view: QuestHallDemoUrlState["view"]) {
	transitionFrom = null;
	transitionTo = null;
	visualView = view;
	if (!motionScope) return;
	motionScope.stopAll("hold");
	applyStageTerminal(view);
}

function settleViewTransition() {
	if (transitionTo) setStageTerminal(transitionTo);
}

function completeViewTransition(view: QuestHallDemoUrlState["view"]) {
	visualView = view;
	transitionFrom = null;
	transitionTo = null;
	applyStageTerminal(view);
}

function resetCompletionReplayDecorations(showStamp: boolean) {
	if (!motionScope || !rootEl) return;
	const cards = rootEl.querySelectorAll<HTMLElement>(".recommendation-card:not(.completion-old-recommendation)");
	const oldRecommendation = rootEl.querySelector<HTMLElement>(".completion-old-recommendation");
	const stamps = rootEl.querySelectorAll<HTMLElement>(".completion-replay-stamp");
	motionScope.set(cards, { autoAlpha: 1, x: 0, y: 0, scale: 1, rotate: 0 });
	if (oldRecommendation) motionScope.set(oldRecommendation, { autoAlpha: 0, x: 0, y: 0, scale: 1 });
	motionScope.set(stamps, { autoAlpha: showStamp ? 1 : 0, scale: 1, rotate: showStamp ? -2 : 0 });
}

function interruptCompletionReplay() {
	if (!isReplayingCompletion) return;
	completionReplaySequence += 1;
	setStageTerminal(optimisticState.view);
	resetCompletionReplayDecorations(false);
	isReplayingCompletion = false;
}

function isNarrowViewport(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(max-width: 64rem)").matches;
}

function alignCatalogStageForReopen() {
	if (!rootEl) return;
	if (catalogReturnScrollY !== null) {
		window.scrollTo({ left: window.scrollX, top: catalogReturnScrollY, behavior: "auto" });
		catalogReturnScrollY = null;
		return;
	}

	const stageStack = rootEl.querySelector<HTMLElement>(".stage-stack");
	if (!stageStack) return;

	const narrow = isNarrowViewport();
	const navigationBottom = document.querySelector<HTMLElement>("[data-app-nav]")?.getBoundingClientRect().bottom ?? 0;
	const narrowStageOffset = window.innerHeight >= 600 ? 86 : 16;
	const targetViewportTop = Math.max(0, navigationBottom) + (narrow ? narrowStageOffset : 16);
	const stageBounds = stageStack.getBoundingClientRect();
	if (!narrow && stageBounds.top >= targetViewportTop && stageBounds.top <= window.innerHeight * 0.55) return;

	window.scrollTo({
		left: window.scrollX,
		top: Math.max(0, window.scrollY + stageBounds.top - targetViewportTop),
		behavior: "auto",
	});
}

function firstVisibleButton(scope: ParentNode | undefined, selector: string): HTMLButtonElement | undefined {
	return Array.from(scope?.querySelectorAll<HTMLButtonElement>(selector) ?? []).find((button) => button.getClientRects().length > 0);
}

function focusStageTarget(stage: HTMLElement | undefined, target: HTMLElement | undefined) {
	queueMicrotask(() => {
		const narrow = isNarrowViewport();
		if (narrow && target) {
			const bounds = target.getBoundingClientRect();
			if (bounds.top < 0 || bounds.bottom > window.innerHeight) target.scrollIntoView({ behavior: "auto", block: "nearest" });
		} else if (narrow && stage) {
			const bounds = stage.getBoundingClientRect();
			if (bounds.top < 0 || bounds.top > window.innerHeight) stage.scrollIntoView({ behavior: "auto", block: "nearest" });
		}
		target?.focus({ preventScroll: true });
	});
}

function focusCatalog() {
	const closeButton = firstVisibleButton(catalogStage, ".catalog-toolbar .quiet-button");
	const selectedTab = firstVisibleButton(catalogStage, 'button[role="tab"][aria-selected="true"]');
	const firstTask = firstVisibleButton(catalogStage, ".task-select");
	focusStageTarget(catalogStage, closeButton ?? firstTask ?? selectedTab);
}

function focusSelectedTask() {
	const selector = lastSelectedKey ? `.task-select[data-task-key="${lastSelectedKey}"]` : ".task-select";
	queueMicrotask(() => {
		const selectedTask = firstVisibleButton(catalogStage, selector);
		const navigationBottom = document.querySelector<HTMLElement>("[data-app-nav]")?.getBoundingClientRect().bottom ?? 0;
		const bounds = selectedTask?.getBoundingClientRect();
		if (selectedTask && bounds && bounds.bottom > navigationBottom && bounds.top < window.innerHeight) {
			selectedTask.focus({ preventScroll: true });
			return;
		}
		firstVisibleButton(catalogStage, ".catalog-toolbar .quiet-button")?.focus({ preventScroll: true });
	});
}

function focusPreparation() {
	focusStageTarget(prepareStage, preparationPanel);
}

function focusHome() {
	focusStageTarget(homeStage, coverButton);
}

function focusViewDestination(from: QuestHallDemoUrlState["view"], to: QuestHallDemoUrlState["view"]) {
	if (to === "catalog") {
		if (from === "prepare") focusSelectedTask();
		else focusCatalog();
	} else if (to === "prepare") {
		focusPreparation();
	} else {
		focusHome();
	}
}

function restoreMobilePagerFocus(direction: -1 | 1) {
	void tick().then(() => {
		const preferredLabel = direction > 0 ? "Mission suivante" : "Mission précédente";
		const fallbackLabel = direction > 0 ? "Mission précédente" : "Mission suivante";
		const preferred = firstVisibleButton(catalogStage, `button[aria-label="${preferredLabel}"]:not(:disabled)`);
		const fallback = firstVisibleButton(catalogStage, `button[aria-label="${fallbackLabel}"]:not(:disabled)`);
		(preferred ?? fallback)?.focus({ preventScroll: true });
	});
}

function restoreDesktopPagerFocus(direction: -1 | 1) {
	void tick().then(() => {
		if (isNarrowViewport()) return;
		const preferredLabel = direction > 0 ? "Feuillet suivant" : "Feuillet précédent";
		const fallbackLabel = direction > 0 ? "Feuillet précédent" : "Feuillet suivant";
		const preferred = firstVisibleButton(catalogStage, `button.page-turn-surface[aria-label="${preferredLabel}"]:not(:disabled)`);
		const fallback = firstVisibleButton(catalogStage, `button.page-turn-surface[aria-label="${fallbackLabel}"]:not(:disabled)`);
		(preferred ?? fallback)?.focus({ preventScroll: true });
	});
}

function addCoverHandoff(
	timeline: ReturnType<CarteMotionScope["timeline"]>,
	source: HTMLElement,
	target: HTMLElement,
	at: number,
	duration: number,
): number {
	let sourceBounds: DOMRect | null = null;
	let targetBounds: DOMRect | null = null;
	const handoffTitle = coverHandoff?.querySelector<HTMLElement>("strong") ?? null;
	const handoffEmblem = coverHandoff?.querySelector<HTMLElement>(".cover-emblem") ?? null;
	const sourceTitle = source.querySelector<HTMLElement>("strong");
	const targetTitle = target.querySelector<HTMLElement>("strong");
	const sourceEmblem = source.querySelector<HTMLElement>(".cover-emblem");
	const targetEmblem = target.querySelector<HTMLElement>(".cover-emblem");
	let titleTarget = { x: 0, y: 0, scaleX: 1, scaleY: 1, autoAlpha: 1 };
	let emblemTarget = { x: 0, y: 0, scaleX: 1, scaleY: 1, autoAlpha: 1 };
	timeline.call(
		() => {
			sourceBounds = source.getBoundingClientRect();
			targetBounds = target.getBoundingClientRect();
			const usable = sourceBounds.width > 0 && sourceBounds.height > 0 && targetBounds.width > 0 && targetBounds.height > 0;
			if (!usable || !coverHandoff) {
				sourceBounds = null;
				targetBounds = null;
				return;
			}
			const activeSourceBounds = sourceBounds;
			const activeTargetBounds = targetBounds;
			motionScope?.set(coverHandoff, {
				autoAlpha: 1,
				left: activeSourceBounds.left,
				top: activeSourceBounds.top,
				width: activeSourceBounds.width,
				height: activeSourceBounds.height,
				x: 0,
				y: 0,
				scaleX: 1,
				scaleY: 1,
				transformOrigin: "left top",
			});

			const scaleX = activeTargetBounds.width / activeSourceBounds.width;
			const scaleY = activeTargetBounds.height / activeSourceBounds.height;
			const alignPart = (part: HTMLElement, sourcePart: HTMLElement, targetPart: HTMLElement) => {
				motionScope?.set(part, { autoAlpha: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, transformOrigin: "left top" });
				const basePartBounds = part.getBoundingClientRect();
				const sourcePartBounds = sourcePart.getBoundingClientRect();
				const targetPartBounds = targetPart.getBoundingClientRect();
				if (basePartBounds.width <= 0 || basePartBounds.height <= 0 || sourcePartBounds.width <= 0 || sourcePartBounds.height <= 0) {
					motionScope?.set(part, { autoAlpha: 0 });
					return { x: 0, y: 0, scaleX: 1, scaleY: 1, autoAlpha: 0 };
				}

				const baseX = basePartBounds.left - activeSourceBounds.left;
				const baseY = basePartBounds.top - activeSourceBounds.top;
				motionScope?.set(part, {
					x: sourcePartBounds.left - activeSourceBounds.left - baseX,
					y: sourcePartBounds.top - activeSourceBounds.top - baseY,
					scaleX: sourcePartBounds.width / basePartBounds.width,
					scaleY: sourcePartBounds.height / basePartBounds.height,
				});

				if (targetPartBounds.width <= 0 || targetPartBounds.height <= 0) {
					return { x: 0, y: 0, scaleX: 0.75, scaleY: 0.75, autoAlpha: 0 };
				}
				return {
					x: (targetPartBounds.left - activeTargetBounds.left) / scaleX - baseX,
					y: (targetPartBounds.top - activeTargetBounds.top) / scaleY - baseY,
					scaleX: targetPartBounds.width / (basePartBounds.width * scaleX),
					scaleY: targetPartBounds.height / (basePartBounds.height * scaleY),
					autoAlpha: 1,
				};
			};

			if (handoffTitle && sourceTitle && targetTitle) titleTarget = alignPart(handoffTitle, sourceTitle, targetTitle);
			if (handoffEmblem && sourceEmblem && targetEmblem) emblemTarget = alignPart(handoffEmblem, sourceEmblem, targetEmblem);
		},
		[],
		at,
	);
	timeline.to(
		coverHandoff ?? [],
		{
			x: () => (sourceBounds && targetBounds ? targetBounds.left - sourceBounds.left : 0),
			y: () => (sourceBounds && targetBounds ? targetBounds.top - sourceBounds.top : 0),
			scaleX: () => (sourceBounds && targetBounds ? targetBounds.width / sourceBounds.width : 1),
			scaleY: () => (sourceBounds && targetBounds ? targetBounds.height / sourceBounds.height : 1),
			duration,
			ease: CARTE_MOTION_TOKENS.easeInOut,
		},
		at,
	);
	if (handoffTitle) {
		timeline.to(
			handoffTitle,
			{
				autoAlpha: () => titleTarget.autoAlpha,
				x: () => titleTarget.x,
				y: () => titleTarget.y,
				scaleX: () => titleTarget.scaleX,
				scaleY: () => titleTarget.scaleY,
				duration,
				ease: CARTE_MOTION_TOKENS.easeInOut,
			},
			at + 0.001,
		);
	}
	if (handoffEmblem) {
		timeline.to(
			handoffEmblem,
			{
				autoAlpha: () => emblemTarget.autoAlpha,
				x: () => emblemTarget.x,
				y: () => emblemTarget.y,
				scaleX: () => emblemTarget.scaleX,
				scaleY: () => emblemTarget.scaleY,
				duration,
				ease: CARTE_MOTION_TOKENS.easeInOut,
			},
			at + 0.001,
		);
	}
	return at + duration;
}

function playViewTransition(from: QuestHallDemoUrlState["view"], to: QuestHallDemoUrlState["view"], selectedElement?: HTMLElement) {
	if (!motionScope || !homeStage || !catalogStage || !prepareStage) {
		setStageTerminal(to);
		return;
	}

	settleViewTransition();
	if (from === "prepare" && to === "catalog") alignCatalogStageForReopen();
	motionScope.stopAll("hold");
	resetPaperTurnVisuals();
	if (rootEl?.contains(document.activeElement)) rootEl.focus({ preventScroll: true });
	transitionFrom = from;
	transitionTo = to;
	const reduced = isReduced();
	const duration = reduced ? 0.14 : CARTE_MOTION_TOKENS.durationCeremonial;
	const timeline = motionScope.timeline({ defaults: { ease: CARTE_MOTION_TOKENS.easeInOut } });
	if (reduced) {
		const fromStage = from === "home" ? homeStage : from === "catalog" ? catalogStage : prepareStage;
		const targetStage = to === "home" ? homeStage : to === "catalog" ? catalogStage : prepareStage;
		const inactiveStage = [homeStage, catalogStage, prepareStage].find((stage) => stage !== fromStage && stage !== targetStage);
		setSceneObjectsTerminal(to);
		if (inactiveStage) timeline.set(inactiveStage, { autoAlpha: 0, pointerEvents: "none" });
		timeline
			.set(targetStage, { autoAlpha: 0, visibility: "visible", pointerEvents: "none" })
			.to(fromStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.1 }, 0)
			.to(targetStage, { autoAlpha: 1, duration: 0.12 }, 0.04)
			.call(() => {
				completeViewTransition(to);
				focusViewDestination(from, to);
			});
		return;
	}

	if (from === "home" && to === "catalog" && isNarrowViewport()) {
		timeline.set(catalogStage, { autoAlpha: 0, pointerEvents: "none" });
		if (mobileBook) {
			timeline.set(mobileBook, {
				autoAlpha: 0,
				y: 20,
				scale: 0.985,
				transformOrigin: "center top",
			});
		}
		if (mobilePaper) {
			timeline.set(mobilePaper, {
				autoAlpha: 0,
				x: 0,
				y: 62,
				scale: 0.94,
				rotateZ: -1.2,
				transformOrigin: "center bottom",
			});
		}
		if (mobileEdgeTabs) timeline.set(mobileEdgeTabs, { autoAlpha: 0, x: -14, y: 0 });
		if (recommendationsEl) {
			timeline.to(recommendationsEl, { autoAlpha: 0, x: -12, duration: CARTE_MOTION_TOKENS.durationExit }, 0);
		}
		if (closedBookStack) {
			timeline.to(
				closedBookStack,
				{
					autoAlpha: 0,
					scale: 1.14,
					y: -10,
					transformOrigin: "center top",
					duration: 0.3,
					ease: CARTE_MOTION_TOKENS.easeOut,
				},
				0,
			);
		}
		timeline.to(homeStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.18 }, 0.14);
		timeline.set(catalogStage, { autoAlpha: 1, pointerEvents: "none" }, 0.32);
		if (mobileBook) {
			timeline.to(mobileBook, { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: CARTE_MOTION_TOKENS.easeOut }, 0.32);
		}
		if (mobilePaper) {
			timeline.to(mobilePaper, { autoAlpha: 1, y: 0, scale: 1, rotateZ: 0, duration: 0.52, ease: CARTE_MOTION_TOKENS.easeOut }, 0.38);
		}
		if (mobileEdgeTabs) {
			timeline.to(mobileEdgeTabs, { autoAlpha: 1, x: 0, duration: 0.24, ease: CARTE_MOTION_TOKENS.easeOut }, 0.58);
		}
	} else if (from === "catalog" && to === "home" && isNarrowViewport()) {
		timeline.set(homeStage, { autoAlpha: 0, pointerEvents: "none" });
		if (mobileEdgeTabs) timeline.to(mobileEdgeTabs, { autoAlpha: 0, x: -12, duration: 0.14, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		if (mobilePaper) {
			timeline.to(mobilePaper, { autoAlpha: 0, y: 64, scale: 0.94, rotateZ: 1.1, duration: 0.36, ease: CARTE_MOTION_TOKENS.easeInOut }, 0);
		}
		if (mobileBook) timeline.to(mobileBook, { autoAlpha: 0, y: 18, scale: 0.985, duration: 0.24 }, 0.26);
		timeline.to(catalogStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.16 }, 0.38);
		timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" }, 0.52);
		if (closedBookStack) {
			timeline.set(closedBookStack, { autoAlpha: 0, scale: 1.14, y: -10, transformOrigin: "center top" }, 0.52);
			timeline.to(closedBookStack, { autoAlpha: 1, scale: 1, y: 0, duration: 0.34, ease: CARTE_MOTION_TOKENS.easeOut }, 0.52);
		}
		if (recommendationsEl) timeline.to(recommendationsEl, { autoAlpha: 1, x: 0, duration: 0.3 }, 0.6);
	} else if (from === "home" && to === "catalog") {
		const handoffAt = 0.02;
		const handoffDuration = 0.5;
		const handoff = closedCover && catalogCover && coverHandoff ? { source: closedCover, target: catalogCover } : null;
		const openAt = handoff ? handoffAt + handoffDuration + 0.04 : 0.3;
		const openEnd = openAt + duration;
		timeline.set(catalogStage, { autoAlpha: 0, pointerEvents: "none" });
		if (catalogBook) timeline.set(catalogBook, { x: "0%", scale: 1, rotateX: 0, rotateZ: 0 });
		if (catalogBookShadow) timeline.set(catalogBookShadow, { autoAlpha: 0, scaleX: 0.5, transformOrigin: "right center" });
		if (catalogCover) timeline.set(catalogCover, { autoAlpha: 0, rotateY: 0, z: CATALOG_COVER_CLOSED_Z, zIndex: 12 });
		if (spreadContent) timeline.set(spreadContent, { autoAlpha: 1 });
		if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 0 });
		if (catalogRightPage) timeline.set(catalogRightPage, { autoAlpha: 1 });
		if (catalogLeftPageStack) timeline.set(catalogLeftPageStack, { autoAlpha: 0 });
		if (recommendationsEl) timeline.to(recommendationsEl, { autoAlpha: 0, x: -28, duration: 0.24, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		if (handoff) {
			addCoverHandoff(timeline, handoff.source, handoff.target, handoffAt, handoffDuration);
			if (closedBookStack) timeline.set(closedBookStack, { autoAlpha: 0 }, handoffAt + 0.015);
		} else if (closedBookStack) {
			timeline.to(closedBookStack, { autoAlpha: 0, duration: 0.24, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		}
		timeline.to(homeStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.18 }, 0.14);
		timeline.set(catalogStage, { autoAlpha: 1, pointerEvents: "none" }, openAt - 0.02);
		if (catalogCover) timeline.set(catalogCover, { autoAlpha: 1 }, openAt - 0.02);
		if (coverHandoff) timeline.to(coverHandoff, { autoAlpha: 0, duration: 0.06 }, openAt - 0.02);
		if (catalogBookShadow) {
			timeline.to(catalogBookShadow, { autoAlpha: 1, scaleX: 1, duration, ease: CARTE_MOTION_TOKENS.easeInOut }, openAt);
		}
		if (catalogCover) {
			timeline.to(
				catalogCover,
				{ rotateY: CATALOG_COVER_OPEN_ROTATION, z: CATALOG_COVER_OPEN_Z, duration, ease: CARTE_MOTION_TOKENS.easeInOut },
				openAt,
			);
		}
		if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 1 }, openEnd);
		if (catalogLeftPageStack) timeline.set(catalogLeftPageStack, { autoAlpha: 1 }, openEnd);
		if (catalogCover) timeline.set(catalogCover, { autoAlpha: 0, zIndex: 2 }, openEnd);
	} else if (from === "catalog" && to === "home") {
		const closeAt = 0.04;
		const closeEnd = closeAt + duration;
		const handoffDuration = 0.46;
		const handoff = catalogCover && closedCover && coverHandoff ? { source: catalogCover, target: closedCover } : null;
		const handoffEnd = handoff ? closeEnd + handoffDuration : closeEnd + 0.18;
		timeline.set(homeStage, { autoAlpha: 0, pointerEvents: "none" });
		if (recommendationsEl) timeline.set(recommendationsEl, { autoAlpha: 0, x: -28 });
		if (closedBookStack) timeline.set(closedBookStack, { autoAlpha: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 });
		if (catalogBook) timeline.set(catalogBook, { x: "0%", scale: 1, rotateX: 0, rotateZ: 0 });
		if (catalogBookShadow) timeline.set(catalogBookShadow, { autoAlpha: 1, scaleX: 1, transformOrigin: "right center" });
		if (catalogCover) {
			timeline.set(catalogCover, { autoAlpha: 1, rotateY: CATALOG_COVER_OPEN_ROTATION, z: CATALOG_COVER_OPEN_Z, zIndex: 12 }, 0);
			timeline.to(catalogCover, { rotateY: 0, z: CATALOG_COVER_CLOSED_Z, duration, ease: CARTE_MOTION_TOKENS.easeInOut }, closeAt);
		}
		if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 0 }, 0);
		if (catalogLeftPageStack) timeline.to(catalogLeftPageStack, { autoAlpha: 0, duration: 0.12 }, closeAt);
		if (catalogBookShadow) {
			timeline.to(catalogBookShadow, { autoAlpha: 0, scaleX: 0.5, duration, ease: CARTE_MOTION_TOKENS.easeInOut }, closeAt);
		}
		if (handoff) {
			addCoverHandoff(timeline, handoff.source, handoff.target, closeEnd, handoffDuration);
			timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" }, closeEnd);
			timeline.set(handoff.source, { autoAlpha: 0 }, closeEnd + 0.015);
			timeline.to(catalogStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.18 }, closeEnd);
			if (closedBookStack) timeline.set(closedBookStack, { autoAlpha: 1 }, handoffEnd - 0.06);
			if (coverHandoff) timeline.to(coverHandoff, { autoAlpha: 0, duration: 0.08 }, handoffEnd - 0.06);
		} else {
			timeline.to(catalogStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.16 }, closeEnd);
			timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" }, closeEnd + 0.16);
			if (closedBookStack) timeline.to(closedBookStack, { autoAlpha: 1, duration: 0.2 }, closeEnd + 0.16);
		}
		if (recommendationsEl)
			timeline.to(recommendationsEl, { autoAlpha: 1, x: 0, duration: 0.28, ease: CARTE_MOTION_TOKENS.easeOut }, handoffEnd - 0.1);
	} else if ((from === "catalog" || from === "home") && to === "prepare") {
		const selectedSurface = selectedElement?.closest<HTMLElement>(".task-card, .recommendation-card") ?? selectedElement;
		const narrow = isNarrowViewport();
		const sourceCover = catalogCover;
		const handoffProxy = coverHandoff;
		const targetCover = dockedCover;
		const canHandoffCover = from === "catalog" && !narrow && sourceCover && handoffProxy && targetCover;
		const homeHandoff = from === "home" && closedCover && handoffProxy && targetCover ? { source: closedCover, target: targetCover } : null;
		timeline.set(prepareStage, { autoAlpha: 1, pointerEvents: "none" }, 0);
		if (prepareDock) timeline.set(prepareDock, { autoAlpha: 0, x: 0, scale: 1 }, 0);
		if (preparationPanel) timeline.set(preparationPanel, { autoAlpha: 0, x: narrow ? 0 : 36 }, 0);
		if (selectedSurface) {
			timeline.to(selectedSurface, { y: -7, scale: 1.01, duration: 0.12, ease: CARTE_MOTION_TOKENS.easeOut }, 0);
			timeline.to(selectedSurface, { y: 0, scale: 1, duration: 0.16, ease: CARTE_MOTION_TOKENS.easeInOut }, 0.12);
		}

		if (homeHandoff) {
			const handoffAt = 0.02;
			const handoffEnd = addCoverHandoff(timeline, homeHandoff.source, homeHandoff.target, handoffAt, 0.52);
			if (recommendationsEl) timeline.to(recommendationsEl, { autoAlpha: 0, x: -24, duration: 0.24 }, 0);
			if (closedBookStack) timeline.set(closedBookStack, { autoAlpha: 0 }, handoffAt + 0.015);
			timeline.to(homeStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.2 }, 0.16);
			if (prepareDock) timeline.set(prepareDock, { autoAlpha: 1 }, handoffEnd - 0.06);
			timeline.to(handoffProxy ?? [], { autoAlpha: 0, duration: 0.08 }, handoffEnd - 0.06);
			if (preparationPanel) {
				timeline.to(preparationPanel, { autoAlpha: 1, x: 0, duration: 0.42, ease: CARTE_MOTION_TOKENS.easeOut }, handoffEnd + 0.02);
			}
		} else if (canHandoffCover) {
			const closeAt = 0.04;
			const closeDuration = duration * 0.88;
			const handoffAt = closeAt + closeDuration;
			const handoffDuration = 0.44;
			const handoffEnd = addCoverHandoff(timeline, sourceCover, targetCover, handoffAt, handoffDuration);

			if (catalogBook) timeline.set(catalogBook, { x: "0%", scale: 1, rotateX: 0, rotateZ: 0 }, 0);
			if (catalogBookShadow) timeline.set(catalogBookShadow, { autoAlpha: 1, scaleX: 1, transformOrigin: "right center" }, 0);
			timeline.set(
				sourceCover,
				{
					autoAlpha: 1,
					rotateY: CATALOG_COVER_OPEN_ROTATION,
					x: 0,
					y: 0,
					scaleX: 1,
					scaleY: 1,
					z: CATALOG_COVER_OPEN_Z,
					zIndex: 12,
				},
				closeAt,
			);
			timeline.to(sourceCover, { rotateY: 0, z: CATALOG_COVER_CLOSED_Z, duration: closeDuration, ease: CARTE_MOTION_TOKENS.easeInOut }, closeAt);
			if (catalogBookShadow) {
				timeline.to(catalogBookShadow, { autoAlpha: 0, scaleX: 0.5, duration: closeDuration, ease: CARTE_MOTION_TOKENS.easeInOut }, closeAt);
			}
			if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 0 }, closeAt);
			if (catalogLeftPageStack) {
				timeline.to(catalogLeftPageStack, { autoAlpha: 0, x: 12, duration: 0.16, ease: CARTE_MOTION_TOKENS.easeExit }, closeAt + 0.04);
			}
			timeline.set(sourceCover, { autoAlpha: 0 }, handoffAt + 0.015);
			timeline.to(catalogStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.18, ease: CARTE_MOTION_TOKENS.easeExit }, handoffAt + 0.015);
			if (prepareDock) timeline.to(prepareDock, { autoAlpha: 1, duration: 0.12, ease: CARTE_MOTION_TOKENS.easeOut }, handoffEnd - 0.08);
			timeline.set(handoffProxy, { autoAlpha: 0 }, handoffEnd + 0.04);
			if (preparationPanel) {
				timeline.to(preparationPanel, { autoAlpha: 1, x: 0, duration: 0.42, ease: CARTE_MOTION_TOKENS.easeOut }, handoffEnd + 0.04);
			}
		} else {
			const revealPrepareAt = from === "catalog" ? 0.34 : 0.24;
			if (from === "catalog") {
				if (mobileEdgeTabs) timeline.to(mobileEdgeTabs, { autoAlpha: 0, x: -14, duration: 0.16, ease: CARTE_MOTION_TOKENS.easeExit }, 0.08);
				if (mobilePaper) {
					timeline.to(
						mobilePaper,
						{ autoAlpha: 0, x: 38, y: 14, scale: 0.97, rotateZ: 0.8, duration: 0.28, ease: CARTE_MOTION_TOKENS.easeExit },
						0.06,
					);
				}
				if (mobileBook) timeline.to(mobileBook, { autoAlpha: 0, scale: 0.985, duration: 0.2 }, 0.18);
				timeline.to(catalogStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.16 }, 0.24);
			} else {
				if (closedBookStack) timeline.to(closedBookStack, { x: -58, scale: 0.78, autoAlpha: 0, duration: duration * 0.65 }, 0);
				timeline.to(homeStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.2 }, 0.2);
			}
			if (prepareDock) timeline.to(prepareDock, { autoAlpha: 1, x: 0, scale: 1, duration: 0.28, ease: CARTE_MOTION_TOKENS.easeOut }, revealPrepareAt);
			if (preparationPanel) {
				timeline.to(preparationPanel, { autoAlpha: 1, x: 0, duration: 0.38, ease: CARTE_MOTION_TOKENS.easeOut }, revealPrepareAt + 0.06);
			}
		}
	} else if (from === "prepare" && to === "catalog" && isNarrowViewport()) {
		timeline.set(catalogStage, { autoAlpha: 0, pointerEvents: "none" }, 0);
		if (mobileBook) {
			timeline.set(
				mobileBook,
				{
					autoAlpha: 0,
					y: 18,
					scale: 0.985,
					transformOrigin: "center top",
				},
				0,
			);
		}
		if (mobilePaper) {
			timeline.set(
				mobilePaper,
				{
					autoAlpha: 0,
					x: 0,
					y: 54,
					scale: 0.95,
					rotateZ: -1,
					transformOrigin: "center bottom",
				},
				0,
			);
		}
		if (mobileEdgeTabs) timeline.set(mobileEdgeTabs, { autoAlpha: 0, x: -12, y: 0 }, 0);
		if (preparationPanel) {
			timeline.to(preparationPanel, { autoAlpha: 0, x: 24, duration: 0.22, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		}
		if (prepareDock) {
			timeline.to(prepareDock, { autoAlpha: 0, x: -12, scale: 0.97, duration: 0.2, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		}
		timeline.to(prepareStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.16 }, 0.14);
		timeline.set(catalogStage, { autoAlpha: 1, pointerEvents: "none" }, 0.28);
		if (mobileBook) {
			timeline.to(mobileBook, { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: CARTE_MOTION_TOKENS.easeOut }, 0.28);
		}
		if (mobilePaper) {
			timeline.to(mobilePaper, { autoAlpha: 1, y: 0, scale: 1, rotateZ: 0, duration: 0.46, ease: CARTE_MOTION_TOKENS.easeOut }, 0.34);
		}
		if (mobileEdgeTabs) {
			timeline.to(mobileEdgeTabs, { autoAlpha: 1, x: 0, duration: 0.24, ease: CARTE_MOTION_TOKENS.easeOut }, 0.54);
		}
	} else if (from === "prepare" && to === "catalog") {
		const handoff =
			!isNarrowViewport() && dockedCover && catalogCover && coverHandoff ? { source: dockedCover, target: catalogCover, proxy: coverHandoff } : null;
		const handoffAt = 0.04;
		timeline.set(catalogStage, { autoAlpha: 0, pointerEvents: "none" }, 0);
		if (catalogBook) timeline.set(catalogBook, { x: "0%", scale: 1, rotateX: 0, rotateZ: 0 }, 0);
		if (catalogBookShadow) timeline.set(catalogBookShadow, { autoAlpha: 0, scaleX: 0.5, transformOrigin: "right center" }, 0);
		if (catalogCover) timeline.set(catalogCover, { autoAlpha: 1, rotateY: 0, z: CATALOG_COVER_CLOSED_Z, zIndex: 12 }, 0);
		if (spreadContent) timeline.set(spreadContent, { autoAlpha: 1 }, 0);
		if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 0 }, 0);
		if (catalogRightPage) timeline.set(catalogRightPage, { autoAlpha: 1 }, 0);
		if (catalogLeftPageStack) timeline.set(catalogLeftPageStack, { autoAlpha: 0 }, 0);
		const handoffEnd = handoff ? addCoverHandoff(timeline, handoff.source, handoff.target, handoffAt, 0.44) : 0.4;
		const openAt = handoff ? handoffEnd + 0.04 : 0.4;
		const openEnd = openAt + duration;
		if (preparationPanel) timeline.to(preparationPanel, { autoAlpha: 0, x: reduced ? 0 : 72, duration: reduced ? 0.12 : 0.28 }, 0);
		if (handoff) {
			timeline.set(handoff.source, { autoAlpha: 0 }, handoffAt + 0.015);
			timeline.to(prepareStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.16 }, handoffAt + 0.08);
			timeline.set(catalogStage, { autoAlpha: 1, pointerEvents: "none" }, handoffEnd - 0.06);
			timeline.set(handoff.target, { autoAlpha: 1 }, handoffEnd - 0.06);
			timeline.to(handoff.proxy, { autoAlpha: 0, duration: 0.08 }, handoffEnd - 0.06);
		} else {
			if (prepareDock) timeline.to(prepareDock, { autoAlpha: 0, x: reduced ? 0 : -38, scale: reduced ? 1 : 0.9, duration: reduced ? 0.12 : 0.28 }, 0);
			timeline.to(prepareStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.16 }, 0.24);
			timeline.set(catalogStage, { autoAlpha: 1, pointerEvents: "none" }, openAt);
		}
		if (catalogBookShadow) {
			timeline.to(catalogBookShadow, { autoAlpha: 1, scaleX: 1, duration, ease: CARTE_MOTION_TOKENS.easeInOut }, openAt);
		}
		if (catalogCover) {
			timeline.to(catalogCover, { rotateY: CATALOG_COVER_OPEN_ROTATION, z: CATALOG_COVER_OPEN_Z, duration }, openAt);
		}
		if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 1 }, openEnd);
		if (catalogLeftPageStack) timeline.set(catalogLeftPageStack, { autoAlpha: 1 }, openEnd);
		if (catalogCover) timeline.set(catalogCover, { autoAlpha: 0, zIndex: 2 }, openEnd);
	} else {
		timeline.to([homeStage, catalogStage, prepareStage], { autoAlpha: 0, pointerEvents: "none", duration: reduced ? 0.08 : 0.16 });
		const target = to === "home" ? homeStage : to === "catalog" ? catalogStage : prepareStage;
		timeline.to(target, { autoAlpha: 1, pointerEvents: "none", duration: reduced ? 0.12 : 0.22 });
	}

	timeline.call(() => {
		completeViewTransition(to);
		focusViewDestination(from, to);
	});
}

async function playPaperTurn(
	direction: -1 | 1,
	swap?: () => void,
	target?: { section: QuestHallDemoSection; leaf: number },
	source?: { section: QuestHallDemoSection; leaf: number },
) {
	if (!motionScope || !turningSheet || !spreadContent) {
		swap?.();
		return;
	}
	settleViewTransition();
	motionScope.stopAll("hold");
	resetPaperTurnVisuals();
	const sequence = paperTurnSequence;
	const reduced = isReduced();
	const narrow = isNarrowViewport();
	const shouldRestoreDesktopPagerFocus =
		!narrow && document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("page-turn-surface");
	pendingPaperTurnSection = target?.section ?? null;
	if (target) {
		const fromLocation = source ?? { section: optimisticState.section, leaf: currentLeaf.leaf };
		turnPreview = {
			direction,
			usesSheet: !reduced && !narrow,
			fromSection: fromLocation.section,
			toSection: target.section,
			fromSpread: getQuestHallDemoBookSpread(data, fromLocation.section, fromLocation.leaf),
			toSpread: getQuestHallDemoBookSpread(data, target.section, target.leaf),
		};
		await tick();
		if (sequence !== paperTurnSequence) return;
	}
	const timeline = motionScope.timeline({ defaults: { ease: CARTE_MOTION_TOKENS.easeInOut } });
	if (reduced) {
		const content = narrow && mobilePaper ? mobilePaper : spreadContent;
		timeline
			.to(content, { autoAlpha: 0, duration: 0.08 })
			.call(() => {
				if (sequence === paperTurnSequence) swap?.();
			})
			.to(content, { autoAlpha: 1, duration: 0.12 })
			.call(() => {
				if (sequence === paperTurnSequence) {
					pendingPaperTurnSection = null;
					turnPreview = null;
					if (shouldRestoreDesktopPagerFocus) restoreDesktopPagerFocus(direction);
				}
			});
		return;
	}

	if (narrow && mobilePaper) {
		timeline.to(
			mobilePaper,
			{
				autoAlpha: 0,
				x: direction > 0 ? -38 : 38,
				scale: 0.975,
				rotateZ: direction * 0.7,
				duration: 0.2,
				ease: CARTE_MOTION_TOKENS.easeExit,
			},
			0,
		);
		timeline.call(
			() => {
				if (sequence === paperTurnSequence) swap?.();
			},
			[],
			0.2,
		);
		timeline.set(
			mobilePaper,
			{
				x: direction > 0 ? 58 : -42,
				scale: 0.95,
				rotateZ: direction * -0.8,
			},
			0.21,
		);
		timeline.to(mobilePaper, { autoAlpha: 1, x: 0, scale: 1, rotateZ: 0, duration: 0.36, ease: CARTE_MOTION_TOKENS.easeOut }, 0.22);
		timeline.call(() => {
			if (sequence === paperTurnSequence) {
				pendingPaperTurnSection = null;
				turnPreview = null;
			}
		});
		return;
	}

	const turnDuration = CARTE_MOTION_TOKENS.durationTurn;
	const turnMidpoint = turnDuration / 2;
	motionScope.set(turningSheet, {
		autoAlpha: 1,
		left: direction > 0 ? "auto" : "0%",
		right: direction > 0 ? "0%" : "auto",
		rotateY: 0,
		z: 0,
		transformOrigin: direction > 0 ? "left center" : "right center",
	});
	timeline.to(turningSheet, { rotateY: direction * -180, duration: turnDuration }, 0);
	timeline.to(turningSheet, { z: TURNING_SHEET_LIFT_Z, duration: turnMidpoint, ease: CARTE_MOTION_TOKENS.easeOut }, 0);
	timeline.to(turningSheet, { z: 0, duration: turnMidpoint, ease: CARTE_MOTION_TOKENS.easeExit }, turnMidpoint);
	timeline.call(
		() => {
			if (sequence === paperTurnSequence) swap?.();
		},
		[],
		turnMidpoint,
	);
	timeline.call(
		() => {
			if (sequence !== paperTurnSequence) return;
			pendingPaperTurnSection = null;
			turnPreview = null;
			void tick().then(() => {
				if (sequence !== paperTurnSequence) return;
				if (turningSheet) motionScope?.set(turningSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 });
				if (catalogBook) motionScope?.set(catalogBook, { rotateZ: 0 });
				if (shouldRestoreDesktopPagerFocus) restoreDesktopPagerFocus(direction);
			});
		},
		[],
		turnDuration,
	);
}

async function navigateTransition(event: QuestHallDemoEvent, selectedElement?: HTMLElement) {
	const transition = reduceQuestHallDemoState(optimisticState, event);
	if (transition.historyIntent === "none") return;
	interruptCompletionReplay();
	const previous = optimisticState;
	optimisticState = { ...transition.state };
	pendingSignature = stateSignature(transition.state);

	if (previous.view !== transition.state.view) {
		visualView = transition.state.view;
		playViewTransition(previous.view, transition.state.view, selectedElement);
	}

	if (transition.historyIntent === "back" && localHistoryDepth > 0) {
		localHistoryDepth -= 1;
		history.back();
		return;
	}

	const replace = transition.historyIntent === "replace" || transition.historyIntent === "back";
	if (transition.historyIntent === "push") localHistoryDepth += 1;
	await goto(stateUrl(transition.state), { replaceState: replace, noScroll: true, keepFocus: true });
}

function openCatalog(section: QuestHallDemoSection = optimisticState.section) {
	void navigateTransition({ type: "open-catalog", section });
}

function closeCatalog() {
	void navigateTransition({ type: "close-catalog" });
}

function switchSection(value: string) {
	if (isPaperTurning || transitionTo !== null) return;
	const section = value as QuestHallDemoSection;
	if (section === pendingPaperTurnSection) return;
	if (section === optimisticState.section) {
		if (pendingPaperTurnSection !== null) {
			motionScope?.stopAll("hold");
			resetPaperTurnVisuals();
		}
		return;
	}
	const direction = SECTION_ORDER.indexOf(section) > SECTION_ORDER.indexOf(optimisticState.section) ? 1 : -1;
	const target = { section, leaf: 1 };
	void playPaperTurn(direction, () => void navigateTransition({ type: "switch-section", ...target }), target);
}

function turnLeaf(direction: -1 | 1) {
	if (isPaperTurning || transitionTo !== null) return;
	const target = getQuestHallDemoCatalogTurnTarget(data, optimisticState.section, currentLeaf.leaf, direction);
	if (!target) return;
	const event: QuestHallDemoEvent =
		target.section === optimisticState.section
			? { type: "turn-leaf", leaf: target.leaf }
			: { type: "switch-section", section: target.section, leaf: target.leaf };
	void playPaperTurn(direction, () => void navigateTransition(event), target);
}

function selectItem(item: QuestHallDemoItem, event: MouseEvent) {
	lastSelectedKey = item.key;
	catalogReturnScrollY = optimisticState.view === "catalog" ? window.scrollY : null;
	void navigateTransition({ type: "select-task", task: item.key }, event.currentTarget as HTMLElement);
}

function returnFromPreparation(event?: MouseEvent) {
	event?.preventDefault();
	void navigateTransition({ type: "return-from-prepare" });
}

function setScenario(scenario: QuestHallDemoScenario) {
	void navigateTransition({ type: "set-scenario", scenario });
}

function setResource(resource: QuestHallDemoResource) {
	void navigateTransition({ type: "set-resource", resource });
}

function setMotion(motion: QuestHallDemoMotion) {
	void navigateTransition({ type: "set-motion", motion });
}

function moveMobile(direction: -1 | 1) {
	if (currentLeaf.items.length === 0) {
		turnLeaf(direction);
		return;
	}
	const next = mobilePosition + direction;
	if (next >= 0 && next < currentLeaf.items.length) {
		if (!motionScope || !mobilePaper) {
			mobilePosition = next;
			restoreMobilePagerFocus(direction);
			return;
		}
		settleViewTransition();
		motionScope.stopAll("hold");
		const reduced = isReduced();
		if (reduced) {
			mobilePosition = next;
			restoreMobilePagerFocus(direction);
			return;
		}
		const timeline = motionScope.timeline({ defaults: { ease: CARTE_MOTION_TOKENS.easeInOut } });
		timeline.to(
			mobilePaper,
			{
				autoAlpha: 0,
				x: direction > 0 ? -38 : 38,
				scale: 0.975,
				rotateZ: direction * 0.7,
				duration: 0.2,
				ease: CARTE_MOTION_TOKENS.easeExit,
			},
			0,
		);
		timeline.call(
			() => {
				mobilePosition = next;
			},
			[],
			0.2,
		);
		timeline.set(
			mobilePaper,
			{
				x: direction > 0 ? 58 : -42,
				scale: 0.95,
				rotateZ: direction * -0.8,
			},
			0.21,
		);
		timeline.to(
			mobilePaper,
			{
				autoAlpha: 1,
				x: 0,
				scale: 1,
				rotateZ: 0,
				duration: 0.36,
				ease: CARTE_MOTION_TOKENS.easeOut,
			},
			0.22,
		);
		timeline.call(() => restoreMobilePagerFocus(direction), [], 0.61);
		return;
	}
	turnLeaf(direction);
}

async function replayCompletion() {
	if (!motionScope || !rootEl || !catalogStage || !homeStage || isReplayingCompletion) return;
	const sequence = ++completionReplaySequence;
	isReplayingCompletion = true;
	const scenario: QuestHallDemoScenario = optimisticState.scenario === "first-complete" ? "first-complete" : "mixed";
	const target: QuestHallDemoUrlState = {
		...optimisticState,
		scenario,
		view: "home",
		section: "daily",
		leaf: 1,
		task: null,
		resource: "ready",
	};
	optimisticState = target;
	pendingSignature = stateSignature(target);
	try {
		await goto(stateUrl(target), { replaceState: true, noScroll: true, keepFocus: true });
	} catch {
		if (sequence === completionReplaySequence) {
			pendingSignature = null;
			setStageTerminal("home");
			resetCompletionReplayDecorations(false);
			isReplayingCompletion = false;
		}
		return;
	}
	await tick();
	if (sequence !== completionReplaySequence || !isReplayingCompletion || !motionScope) return;

	const reduced = isReduced();
	motionScope.stopAll("hold");
	transitionFrom = "home";
	transitionTo = "catalog";
	const stamps = rootEl.querySelectorAll<HTMLElement>(".completion-replay-stamp");
	const cards = rootEl.querySelectorAll<HTMLElement>(".recommendation-card:not(.completion-old-recommendation)");
	const oldRecommendation = rootEl.querySelector<HTMLElement>(".completion-old-recommendation");
	const timeline = motionScope.timeline({ defaults: { ease: CARTE_MOTION_TOKENS.easeInOut } });
	timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" });
	timeline.set(catalogStage, { autoAlpha: 0, pointerEvents: "none" });
	if (prepareStage) timeline.set(prepareStage, { autoAlpha: 0, pointerEvents: "none" });
	if (recommendationsEl) timeline.set(recommendationsEl, { autoAlpha: 1, x: 0 });
	if (closedBookStack) timeline.set(closedBookStack, { autoAlpha: 1, x: 0, scale: 1 });
	if (oldRecommendation) timeline.set(oldRecommendation, { autoAlpha: 1, x: 0 });
	timeline.set(cards, { autoAlpha: 0, y: reduced ? 0 : 18 });

	const finish = () => {
		if (sequence !== completionReplaySequence) return;
		completeViewTransition("home");
		resetCompletionReplayDecorations(true);
		isReplayingCompletion = false;
		focusHome();
	};

	if (reduced) {
		if (oldRecommendation) timeline.to(oldRecommendation, { autoAlpha: 0, duration: 0.1 }, 0.04);
		timeline.to(homeStage, { autoAlpha: 0, duration: 0.1 }, 0.14);
		timeline.set(catalogStage, { autoAlpha: 1 }, 0.24);
		if (catalogBook) timeline.set(catalogBook, { x: "0%", scale: 1, rotateX: 0 }, 0.24);
		if (catalogCover) {
			timeline.set(catalogCover, { autoAlpha: 0, rotateY: CATALOG_COVER_OPEN_ROTATION, z: CATALOG_COVER_OPEN_Z, zIndex: 2 }, 0.24);
		}
		timeline.set(stamps, { autoAlpha: 0, scale: 1, rotate: -2 }, 0.24);
		timeline.to(stamps, { autoAlpha: 1, duration: 0.12 }, 0.26);
		timeline.to(catalogStage, { autoAlpha: 0, duration: 0.1 }, 0.4);
		if (catalogBook) timeline.set(catalogBook, { x: "0%", scale: 1, rotateX: 0, rotateZ: 0 }, 0.5);
		if (catalogCover) timeline.set(catalogCover, { autoAlpha: 1, rotateY: 0, z: CATALOG_COVER_CLOSED_Z, zIndex: 12 }, 0.5);
		timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" }, 0.5);
		timeline.to(cards, { autoAlpha: 1, duration: 0.12 }, 0.52);
		timeline.call(finish);
		return;
	}

	if (oldRecommendation) timeline.to(oldRecommendation, { autoAlpha: 0, x: reduced ? 0 : -28, duration: reduced ? 0.12 : 0.28 }, 0.08);
	timeline.to(homeStage, { autoAlpha: 0, duration: reduced ? 0.1 : 0.2 }, reduced ? 0.18 : 0.3);
	timeline.set(catalogStage, { autoAlpha: 1 }, reduced ? 0.24 : 0.44);
	if (catalogBook) timeline.set(catalogBook, { x: "0%", scale: 1, rotateX: 0 });
	if (catalogCover) {
		timeline.set(catalogCover, {
			autoAlpha: 0,
			rotateY: CATALOG_COVER_OPEN_ROTATION,
			z: CATALOG_COVER_OPEN_Z,
			zIndex: 2,
		});
	}
	if (spreadContent) timeline.set(spreadContent, { autoAlpha: 1 });
	if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 1 });
	if (catalogRightPage) timeline.set(catalogRightPage, { autoAlpha: 1 });
	if (catalogLeftPageStack) timeline.set(catalogLeftPageStack, { autoAlpha: 1 });
	if (catalogBookShadow) timeline.set(catalogBookShadow, { scaleX: 1, transformOrigin: "right center" });
	timeline.set(stamps, { autoAlpha: 0, scale: reduced ? 1 : 1.6, rotate: reduced ? 0 : -8 });
	timeline.to(stamps, { autoAlpha: 1, scale: 1, rotate: -2, duration: reduced ? 0.12 : 0.28, ease: "back.out(1.8)" }, reduced ? 0.26 : 0.54);
	if (!reduced && catalogCover) {
		timeline.set(catalogCover, { autoAlpha: 1, rotateY: CATALOG_COVER_OPEN_ROTATION, z: CATALOG_COVER_OPEN_Z, zIndex: 12 }, 0.8);
		timeline.to(catalogCover, { rotateY: 0, z: CATALOG_COVER_CLOSED_Z, duration: CARTE_MOTION_TOKENS.durationCeremonial }, 0.8);
	}
	if (catalogLeftPage) timeline.set(catalogLeftPage, { autoAlpha: 0 }, 0.8);
	if (catalogLeftPageStack) timeline.set(catalogLeftPageStack, { autoAlpha: 0 }, 0.8);
	if (catalogBookShadow) {
		timeline.to(catalogBookShadow, { scaleX: 0.5, duration: CARTE_MOTION_TOKENS.durationCeremonial, ease: CARTE_MOTION_TOKENS.easeInOut }, 0.8);
	}
	timeline.to(catalogStage, { autoAlpha: 0, duration: reduced ? 0.1 : 0.2 }, reduced ? 0.5 : 1.34);
	timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" });
	if (recommendationsEl) timeline.set(recommendationsEl, { autoAlpha: 1, x: 0 });
	if (closedBookStack) timeline.set(closedBookStack, { autoAlpha: 1, x: 0, scale: 1 });
	timeline.to(cards, {
		autoAlpha: 1,
		y: 0,
		duration: reduced ? 0.12 : 0.32,
		stagger: reduced ? 0 : 0.08,
		ease: CARTE_MOTION_TOKENS.easeOut,
	});
	timeline.call(finish);
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key !== "Escape") return;
	if (optimisticState.view === "prepare") {
		event.preventDefault();
		returnFromPreparation();
	} else if (optimisticState.view === "catalog") {
		event.preventDefault();
		closeCatalog();
	}
}

onMount(() => {
	if (!rootEl) return;
	motionScope = createCarteMotionScope(rootEl);
	motionScope.matchMedia().add("(prefers-reduced-motion: reduce)", () => {
		systemReduced = true;
		return () => {
			systemReduced = false;
		};
	});
	mounted = true;
	setStageTerminal(data.demoState.view);
	return () => {
		mounted = false;
		motionScope?.revert();
		motionScope = null;
	};
});

$effect(() => {
	const nextCount = unreadReplyCount;
	if (!mounted || !rootEl || !motionScope) return;
	if (nextCount <= lastAnimatedUnreadReplyCount) {
		lastAnimatedUnreadReplyCount = nextCount;
		return;
	}
	lastAnimatedUnreadReplyCount = nextCount;

	void tick().then(() => {
		if (!rootEl || !motionScope || unreadReplyCount !== nextCount) return;
		const badges = rootEl.querySelectorAll<HTMLElement>(".cover-unread-badge");
		if (badges.length === 0) return;
		if (isReduced()) {
			motionScope.set(badges, { autoAlpha: 1, scale: 1, rotate: 0 });
			return;
		}
		motionScope.fromTo(badges, { autoAlpha: 0, scale: 0.6, rotate: -8 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.3, ease: "back.out(1.4)" });
	});
});

$effect(() => {
	const next = data.demoState as QuestHallDemoUrlState;
	const signature = stateSignature(next);
	if (!mounted || signature === observedSignature) return;
	const previous = optimisticState;
	observedSignature = signature;
	optimisticState = { ...next };
	const wasPending = pendingSignature === signature;
	if (wasPending) pendingSignature = null;
	if (!wasPending && previous.view !== next.view) {
		visualView = next.view;
		playViewTransition(previous.view, next.view);
	} else if (!wasPending && next.view === "catalog" && (previous.section !== next.section || previous.leaf !== next.leaf)) {
		const direction =
			previous.section !== next.section
				? SECTION_ORDER.indexOf(next.section) > SECTION_ORDER.indexOf(previous.section)
					? 1
					: -1
				: next.leaf > previous.leaf
					? 1
					: -1;
		void playPaperTurn(direction, undefined, { section: next.section, leaf: next.leaf }, { section: previous.section, leaf: previous.leaf });
	}
});

$effect(() => {
	const location = `${optimisticState.section}-${optimisticState.leaf}`;
	if (location === mobileLocation) return;
	mobileLocation = location;
	mobilePosition = 0;
});
</script>

{#snippet taskCard(item: QuestHallDemoItem, mobile = false, interactive = true)}
	<article
		class="task-card"
		class:is-completed={item.status === "completed"}
		class:is-active={item.status === "in-progress"}
		class:is-mobile={mobile}
		data-task-key={item.key}
	>
		{#if item.ordinal === 1}
			<span class="completion-replay-stamp" aria-hidden="true">Terminée</span>
		{/if}
		<div class="task-card-topline">
			<span>{ordinalFor(item)}</span>
			<span>{channelFor(item)}</span>
		</div>
		<TaskStatusMark status={sessionStatusFor(item)} variant={item.status === "completed" ? "stamp" : "line"} reduced={reducedMotion} />
		<h3 class="carte-long-title">{titleFor(item)}</h3>
		{#if objectiveFor(item)}
			<p>{objectiveFor(item)}</p>
		{/if}
		{#if item.hasUnread}
			<span class="unread-mark"><Mail size={13} aria-hidden="true" /> Nouvelle réponse</span>
		{/if}
		<div class="task-meta">
			<span><Gauge size={14} aria-hidden="true" /> {difficultyLabel(difficultyFor(item))}</span>
			{#if item.kind === "quest"}
				<span><Star size={14} aria-hidden="true" /> {item.task.pointReward} pts</span>
			{/if}
		</div>
		{#if interactive}
			<button
				type="button"
				class="task-select carte-hit-target carte-focusable"
				data-task-key={item.key}
				onclick={(event) => selectItem(item, event)}
			>
				<span>{statusActionLabel(item)}</span><ArrowRight size={16} aria-hidden="true" />
			</button>
		{:else}
			<span class="task-select task-select-visual carte-hit-target" aria-hidden="true"
				><span>{statusActionLabel(item)}</span><ArrowRight size={16} /></span
			>
		{/if}
	</article>
{/snippet}

{#snippet resourceStateCopy(spread: QuestHallDemoBookSpread)}
	{#if optimisticState.resource === "loading"}
		<div class="resource-state">
			<LoaderCircle size={24} aria-hidden="true" />
			<strong>Chargement des missions…</strong>
			<div class="skeleton-lines" aria-hidden="true"><span></span><span></span><span></span></div>
		</div>
	{:else if optimisticState.resource === "error"}
		<div class="resource-state error-state">
			<AlertTriangle size={25} aria-hidden="true" />
			<strong>Impossible d’ouvrir cette section.</strong>
			<p>La reliure est intacte ; seule la ressource doit être rechargée.</p>
			<span class="paper-button">Réessayer</span>
		</div>
	{:else if spread.items.length === 0}
		<div class="resource-state empty-state">
			<BookOpen size={26} aria-hidden="true" />
			<strong>Aucune mission dans cette section.</strong>
			<p>Choisissez un autre ruban pour poursuivre.</p>
		</div>
	{/if}
{/snippet}

{#snippet pageCopy(
	section: QuestHallDemoSection,
	spread: QuestHallDemoBookSpread,
	side: "left" | "right",
	respectResourceState = false,
)}
	<div
		class="page-copy"
		class:is-left-copy={side === "left"}
		class:is-right-copy={side === "right"}
		class:is-compact={side === "right" || spread.leaf > 1}
	>
		<p class="page-folio" class:page-folio-right={side === "right"}>
			{#if side === "left"}
				<span class="page-wine-mark" aria-hidden="true"><Wine size={15} strokeWidth={1.4} /></span>
				<span>{SECTION_LABELS[section]} · {folioFor(section, spread.leaf, "left")}</span>
			{:else}
				<span>{folioFor(section, spread.leaf, "right")} · CARTE</span>
				<span class="page-wine-mark" aria-hidden="true"><Wine size={15} strokeWidth={1.4} /></span>
			{/if}
		</p>
		{#if respectResourceState && (optimisticState.resource !== "ready" || spread.items.length === 0)}
			{@render resourceStateCopy(spread)}
		{:else}
			<div class="page-task-list" class:is-compact={side === "right" || spread.leaf > 1}>
				{#each (side === "left" ? spread.leftItems : spread.rightItems) as item (item.key)}
					{@render taskCard(item, false, false)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet resourceContent(mobile: boolean, spread: QuestHallDemoBookSpread, mobileItem: QuestHallDemoItem | null)}
	{#if optimisticState.resource === "loading"}
		<div class="resource-state" role="status">
			<LoaderCircle size={24} aria-hidden="true" />
			<strong>Chargement des missions…</strong>
			<div class="skeleton-lines" aria-hidden="true"><span></span><span></span><span></span></div>
		</div>
	{:else if optimisticState.resource === "error"}
		<div class="resource-state error-state" role="alert">
			<AlertTriangle size={25} aria-hidden="true" />
			<strong>Impossible d’ouvrir cette section.</strong>
			<p>La reliure est intacte ; seule la ressource doit être rechargée.</p>
			<button type="button" class="paper-button carte-hit-target carte-focusable" onclick={() => setResource("ready")}>Réessayer</button>
		</div>
	{:else if spread.items.length === 0}
		<div class="resource-state empty-state">
			<BookOpen size={26} aria-hidden="true" />
			<strong>Aucune mission dans cette section.</strong>
			<p>Choisissez un autre ruban pour poursuivre.</p>
		</div>
	{:else if mobile && mobileItem}
		{@render taskCard(mobileItem, true)}
	{/if}
{/snippet}

<svelte:head>
	<title>Livre de bureau · CARTE · Libiamo</title>
	<meta name="description" content="Prototype de salle des quêtes en livre de bureau à double page.">
	<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&display=swap" rel="stylesheet">
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="bureau-demo carte-demo-theme" bind:this={rootEl} data-visual-view={visualView} tabindex="-1">
	<p class="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</p>

	<header class="bureau-heading">
		<p class="eyebrow">Édition d’apprentissage · Bureau A</p>
		<h1>{data.greeting}</h1>
		<p>Laissez la journée se déplier dans une autre langue.</p>
	</header>

	<div class="stage-stack">
		<section
			class="home-stage stage"
			class:is-stage-active={visualView === "home"}
			class:is-stage-transitioning={transitionFrom === "home" || transitionTo === "home"}
			bind:this={homeStage}
			aria-label="Recommandations"
			aria-hidden={visualView !== "home" || transitionTo !== null}
			inert={visualView !== "home" || transitionTo !== null}
		>
			<div class="home-grid">
				<div class="recommendations" bind:this={recommendationsEl}>
					<div class="section-heading">
						<p>Recommandations</p>
					</div>

					{#if optimisticState.resource === "loading"}
						<div class="recommendation-resource" role="status">Préparation de vos recommandations…</div>
					{:else if optimisticState.resource === "error"}
						<div class="recommendation-resource" role="alert">
							Les recommandations sont momentanément indisponibles.
							<button type="button" onclick={() => setResource("ready")}>Réessayer</button>
						</div>
					{:else if recommendations.length === 0}
						<div class="all-done-note">
							<strong>Tout est terminé pour aujourd’hui.</strong>
							<p>La CARTE reste disponible si vous souhaitez relire un bilan.</p>
						</div>
					{:else}
						<div class="recommendation-list">
							{#if data.dailyTasks[0]}
								<article class="recommendation-card completion-old-recommendation" aria-hidden="true">
									<div class="recommendation-overline">
										<span>Avant l’achèvement</span>
										<span>Aujourd’hui</span>
									</div>
									<h3 class="carte-long-title">{data.dailyTasks[0].title}</h3>
									{#if data.dailyTasks[0].shortObjective}
										<p>{data.dailyTasks[0].shortObjective}</p>
									{/if}
									<span class="recommendation-action">Voir les détails <ArrowRight size={16} aria-hidden="true" /></span>
								</article>
							{/if}
							{#each recommendations as item, index (item.key)}
								<article class="recommendation-card" class:is-primary={index === 0} class:is-unread={item.hasUnread}>
									<div class="recommendation-overline">
										<span>{index === 0 ? "Proposition principale" : "Autre proposition"}</span>
										<span>{SECTION_LABELS[item.section]}</span>
									</div>
									<TaskStatusMark status={sessionStatusFor(item)} reduced={reducedMotion} />
									{#if item.hasUnread}
										<span class="unread-mark recommendation-unread"><Mail size={13} aria-hidden="true" /> Nouvelle réponse</span>
									{/if}
									<h3 class="carte-long-title">{titleFor(item)}</h3>
									{#if objectiveFor(item)}
										<p>{objectiveFor(item)}</p>
									{/if}
									<button type="button" class="recommendation-action carte-hit-target carte-focusable" onclick={(event) => selectItem(item, event)}>
										{statusActionLabel(item)} <ArrowRight size={16} aria-hidden="true" />
									</button>
								</article>
							{/each}
						</div>
					{/if}
				</div>

				<div class="closed-book-zone">
					<div class="closed-book-stack" bind:this={closedBookStack}>
						<div class="closed-book-wrap carte-3d-stage">
							<button
								bind:this={coverButton}
								type="button"
								class="closed-book carte-focusable"
								aria-label={unreadReplyCount > 0 ? `Ouvrir la CARTE — ${unreadReplySummary}` : "Ouvrir la CARTE"}
								aria-expanded={optimisticState.view !== "home"}
								onclick={() => openCatalog()}
							>
								<span class="book-page-edges" aria-hidden="true"></span>
								<span class="closed-cover" bind:this={closedCover}>
									<span class="cover-depth" aria-hidden="true"></span>
									<span class="cover-rule" aria-hidden="true"></span>
									<strong>CARTE</strong>
									<CoverEmblem size={118} finish="foil" unreadCount={unreadReplyCount} />
									<span class="cover-rule cover-rule-bottom" aria-hidden="true"></span>
								</span>
							</button>
						</div>
						<RibbonTabs
							tabs={ribbonTabs}
							value={optimisticState.section}
							onselect={(id) => openCatalog(id as QuestHallDemoSection)}
							orientation="vertical"
							variant="bookmark"
							controls="bureau-catalog-stage"
							class="book-edge-tabs"
						/>
					</div>
				</div>
			</div>
		</section>

		<section
			class="catalog-stage stage"
			id="bureau-catalog-stage"
			class:is-stage-active={visualView === "catalog"}
			class:is-stage-transitioning={transitionFrom === "catalog" || transitionTo === "catalog"}
			bind:this={catalogStage}
			aria-labelledby="catalog-title"
			aria-hidden={visualView !== "catalog" || transitionTo !== null}
			inert={visualView !== "catalog" || transitionTo !== null}
		>
			<div class="catalog-toolbar">
				<button type="button" class="quiet-button carte-hit-target carte-focusable" onclick={closeCatalog}>
					<ArrowLeft size={17} aria-hidden="true" />
					Fermer la CARTE
				</button>
				<div>
					<p>{SECTION_LABELS[optimisticState.section]}</p>
					<h2 id="catalog-title">Choisissez une mission</h2>
				</div>
				<span class="leaf-counter" aria-live="polite">Feuillet {catalogPagePosition.current} / {catalogPagePosition.total}</span>
			</div>

			<div class="catalog-book-stage carte-3d-stage">
				<div class="catalog-book carte-preserve-3d" bind:this={catalogBook}>
					<div class="book-shadow" bind:this={catalogBookShadow} aria-hidden="true"></div>
					<div class="page-stack page-stack-left" bind:this={catalogLeftPageStack} aria-hidden="true"></div>
					<div class="page-stack page-stack-right" aria-hidden="true"></div>
					<div class="book-spread">
						<div class="book-spine" aria-hidden="true"></div>
						<div
							class="spread-content"
							bind:this={spreadContent}
							id="bureau-catalog-panel"
							role="tabpanel"
							aria-busy={isPaperTurning}
							inert={isPaperTurning}
						>
							<div class="left-page" bind:this={catalogLeftPage}>
								<button
									type="button"
									class="page-turn-surface page-turn-previous"
									aria-label="Feuillet précédent"
									disabled={!previousTurnTarget || isPaperTurning || transitionTo !== null}
									onclick={() => turnLeaf(-1)}
								>
									<span class="page-turn-cue" aria-hidden="true"><ChevronLeft size={22} strokeWidth={1.35} /></span>
								</button>
								<p class="page-folio">
									<span class="page-wine-mark" aria-hidden="true"><Wine size={15} strokeWidth={1.4} /></span>
									<span>{SECTION_LABELS[staticLeftPage.section]} · {folioFor(staticLeftPage.section, staticLeftPage.spread.leaf, "left")}</span>
								</p>
								{#if optimisticState.resource !== "ready" || staticLeftPage.spread.items.length === 0}
									{@render resourceContent(false, staticLeftPage.spread, null)}
								{:else}
									<div class="page-task-list" class:is-compact={staticLeftPage.spread.leaf > 1}>
										{#each leftPageItems as item (item.key)}
											{@render taskCard(item)}
										{/each}
									</div>
								{/if}
							</div>
							<div class="right-page" bind:this={catalogRightPage}>
								<p class="page-folio page-folio-right">
									<span>{folioFor(staticRightPage.section, staticRightPage.spread.leaf, "right")} · CARTE</span>
									<span class="page-wine-mark" aria-hidden="true"><Wine size={15} strokeWidth={1.4} /></span>
								</p>
								{#if optimisticState.resource === "ready" && staticRightPage.spread.items.length > 0}
									<div class="page-task-list is-compact">
										{#each rightPageItems as item (item.key)}
											{@render taskCard(item)}
										{/each}
										{#if rightPageItems.length === 0}
											<div class="blank-leaf" aria-hidden="true"></div>
										{/if}
									</div>
								{/if}
								<button
									type="button"
									class="page-turn-surface page-turn-next"
									aria-label="Feuillet suivant"
									disabled={!nextTurnTarget || isPaperTurning || transitionTo !== null}
									onclick={() => turnLeaf(1)}
								>
									<span class="page-turn-cue" aria-hidden="true"><ChevronRight size={22} strokeWidth={1.35} /></span>
								</button>
							</div>
						</div>
						<div class="turning-sheet carte-preserve-3d" bind:this={turningSheet} aria-hidden="true">
							<div class="turning-sheet-face turning-sheet-front carte-face">
								{#if turnPreview}
									{@render pageCopy(
												turnPreview.fromSection,
												turnPreview.fromSpread,
												turnPreview.direction > 0 ? "right" : "left",
												turnPreview.direction < 0,
											)}
								{/if}
								<span class="turning-sheet-shade"></span>
							</div>
							<div class="turning-sheet-face turning-sheet-back carte-face carte-face--back">
								{#if turnPreview}
									{@render pageCopy(
												turnPreview.toSection,
												turnPreview.toSpread,
												turnPreview.direction > 0 ? "left" : "right",
												turnPreview.direction > 0,
											)}
								{/if}
								<span class="turning-sheet-shade"></span>
							</div>
						</div>
						<div class="catalog-cover carte-preserve-3d" bind:this={catalogCover} aria-hidden="true">
							<div class="catalog-cover-face catalog-cover-front carte-face">
								<span class="cover-depth" aria-hidden="true"></span>
								<strong>CARTE</strong>
								<CoverEmblem size={104} finish="foil" unreadCount={unreadReplyCount} />
							</div>
							<div class="catalog-cover-face catalog-cover-back carte-face carte-face--back" data-carte-cover="light">
								{@render pageCopy(optimisticState.section, currentLeaf, "left", true)}
							</div>
						</div>
					</div>
					<RibbonTabs
						tabs={ribbonTabs}
						value={optimisticState.section}
						onselect={switchSection}
						orientation="vertical"
						variant="bookmark"
						controls="bureau-catalog-panel"
						class="desktop-page-tabs"
					/>
				</div>
			</div>

			<div class="carte-mobile-leaf mobile-book" bind:this={mobileBook}>
				<div class="mobile-navigation" aria-label="Missions du feuillet">
					<button
						type="button"
						class="leaf-button carte-hit-target carte-focusable"
						disabled={!previousTurnTarget && mobilePosition <= 0}
						onclick={() => moveMobile(-1)}
						aria-label="Mission précédente"
					>
						<ChevronLeft size={20} aria-hidden="true" />
					</button>
					<span>{currentLeaf.items.length > 0 ? `Mission ${mobilePosition + 1} / ${currentLeaf.items.length}` : "Aucune mission"}</span>
					<button
						type="button"
						class="leaf-button carte-hit-target carte-focusable"
						disabled={!nextTurnTarget && mobilePosition >= currentLeaf.items.length - 1}
						onclick={() => moveMobile(1)}
						aria-label="Mission suivante"
					>
						<ChevronRight size={20} aria-hidden="true" />
					</button>
				</div>
				<div class="mobile-page-stage">
					<div class="mobile-edge-tab-shell" bind:this={mobileEdgeTabs}>
						<RibbonTabs
							tabs={ribbonTabs}
							value={optimisticState.section}
							onselect={switchSection}
							orientation="vertical"
							variant="bookmark"
							controls="bureau-mobile-catalog-panel"
							class="menu-edge-tabs"
						/>
					</div>
					<span class="mobile-stack-sheet mobile-stack-sheet-back" aria-hidden="true"></span>
					<span class="mobile-stack-sheet mobile-stack-sheet-middle" aria-hidden="true"></span>
					<div class="mobile-paper carte-paper" bind:this={mobilePaper} id="bureau-mobile-catalog-panel" role="tabpanel">
						<p class="page-folio">
							<span class="page-wine-mark" aria-hidden="true"><Wine size={15} strokeWidth={1.4} /></span>
							<span>{SECTION_LABELS[optimisticState.section]} · Feuillet {catalogPagePosition.current} / {catalogPagePosition.total}</span>
						</p>
						{@render resourceContent(true, currentLeaf, currentMobileItem)}
					</div>
				</div>
			</div>
		</section>

		<section
			class="prepare-stage stage"
			class:is-stage-active={visualView === "prepare"}
			class:is-stage-transitioning={transitionFrom === "prepare" || transitionTo === "prepare"}
			bind:this={prepareStage}
			aria-labelledby="prepare-heading"
			aria-hidden={visualView !== "prepare" || transitionTo !== null}
			inert={visualView !== "prepare" || transitionTo !== null}
		>
			<h2 id="prepare-heading" class="sr-only">Préparation de la mission</h2>
			<div class="prepare-grid">
				<button
					type="button"
					class="prepare-dock carte-focusable"
					bind:this={prepareDock}
					aria-label={unreadReplyCount > 0 ? `Rouvrir le catalogue — ${unreadReplySummary}` : "Rouvrir le catalogue"}
					onclick={() => returnFromPreparation()}
				>
					<span class="docked-cover" bind:this={dockedCover}>
						<span class="cover-depth" aria-hidden="true"></span>
						<strong>CARTE</strong>
						<CoverEmblem size={84} finish="foil" unreadCount={unreadReplyCount} />
						<CoverUnreadBadge count={unreadReplyCount} class="compact-cover-unread" />
					</span>
					<span class="dock-action"><BookOpen size={17} aria-hidden="true" /> Rouvrir le catalogue</span>
				</button>

				<div class="preparation-panel carte-paper" bind:this={preparationPanel} tabindex="-1">
					{#if optimisticState.resource === "loading"}
						<div class="resource-state" role="status">
							<LoaderCircle size={24} aria-hidden="true" />
							<strong>Chargement de la préparation…</strong>
							<div class="skeleton-lines" aria-hidden="true"><span></span><span></span><span></span></div>
						</div>
					{:else if optimisticState.resource === "error"}
						<div class="resource-state error-state" role="alert">
							<AlertTriangle size={25} aria-hidden="true" />
							<strong>Impossible de charger cette préparation.</strong>
							<p>Vous pouvez réessayer sans quitter cette mission.</p>
							<button type="button" class="paper-button carte-hit-target carte-focusable" onclick={() => setResource("ready")}>Réessayer</button>
						</div>
					{:else if data.selectedPreparation?.kind === "quest"}
						<TaskPreparation
							task={data.selectedPreparation.data.task}
							nativeLanguage={data.selectedPreparation.data.nativeLanguage}
							simulated={optimisticState.scenario !== "actual"}
							backHref={stateUrl({ ...optimisticState, view: "catalog", task: null })}
							backLabel="Retour au catalogue"
							onback={returnFromPreparation}
						/>
					{:else if data.selectedPreparation?.kind === "translation"}
						<TranslationPreparation
							template={data.selectedPreparation.data.template}
							attempt={data.selectedPreparation.data.attempt}
							blockedReason={data.selectedPreparation.data.blockedReason}
							lang={data.selectedPreparation.data.template.language}
							mode="pane"
							backHref={stateUrl({ ...optimisticState, view: "catalog", task: null })}
							backLabel="Retour au catalogue"
							onback={() => returnFromPreparation()}
						/>
					{:else}
						<div class="missing-preparation" role="alert">
							<FileText size={28} aria-hidden="true" />
							<h3>Cette préparation n’est pas disponible.</h3>
							<p>Revenez au catalogue et choisissez une autre mission.</p>
							<button type="button" class="paper-button carte-hit-target carte-focusable" onclick={() => returnFromPreparation()}>
								Retour au catalogue
							</button>
						</div>
					{/if}
				</div>
			</div>
		</section>
	</div>

	<div class="cover-handoff" bind:this={coverHandoff} aria-hidden="true">
		<span class="cover-depth" aria-hidden="true"></span>
		<strong>CARTE</strong>
		<CoverEmblem size={104} finish="foil" unreadCount={unreadReplyCount} />
	</div>

	<div class="demo-laboratory">
		<DemoControls
			groups={controlGroups}
			title="États du bureau"
			description="Les contrôles changent uniquement ce prototype ; aucune session réelle n’est créée."
		/>
		<button type="button" class="replay-button carte-hit-target carte-focusable" disabled={isReplayingCompletion} onclick={replayCompletion}>
			<RotateCcw size={17} aria-hidden="true" />
			{isReplayingCompletion ? "Animation en cours…" : "Rejouer l’achèvement de 01"}
		</button>
	</div>
</div>

<style>
.bureau-demo {
	--bureau-serif: "Newsreader", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
	--bureau-body-size: 1rem;
	--font-serif: var(--bureau-serif);
	position: relative;
	min-height: calc(100dvh - 8rem);
	overflow: clip;
	padding: clamp(1rem, 2.5vw, 2rem);
	border: 1px solid color-mix(in oklab, var(--carte-ink) 12%, transparent);
	border-radius: 0.8rem;
	font-family: var(--bureau-serif);
	font-optical-sizing: auto;
	font-weight: 380;
	font-kerning: normal;
	font-synthesis: none;
}

.bureau-demo::before {
	position: absolute;
	inset: 0;
	background-image:
		linear-gradient(90deg, transparent 0 49.9%, color-mix(in oklab, var(--carte-ink) 3%, transparent) 50%, transparent 50.1%),
		repeating-linear-gradient(0deg, transparent 0 34px, color-mix(in oklab, var(--carte-ink) 2%, transparent) 34px 35px);
	content: "";
	pointer-events: none;
}

.bureau-heading,
.stage-stack,
.demo-laboratory {
	position: relative;
	z-index: 1;
}

.bureau-heading {
	max-width: 74rem;
	margin: 0 auto clamp(1.25rem, 3vw, 2.25rem);
	text-align: left;
}

.bureau-heading p,
.bureau-heading h1 {
	margin: 0;
}

.bureau-heading .eyebrow,
.section-heading > p,
.catalog-toolbar > div > p {
	font-family: var(--font-sans);
	font-size: 0.68rem;
	font-weight: 750;
	letter-spacing: 0.13em;
	text-transform: uppercase;
	color: var(--carte-wine);
}

.bureau-heading h1 {
	margin-top: 0.35rem;
	font-family: var(--font-serif);
	font-size: clamp(2rem, 4vw, 3.65rem);
	font-weight: 350;
	letter-spacing: 0.006em;
	line-height: 1.02;
	white-space: nowrap;
}

.bureau-heading > p:last-child {
	margin-top: 0.65rem;
	font-size: var(--bureau-body-size);
	line-height: 1.55;
	color: var(--carte-ink-muted);
}

.stage-stack {
	display: grid;
	min-height: clamp(39rem, 68vw, 54rem);
}

.stage {
	display: none;
	grid-area: 1 / 1;
	min-width: 0;
	scroll-margin-top: 4.5rem;
	visibility: hidden;
}

.stage.is-stage-active,
.stage.is-stage-transitioning {
	display: block;
	visibility: visible;
}

.home-grid {
	display: grid;
	grid-template-columns: minmax(0, 0.95fr) minmax(22rem, 1.05fr);
	align-items: center;
	gap: clamp(2.5rem, 7vw, 7rem);
	min-height: clamp(38rem, 58vw, 47rem);
	max-width: 74rem;
	margin: 0 auto;
}

.recommendations {
	min-width: 0;
}

.catalog-toolbar h2,
.missing-preparation h3 {
	margin: 0.35rem 0 0;
	font-family: var(--font-serif);
	font-weight: 380;
	line-height: 1.08;
	text-wrap: balance;
}

.recommendation-list {
	position: relative;
	display: grid;
	gap: 0.85rem;
	margin-top: 1.6rem;
}

.recommendation-card.completion-old-recommendation {
	position: absolute;
	inset: 0 0 auto;
	z-index: 3;
	visibility: hidden;
	opacity: 0;
	pointer-events: none;
}

.recommendation-card {
	position: relative;
	display: grid;
	gap: 0.65rem;
	min-width: 0;
	padding: 1.15rem 1.2rem;
	border: 1px solid color-mix(in oklab, var(--carte-ink) 17%, transparent);
	border-left: 4px solid var(--carte-olive);
	background: color-mix(in oklab, var(--carte-sheet) 91%, transparent);
	box-shadow: 0 10px 22px color-mix(in oklab, var(--carte-ink) 7%, transparent);
}

.recommendation-card.is-primary {
	border-left-color: var(--carte-wine);
}

.recommendation-card.is-unread {
	border-color: color-mix(in oklab, var(--carte-wine) 52%, var(--carte-ink));
	background: linear-gradient(135deg, color-mix(in oklab, var(--carte-wine) 7%, var(--carte-sheet)), var(--carte-sheet) 52%);
	box-shadow:
		0 12px 26px color-mix(in oklab, var(--carte-wine) 12%, transparent),
		inset 0 0 0 1px color-mix(in oklab, var(--carte-wine) 10%, transparent);
}

.recommendation-card:hover {
	border-color: color-mix(in oklab, var(--carte-wine) 58%, var(--carte-ink));
}

.recommendation-overline,
.task-card-topline,
.task-meta,
.unread-mark {
	display: flex;
	align-items: center;
}

.recommendation-overline,
.task-card-topline {
	justify-content: space-between;
	gap: 1rem;
	font-family: var(--font-sans);
	font-size: 0.64rem;
	font-weight: 750;
	letter-spacing: 0.09em;
	text-transform: uppercase;
	color: var(--carte-ink-muted);
}

.recommendation-card h3 {
	margin: 0;
	font-size: clamp(1.25rem, 2.8vw, 1.75rem);
	font-weight: 380;
	line-height: 1.14;
}

.recommendation-card > p,
.task-card > p,
.resource-state p,
.all-done-note p,
.missing-preparation p {
	margin: 0;
	font-size: var(--bureau-body-size);
	line-height: 1.62;
	color: var(--carte-ink-muted);
}

.recommendation-action,
.task-select,
.paper-button,
.quiet-button,
.leaf-button,
.replay-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.45rem;
	border: 1px solid currentColor;
	background: transparent;
	font: inherit;
	font-family: var(--font-sans);
	font-size: 0.78rem;
	font-weight: 700;
	cursor: pointer;
}

.recommendation-action {
	width: fit-content;
	margin-top: 0.2rem;
	padding: 0.55rem 0.8rem;
	color: var(--carte-wine);
}

.all-done-note,
.recommendation-resource {
	margin-top: 1.5rem;
	padding: 1.25rem;
	border-left: 3px solid var(--carte-green);
	background: color-mix(in oklab, var(--carte-sheet) 88%, transparent);
	line-height: 1.55;
}

.recommendation-resource button {
	margin-left: 0.5rem;
	text-decoration: underline;
}

.closed-book-zone {
	display: grid;
	justify-items: center;
	min-width: 0;
	padding-bottom: 1.5rem;
}

.closed-book-stack {
	--book-frame-padding: 1.5rem;
	position: relative;
	width: min(100%, 29rem);
}

.closed-book-wrap {
	position: relative;
	z-index: 2;
	width: 100%;
	padding: var(--book-frame-padding);
	pointer-events: none;
}

.closed-book-stack > :global(.book-edge-tabs) {
	position: absolute;
	top: 22%;
	left: calc(100% - var(--book-frame-padding) - 0.4rem);
	z-index: 1;
	width: max-content;
	gap: 0.12rem;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab),
.catalog-book > :global(.desktop-page-tabs .ribbon-tab) {
	width: 3.45rem;
	min-width: 3.45rem;
	height: 2.75rem;
	min-height: 2.75rem;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-face),
.catalog-book > :global(.desktop-page-tabs .ribbon-face) {
	width: 100%;
	height: 2.125rem;
	min-height: 2.125rem;
	align-self: center;
	align-items: center;
	justify-content: center;
	flex-direction: row;
	margin: 0;
	padding: 0.38rem 0.5rem 0.38rem 0.95rem;
	clip-path: polygon(0 0, 86% 0, 100% 50%, 86% 100%, 0 100%);
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-label),
.catalog-book > :global(.desktop-page-tabs .ribbon-label) {
	font-size: 0.64rem;
	line-height: 1;
	writing-mode: horizontal-tb;
	text-orientation: mixed;
	white-space: nowrap;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab:hover:not(:disabled) .ribbon-face),
.closed-book-stack > :global(.book-edge-tabs .ribbon-tab[aria-selected="true"] .ribbon-face),
.catalog-book > :global(.desktop-page-tabs .ribbon-tab:hover:not(:disabled) .ribbon-face),
.catalog-book > :global(.desktop-page-tabs .ribbon-tab[aria-selected="true"] .ribbon-face) {
	transform: translateX(0.3rem);
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab:focus-visible),
.catalog-book > :global(.desktop-page-tabs .ribbon-tab:focus-visible),
.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-tab:focus-visible) {
	outline: 0;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab:focus-visible .ribbon-face),
.catalog-book > :global(.desktop-page-tabs .ribbon-tab:focus-visible .ribbon-face),
.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-tab:focus-visible .ribbon-face) {
	box-shadow:
		inset 0 0 0 2px var(--carte-sheet),
		inset 1px 0 color-mix(in oklab, white 18%, transparent),
		inset -1px 0 color-mix(in oklab, black 20%, transparent);
}

.closed-book {
	position: relative;
	display: block;
	width: 100%;
	aspect-ratio: 0.79;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
	pointer-events: auto;
	transform: rotateX(4deg) rotateY(-7deg) rotateZ(1deg);
	transform-style: preserve-3d;
}

.closed-cover,
.docked-cover {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	border: 1px solid color-mix(in oklab, var(--carte-brass) 58%, transparent);
	background: linear-gradient(105deg, color-mix(in oklab, white 10%, transparent), transparent 22%), var(--carte-cover);
	color: var(--carte-brass);
}

.closed-cover {
	box-shadow:
		inset -3px 0 5px -3px color-mix(in oklab, var(--carte-ink) 32%, transparent),
		inset 0 -3px 5px -3px color-mix(in oklab, var(--carte-ink) 28%, transparent),
		0 18px 26px -17px color-mix(in oklab, var(--carte-ink) 34%, transparent),
		0 5px 9px -6px color-mix(in oklab, var(--carte-ink) 22%, transparent);
	transition: box-shadow 180ms var(--carte-ease-out);
}

.docked-cover {
	box-shadow:
		inset -2px 0 4px -2px color-mix(in oklab, var(--carte-ink) 28%, transparent),
		inset 0 -2px 4px -2px color-mix(in oklab, var(--carte-ink) 24%, transparent),
		0 14px 28px -16px color-mix(in oklab, var(--carte-ink) 20%, transparent),
		0 3px 8px -6px color-mix(in oklab, var(--carte-ink) 12%, transparent);
}

.closed-cover {
	position: absolute;
	inset: 0;
	transform: translateZ(18px);
}

@media (hover: hover) and (pointer: fine) {
	.closed-book:hover .closed-cover {
		box-shadow:
			inset -3px 0 5px -3px color-mix(in oklab, var(--carte-ink) 34%, transparent),
			inset 0 -3px 5px -3px color-mix(in oklab, var(--carte-ink) 30%, transparent),
			0 21px 30px -17px color-mix(in oklab, var(--carte-ink) 36%, transparent),
			0 6px 11px -6px color-mix(in oklab, var(--carte-ink) 24%, transparent);
	}
}

.cover-depth {
	position: absolute;
	inset: 0;
	z-index: 0;
	pointer-events: none;
}

.cover-depth::before,
.cover-depth::after {
	position: absolute;
	content: "";
	background: linear-gradient(135deg, color-mix(in oklab, var(--carte-cover) 86%, black), color-mix(in oklab, var(--carte-cover) 70%, black));
}

.cover-depth::before {
	top: 0.32rem;
	right: -0.22rem;
	bottom: -0.18rem;
	width: 0.22rem;
	border-right: 1px solid color-mix(in oklab, var(--carte-brass) 34%, transparent);
	box-shadow: 5px 8px 10px -8px color-mix(in oklab, var(--carte-ink) 52%, transparent);
}

.cover-depth::after {
	right: -0.22rem;
	bottom: -0.22rem;
	left: 0.32rem;
	height: 0.22rem;
	border-bottom: 1px solid color-mix(in oklab, var(--carte-brass) 28%, transparent);
	box-shadow: 0 6px 10px -7px color-mix(in oklab, var(--carte-ink) 48%, transparent);
}

.closed-cover > strong,
.catalog-cover-front > strong,
.docked-cover > strong,
.cover-handoff > strong,
.closed-cover > :global(.cover-emblem),
.catalog-cover-front > :global(.cover-emblem),
.docked-cover > :global(.cover-emblem),
.cover-handoff > :global(.cover-emblem) {
	position: relative;
	z-index: 1;
}

.closed-cover > strong,
.catalog-cover-front > strong,
.docked-cover > strong {
	font-family: var(--font-serif);
	font-size: clamp(2.5rem, 6vw, 4.8rem);
	font-weight: 380;
	letter-spacing: 0.08em;
}

.cover-rule {
	position: absolute;
	top: 10%;
	left: 12%;
	right: 12%;
	height: 1px;
	background: color-mix(in oklab, var(--carte-brass) 65%, transparent);
}

.cover-rule-bottom {
	top: auto;
	bottom: 10%;
}

.book-page-edges {
	--page-edge-depth: 0.22rem;
	position: absolute;
	inset: 0.42rem -0.38rem -0.48rem 0.42rem;
	border: 1px solid color-mix(in oklab, var(--carte-ink) 15%, transparent);
	background:
		linear-gradient(90deg, transparent 97%, color-mix(in oklab, var(--carte-ink) 10%, transparent)),
		linear-gradient(0deg, color-mix(in oklab, var(--carte-ink) 11%, transparent), transparent 3.5%),
		color-mix(in oklab, var(--carte-sheet) 94%, var(--carte-paper));
	box-shadow:
		0 8px 14px -10px color-mix(in oklab, var(--carte-ink) 34%, transparent),
		inset -3px -3px 5px color-mix(in oklab, var(--carte-ink) 8%, transparent);
	transform: translateZ(2px);
	pointer-events: none;
}

.book-page-edges::before,
.book-page-edges::after {
	position: absolute;
	content: "";
}

.book-page-edges::before {
	top: 0.35rem;
	right: calc(-1 * var(--page-edge-depth));
	bottom: 0.2rem;
	width: var(--page-edge-depth);
	border-right: 1px solid color-mix(in oklab, var(--carte-ink) 18%, transparent);
	background:
		linear-gradient(90deg, color-mix(in oklab, var(--carte-ink) 12%, transparent), transparent 36%),
		repeating-linear-gradient(0deg, #cec3b2 0 1px, #faf4e9 1px 3px);
	box-shadow:
		inset 2px 0 3px color-mix(in oklab, var(--carte-ink) 12%, transparent),
		5px 9px 13px -7px color-mix(in oklab, var(--carte-ink) 32%, transparent);
}

.book-page-edges::after {
	right: calc(-1 * var(--page-edge-depth));
	bottom: calc(-1 * var(--page-edge-depth));
	left: 0.35rem;
	height: var(--page-edge-depth);
	border-bottom: 1px solid color-mix(in oklab, var(--carte-ink) 18%, transparent);
	background:
		linear-gradient(0deg, color-mix(in oklab, var(--carte-ink) 14%, transparent), transparent 42%),
		repeating-linear-gradient(90deg, #cec3b2 0 1px, #faf4e9 1px 3px);
	box-shadow:
		inset 0 2px 3px color-mix(in oklab, var(--carte-ink) 10%, transparent),
		0 10px 15px -8px color-mix(in oklab, var(--carte-ink) 34%, transparent);
}

.catalog-toolbar {
	display: grid;
	grid-template-columns: minmax(9rem, 1fr) auto minmax(9rem, 1fr);
	align-items: center;
	gap: 1rem;
	max-width: 74rem;
	margin: 0 auto 1rem;
	text-align: center;
}

.catalog-toolbar h2 {
	font-size: clamp(1.45rem, 3vw, 2.25rem);
}

.catalog-toolbar .quiet-button {
	justify-self: start;
}

.quiet-button,
.leaf-button {
	padding: 0.5rem 0.75rem;
	border-color: color-mix(in oklab, var(--carte-ink) 23%, transparent);
	color: var(--carte-ink-muted);
}

.leaf-counter {
	justify-self: end;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--carte-ink-muted);
}

.catalog-book-stage {
	container-type: inline-size;
	max-width: 74rem;
	margin: 0 auto;
	padding: 1.5rem 3.25rem 1.5rem 2.5rem;
	perspective: clamp(1600px, 135vw, 2000px);
	perspective-origin: 50% 45%;
}

.catalog-book {
	position: relative;
	width: 100%;
	aspect-ratio: 1.48;
	transform-origin: center center;
}

.catalog-book > :global(.desktop-page-tabs) {
	position: absolute;
	top: 22%;
	right: -2.9rem;
	z-index: 2;
	gap: 0.12rem;
	filter: drop-shadow(7px 5px 7px color-mix(in oklab, var(--carte-ink) 14%, transparent));
}

.book-shadow {
	position: absolute;
	inset: 0;
	z-index: 0;
	background: none;
	filter: none;
	transform: translateZ(-30px);
	transform-origin: right center;
	pointer-events: none;
}

.book-shadow::before,
.book-shadow::after {
	position: absolute;
	border-radius: 50%;
	content: "";
}

.book-shadow::before {
	right: 2.5%;
	bottom: -3%;
	left: 2.5%;
	height: 18%;
	background: radial-gradient(
		ellipse at center,
		color-mix(in oklab, var(--carte-ink) 14%, transparent) 0%,
		color-mix(in oklab, var(--carte-ink) 7%, transparent) 48%,
		transparent 76%
	);
	filter: blur(18px);
}

.book-shadow::after {
	right: 7%;
	bottom: -0.75%;
	left: 7%;
	height: 6%;
	background: color-mix(in oklab, var(--carte-ink) 12%, transparent);
	filter: blur(7px);
}

.page-stack {
	position: absolute;
	top: 1.1%;
	bottom: -1.4%;
	z-index: 1;
	width: clamp(0.75rem, 1.2vw, 1.1rem);
	border: 1px solid color-mix(in oklab, var(--carte-ink) 15%, transparent);
	background: repeating-linear-gradient(0deg, #d8cfbf 0 1px, #f7f1e6 1px 4px);
	pointer-events: none;
}

.page-stack-left {
	left: -0.7%;
	transform: translateZ(-5px);
}

.page-stack-right {
	right: -0.7%;
	transform: translateZ(-5px);
}

.book-spread {
	position: absolute;
	inset: 0;
	z-index: 3;
	display: grid;
	grid-template-columns: 1fr 1fr;
	overflow: visible;
	transform: rotateX(1.2deg);
	transform-style: preserve-3d;
}

.book-spine {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 50%;
	z-index: 7;
	width: 2.2rem;
	background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--carte-ink) 13%, transparent), transparent);
	transform: translateX(-50%) translateZ(5px);
	pointer-events: none;
}

.spread-content {
	position: absolute;
	inset: 0;
	display: grid;
	grid-template-columns: 1fr 1fr;
	transform-style: preserve-3d;
}

.left-page,
.right-page {
	position: relative;
	display: flex;
	min-width: 0;
	flex-direction: column;
	padding: clamp(1.75rem, 4cqi, 3rem);
	border: 1px solid color-mix(in oklab, var(--carte-ink) 16%, transparent);
	overflow: hidden;
}

.left-page {
	border-right: 0;
	background: linear-gradient(90deg, var(--carte-sheet), color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)));
	backface-visibility: hidden;
	transform-style: preserve-3d;
}

.right-page {
	border-left: 0;
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)), var(--carte-sheet));
}

.left-page > :not(.page-turn-surface),
.right-page > :not(.page-turn-surface) {
	position: relative;
	z-index: 2;
	pointer-events: none;
}

.page-turn-surface {
	position: absolute;
	inset: 0;
	z-index: 1;
	width: 100%;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--carte-wine);
	cursor: pointer;
	touch-action: manipulation;
}

.page-turn-surface::before {
	position: absolute;
	inset: 0;
	content: "";
	opacity: 0;
	transition: opacity 160ms ease;
}

.page-turn-previous::before {
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-wine) 7%, transparent), transparent 20%);
}

.page-turn-next::before {
	background: linear-gradient(270deg, color-mix(in oklab, var(--carte-wine) 7%, transparent), transparent 20%);
}

.page-turn-cue {
	position: absolute;
	top: 50%;
	display: grid;
	width: 1.8rem;
	height: 3rem;
	place-items: center;
	border: 1px solid transparent;
	background: color-mix(in oklab, var(--carte-sheet) 72%, transparent);
	opacity: 0.28;
	transform: translateY(-50%);
	transition:
		opacity 160ms ease,
		transform 160ms var(--carte-ease-out),
		border-color 160ms ease,
		background-color 160ms ease;
}

.page-turn-previous .page-turn-cue {
	left: 0.35rem;
}

.page-turn-next .page-turn-cue {
	right: 0.35rem;
}

.page-turn-surface:focus-visible {
	outline: 0;
}

.page-turn-surface:not(:disabled):hover::before,
.page-turn-surface:focus-visible::before {
	opacity: 1;
}

.page-turn-surface:not(:disabled):hover .page-turn-cue,
.page-turn-surface:focus-visible .page-turn-cue {
	border-color: color-mix(in oklab, var(--carte-wine) 42%, transparent);
	background: color-mix(in oklab, var(--carte-sheet) 94%, var(--carte-paper));
	opacity: 0.9;
}

.page-turn-previous:not(:disabled):hover .page-turn-cue,
.page-turn-previous:focus-visible .page-turn-cue {
	transform: translate(-0.12rem, -50%);
}

.page-turn-next:not(:disabled):hover .page-turn-cue,
.page-turn-next:focus-visible .page-turn-cue {
	transform: translate(0.12rem, -50%);
}

.page-turn-surface:focus-visible .page-turn-cue {
	box-shadow: 0 0 0 2px var(--carte-focus);
}

.page-turn-surface:disabled {
	cursor: default;
	pointer-events: none;
}

.page-turn-surface:disabled .page-turn-cue {
	opacity: 0;
}

.page-folio {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin: 0 0 0.85rem;
	font-size: 0.62rem;
	font-weight: 750;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--carte-ink-muted);
}

.page-folio-right {
	justify-content: flex-end;
}

.page-wine-mark {
	display: inline-grid;
	flex: 0 0 auto;
	place-items: center;
	color: color-mix(in oklab, var(--carte-wine) 76%, var(--carte-brass-dark));
	opacity: 0.82;
}

.page-task-list {
	display: flex;
	gap: 0.45rem;
	flex: 1;
	min-height: 0;
}

.page-task-list.is-compact {
	display: grid;
	grid-template-rows: repeat(2, minmax(0, 1fr));
}

.task-card {
	position: relative;
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 0.48rem;
	padding: 0.85rem 0;
	border-block: 1px solid color-mix(in oklab, var(--carte-ink) 14%, transparent);
}

.task-card.is-completed {
	background: color-mix(in oklab, var(--carte-green) 4%, transparent);
}

.task-card.is-active {
	background: color-mix(in oklab, var(--carte-brass) 8%, transparent);
}

.task-card:hover {
	border-color: color-mix(in oklab, var(--carte-wine) 48%, transparent);
}

.task-card h3 {
	margin: 0.1rem 0 0;
	font-size: clamp(1.2rem, 2.15vw, 1.8rem);
	font-weight: 380;
	line-height: 1.12;
}

.page-task-list.is-compact .task-card h3 {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	font-size: clamp(1.05rem, 1.65vw, 1.4rem);
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.page-task-list.is-compact .task-card > p {
	display: none;
}

.page-task-list.is-compact .task-card {
	min-height: 0;
	gap: 0.32rem;
	padding-block: 0.55rem;
	overflow: hidden;
}

.page-task-list.is-compact .task-card .task-meta {
	margin-top: 0.1rem;
}

.page-task-list.is-compact .task-card .task-select {
	margin-top: auto;
}

.task-meta {
	flex-wrap: wrap;
	gap: 0.45rem 0.8rem;
	margin-top: auto;
	font-family: var(--font-sans);
	font-size: 0.72rem;
	color: var(--carte-ink-muted);
}

.task-meta span,
.unread-mark {
	display: inline-flex;
	align-items: center;
	gap: 0.32rem;
}

.unread-mark {
	width: fit-content;
	font-family: var(--font-sans);
	font-size: 0.68rem;
	font-weight: 700;
	color: var(--carte-wine);
}

.recommendation-unread {
	min-height: 1.75rem;
	padding: 0.3rem 0.55rem;
	border: 1px solid color-mix(in oklab, var(--carte-wine) 48%, transparent);
	border-radius: 999px;
	background: color-mix(in oklab, var(--carte-wine) 8%, var(--carte-sheet));
	letter-spacing: 0.055em;
	text-transform: uppercase;
}

.task-select {
	position: relative;
	z-index: 4;
	width: fit-content;
	margin-top: 0.35rem;
	padding: 0.48rem 0.68rem;
	color: var(--carte-wine);
	pointer-events: auto;
}

.task-select-visual {
	cursor: default;
	pointer-events: none;
}

.completion-replay-stamp {
	position: absolute;
	top: 42%;
	right: 8%;
	z-index: 9;
	padding: 0.3rem 0.55rem;
	border: 2px solid var(--carte-green);
	font-size: 0.74rem;
	font-weight: 800;
	letter-spacing: 0.09em;
	text-transform: uppercase;
	color: var(--carte-green);
	opacity: 0;
	pointer-events: none;
}

.blank-leaf {
	display: grid;
	flex: 1;
	place-items: center;
	color: color-mix(in oklab, var(--carte-ink) 16%, transparent);
}

.catalog-cover,
.turning-sheet {
	position: absolute;
	top: 0;
	right: 0;
	z-index: 12;
	width: 50%;
	height: 100%;
	pointer-events: none;
	transform-origin: left center;
	transform-style: preserve-3d;
}

.catalog-cover {
	z-index: 12;
}

.catalog-cover-face {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	border: 1px solid color-mix(in oklab, var(--carte-brass) 55%, transparent);
	background: var(--carte-cover);
	color: var(--carte-brass);
	box-shadow: -8px 12px 28px color-mix(in oklab, var(--carte-ink) 22%, transparent);
}

.catalog-cover-back {
	border: 0;
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-ink) 8%, transparent), transparent 28%), var(--carte-paper);
	color: var(--carte-ink);
	box-shadow: 8px 10px 24px color-mix(in oklab, var(--carte-ink) 16%, transparent);
}

.page-copy {
	position: absolute;
	inset: 0;
	z-index: 1;
	display: flex;
	min-width: 0;
	flex-direction: column;
	padding: clamp(1.75rem, 4cqi, 3rem);
	overflow: hidden;
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)), var(--carte-sheet));
	color: var(--carte-ink);
	text-align: left;
}

.page-copy.is-left-copy {
	background: linear-gradient(90deg, var(--carte-sheet), color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)));
}

.catalog-cover-back .page-copy {
	border: 1px solid color-mix(in oklab, var(--carte-ink) 16%, transparent);
	border-right: 0;
}

.catalog-cover-front > strong {
	font-size: clamp(2rem, 5vw, 4.4rem);
}

.cover-handoff {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 60;
	display: flex;
	visibility: hidden;
	width: 0;
	height: 0;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	border: 1px solid color-mix(in oklab, var(--carte-brass) 55%, transparent);
	background: var(--carte-cover);
	color: var(--carte-brass);
	box-shadow: -8px 12px 28px color-mix(in oklab, var(--carte-ink) 22%, transparent);
	opacity: 0;
	pointer-events: none;
	transform-origin: left top;
	will-change: transform, opacity;
}

.cover-handoff strong {
	font-family: var(--font-serif);
	font-size: clamp(2rem, 5vw, 4.4rem);
	font-weight: 380;
	letter-spacing: 0.08em;
}

.turning-sheet {
	z-index: 14;
	visibility: hidden;
	transform-style: preserve-3d;
}

.turning-sheet-face {
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-ink) 4%, transparent), transparent 24%), var(--carte-sheet);
	box-shadow: -10px 4px 24px color-mix(in oklab, var(--carte-ink) 16%, transparent);
}

.turning-sheet-face .page-copy {
	border: 1px solid color-mix(in oklab, var(--carte-ink) 16%, transparent);
}

.turning-sheet-face .page-copy.is-left-copy {
	border-right: 0;
}

.turning-sheet-face .page-copy.is-right-copy {
	border-left: 0;
}

.turning-sheet-back {
	background: linear-gradient(270deg, color-mix(in oklab, var(--carte-ink) 5%, transparent), transparent 28%), var(--carte-paper);
	box-shadow: 10px 4px 24px color-mix(in oklab, var(--carte-ink) 14%, transparent);
}

.turning-sheet-shade {
	position: absolute;
	inset: 0;
	z-index: 2;
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-ink) 12%, transparent), transparent 36%);
	pointer-events: none;
}

.turning-sheet-back .turning-sheet-shade {
	background: linear-gradient(270deg, color-mix(in oklab, var(--carte-ink) 10%, transparent), transparent 38%);
}

.leaf-button:disabled,
.replay-button:disabled {
	cursor: not-allowed;
	opacity: 0.4;
}

.resource-state,
.missing-preparation {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	flex-direction: column;
	gap: 0.7rem;
	min-height: 14rem;
	text-align: center;
	color: var(--carte-ink-muted);
}

.resource-state strong,
.missing-preparation h3 {
	color: var(--carte-ink);
}

.skeleton-lines {
	display: grid;
	gap: 0.55rem;
	width: min(100%, 18rem);
}

.skeleton-lines span {
	height: 0.7rem;
	background: color-mix(in oklab, var(--carte-ink) 10%, transparent);
}

.skeleton-lines span:nth-child(2) {
	width: 76%;
}

.skeleton-lines span:nth-child(3) {
	width: 52%;
}

.paper-button {
	padding: 0.55rem 0.8rem;
	color: var(--carte-wine);
}

.prepare-grid {
	display: grid;
	grid-template-columns: minmax(12rem, 0.34fr) minmax(0, 1fr);
	align-items: start;
	gap: clamp(1.25rem, 3vw, 2.75rem);
	max-width: 76rem;
	margin: 0 auto;
	padding-top: 1rem;
}

.prepare-dock {
	position: sticky;
	top: 1rem;
	display: grid;
	gap: 0.8rem;
	width: 100%;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
}

.docked-cover {
	width: 100%;
	aspect-ratio: 0.76;
}

.docked-cover > :global(.compact-cover-unread) {
	display: none;
}

.docked-cover > strong {
	font-size: clamp(1.8rem, 4vw, 3rem);
}

.dock-action {
	display: inline-flex;
	min-height: 44px;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	font-size: 0.75rem;
	font-weight: 700;
	color: var(--carte-wine);
}

.preparation-panel {
	display: flex;
	min-width: 0;
	min-height: clamp(34rem, 68vh, 48rem);
	flex-direction: column;
	padding: clamp(1.25rem, 3vw, 2.5rem);
	background: var(--carte-sheet);
}

.demo-laboratory {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: stretch;
	gap: 0.75rem;
	max-width: 76rem;
	margin: 1.5rem auto 0;
}

.replay-button {
	min-width: 13rem;
	padding: 0.75rem 1rem;
	border-radius: 0.65rem;
	background: var(--carte-cover);
	color: var(--carte-ribbon-text);
}

.mobile-book {
	--mobile-tab-gutter: clamp(2.0625rem, 9vw, 2.375rem);
	max-width: 30rem;
	margin: 0 auto;
}

.mobile-page-stage {
	position: relative;
	padding-right: var(--mobile-tab-gutter);
	padding-bottom: 0.8rem;
	isolation: isolate;
}

.mobile-edge-tab-shell {
	position: absolute;
	top: clamp(3.25rem, 9vw, 4.5rem);
	right: -1rem;
	z-index: 3;
	will-change: transform, opacity;
}

.mobile-edge-tab-shell :global(.menu-edge-tabs) {
	align-items: flex-start;
	gap: 0.125rem;
}

.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-tab) {
	width: 3.75rem;
	min-width: 3.75rem;
	height: 2.75rem;
	min-height: 2.75rem;
}

.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-face) {
	width: 100%;
	height: 2.125rem;
	min-height: 2.125rem;
	align-self: center;
	flex-direction: row;
	justify-content: center;
	padding: 0.35rem 0.65rem 0.35rem 1.15rem;
	clip-path: polygon(0 0, 86% 0, 100% 50%, 86% 100%, 0 100%);
}

.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-label) {
	writing-mode: horizontal-tb;
	text-orientation: mixed;
	white-space: nowrap;
}

.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-tab:hover:not(:disabled) .ribbon-face),
.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-tab[aria-selected="true"] .ribbon-face) {
	transform: translateX(0.32rem);
}

.mobile-paper {
	position: relative;
	z-index: 4;
	min-height: clamp(31rem, 64dvh, 38rem);
	padding: 1.2rem;
	will-change: transform, opacity;
}

.mobile-paper .task-card {
	min-height: clamp(27rem, 56dvh, 34rem);
	padding: 0.75rem 0;
}

.mobile-paper .task-card h3 {
	font-size: clamp(1.5rem, 8vw, 2.35rem);
}

.mobile-stack-sheet {
	position: absolute;
	inset: 0 var(--mobile-tab-gutter) 0.8rem 0;
	border: 1px solid color-mix(in oklab, var(--carte-ink) 15%, transparent);
	background: var(--carte-sheet);
	box-shadow: 0 12px 24px color-mix(in oklab, var(--carte-ink) 8%, transparent);
	pointer-events: none;
}

.mobile-stack-sheet-back {
	z-index: 1;
	transform: translateY(0.75rem) scaleX(0.94) rotate(-0.45deg);
}

.mobile-stack-sheet-middle {
	z-index: 2;
	transform: translateY(0.4rem) scaleX(0.975) rotate(0.28deg);
}

.mobile-navigation {
	display: grid;
	grid-template-columns: 3rem 1fr 3rem;
	align-items: center;
	gap: 0.75rem;
	margin: 0 var(--mobile-tab-gutter) 0.75rem 0;
	text-align: center;
	font-size: 0.75rem;
	font-weight: 700;
	color: var(--carte-ink-muted);
}

@media (min-width: 64.01rem) {
	.bureau-demo {
		--bureau-canvas-width: min(90rem, calc(100vw - 2rem));
		width: var(--bureau-canvas-width);
		margin-inline: calc((100% - var(--bureau-canvas-width)) / 2);
	}
}

@media (max-width: 72rem) {
	.left-page,
	.right-page {
		transform: none;
	}
}

@media (max-width: 64rem) {
	.bureau-heading h1 {
		white-space: normal;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.stage-stack {
		min-height: 0;
	}

	.home-grid {
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.8fr);
		align-items: start;
		gap: 2rem;
		min-height: 0;
	}

	.catalog-book-stage {
		display: none;
	}

	.carte-mobile-leaf {
		display: block;
	}

	.catalog-book-stage {
		padding-inline: 0.5rem;
	}

	.left-page,
	.right-page {
		padding: 1.5rem;
	}
}

@media (max-width: 56.24rem) {
	.bureau-demo {
		padding: 1rem;
	}

	.bureau-heading {
		text-align: left;
	}

	.bureau-heading h1 {
		white-space: normal;
		text-wrap: balance;
	}

	.catalog-toolbar {
		grid-template-columns: 1fr auto;
		text-align: left;
	}

	.catalog-toolbar > div {
		grid-column: 1 / -1;
		grid-row: 1;
	}

	.catalog-toolbar .quiet-button {
		grid-column: 1;
		grid-row: 2;
	}

	.leaf-counter {
		grid-column: 2;
		grid-row: 2;
	}

	.catalog-book-stage {
		display: none;
	}

	.prepare-grid {
		grid-template-columns: 1fr;
		padding-top: 0;
	}

	.prepare-dock {
		position: static;
		grid-template-columns: 5.5rem 1fr;
		align-items: center;
	}

	.docked-cover {
		width: 5.5rem;
	}

	.docked-cover > strong {
		font-size: 1rem;
	}

	.docked-cover :global(.cover-emblem) {
		display: none;
	}

	.docked-cover > :global(.compact-cover-unread) {
		--carte-unread-badge-size: 1.35rem;
		position: absolute;
		top: -0.45rem;
		right: -0.45rem;
		z-index: 4;
		display: grid;
	}

	.preparation-panel {
		min-height: 34rem;
		padding: 1.1rem;
	}

	.demo-laboratory {
		grid-template-columns: 1fr;
	}

	.replay-button {
		min-width: 0;
	}
}

@media (max-width: 44rem) {
	.home-grid {
		grid-template-columns: 1fr;
		gap: 1.5rem;
		padding-bottom: 1rem;
	}

	.recommendation-list {
		grid-template-columns: 1fr;
		margin-top: 1rem;
	}

	.closed-book-zone {
		grid-template-columns: 1fr;
		align-items: start;
		order: -1;
		width: min(100%, 34rem);
		margin-inline: auto;
	}

	.closed-book-stack {
		--book-frame-padding: 0.25rem;
		width: clamp(12rem, 60vw, 14rem);
	}

	.closed-book-wrap {
		padding: var(--book-frame-padding);
	}

	.closed-book {
		transform: rotateZ(-0.8deg);
	}

	.book-page-edges {
		--page-edge-depth: 0.22rem;
	}

	.closed-cover > strong {
		font-size: clamp(1.8rem, 8vw, 2.2rem);
		letter-spacing: 0.06em;
	}

	.closed-cover :global(.cover-emblem) {
		margin-block: 0;
		transform: none;
	}

	.closed-book-stack :global(.book-edge-tabs .ribbon-label),
	.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-label) {
		font-size: 0.64rem;
	}
}

@media (max-width: 30rem) {
	.bureau-demo {
		padding-inline: 0.75rem;
	}

	.recommendation-card,
	.mobile-paper,
	.preparation-panel {
		padding-inline: 0.9rem;
	}

	.closed-book-stack {
		--book-frame-padding: 0.2rem;
	}
}

@media (max-width: 22rem) {
	.closed-cover > strong {
		font-size: 1.75rem;
	}

	.closed-book-stack :global(.book-edge-tabs .ribbon-label),
	.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-label) {
		font-size: 0.56rem;
		letter-spacing: 0.02em;
	}
}

@media (prefers-reduced-motion: reduce) {
	.closed-book,
	.catalog-book,
	.left-page,
	.right-page {
		transform: none;
	}
}
</style>
