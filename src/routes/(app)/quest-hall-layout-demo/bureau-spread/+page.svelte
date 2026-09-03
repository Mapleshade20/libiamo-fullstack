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
import { disableScrollHandling, goto } from "$app/navigation";
import { base } from "$app/paths";
import {
	CARTE_BOOK_FULL_TURN,
	CARTE_COVER_LIGHT_REST,
	CARTE_IDLE_SWAY,
	CARTE_MOTION_TOKENS,
	type CarteDemoControlGroup,
	type CarteFitVars,
	type CarteMotionScope,
	CoverEmblem,
	createCarteBookCloseTiming,
	createCarteBookOpenEase,
	createCarteBookOpenTiming,
	createCarteCoverLight,
	createCarteMotionScope,
	DemoControls,
	measureCarteFit,
	prefersReducedCarteMotion,
	RibbonTabs,
	readCarteTilt,
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
// The cover is a rigid board hinged on the spine: it never changes height, it
// only swings. Its underside is the left page, so at -180° it lands coplanar
// with the recto and the spread is simply the book seen from above.
const COVER_OPEN_ROTATION = -180;

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
let catalogStage = $state<HTMLElement>();
let prepareStage = $state<HTMLElement>();
let preparationPanel = $state<HTMLElement>();

// The one and only CARTE. It never changes stage or gets handed off to a proxy;
// every view just re-fits and re-poses this same solid.
let bookLayer = $state<HTMLElement>();
let carteBook = $state<HTMLElement>();
let carteBookTilt = $state<HTMLElement>();
let carteRectoProbe = $state<HTMLElement>();
let carteCover = $state<HTMLElement>();
let carteLeftHalf = $state<HTMLElement>();
let carteTurnZones = $state<HTMLElement>();
let carteShadow = $state<HTMLElement>();
let cartePageLeft = $state<HTMLElement>();
let cartePageRight = $state<HTMLElement>();
let turningSheet = $state<HTMLElement>();

// Layout-only placeholders: each view owns an invisible box telling the book
// where to sit. They carry the click targets too, so the book itself stays
// non-interactive except for the spread.
let homeSlot = $state<HTMLElement>();
let catalogSlot = $state<HTMLElement>();
let prepareSlot = $state<HTMLElement>();

let mobileBook = $state<HTMLElement>();
let mobilePaper = $state<HTMLElement>();
let mobileEdgeTabs = $state<HTMLElement>();
let prepareDock = $state<HTMLElement>();

let motionScope: CarteMotionScope | null = null;
let closedBookIdle: ReturnType<CarteMotionScope["to"]>[] = [];
let systemReduced = $state(false);
let mounted = $state(false);
let visualView = $state(initialDemoState.view);
let transitionFrom = $state<QuestHallDemoUrlState["view"] | null>(null);
let transitionTo = $state<QuestHallDemoUrlState["view"] | null>(null);
let optimisticState = $state<QuestHallDemoUrlState>({ ...initialDemoState });
let pendingSignature = $state<string | null>(null);
let observedSignature = $state(stateSignature(initialDemoState));
let localHistoryDepth = $state(0);
let homeReturnScrollY = 0;
let catalogReturnScrollY: number | null = null;
let suppressNextPopstateScroll = false;
let preparationOriginView: "home" | "catalog" = initialDemoState.view === "home" ? "home" : "catalog";
let displayedPreparation = $state(untrack(() => data.selectedPreparation));
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
let narrowLayout = $state(false);
let spreadIsLive = $derived(visualView === "catalog" && !narrowLayout && transitionTo === null);
// Closing a book does not turn its pages. The URL goes back to whatever the
// closed view was left on, but the leaves under the swinging cover keep the
// spread they were open at until the board has come to rest.
let heldCatalogLocation = $state<{ section: QuestHallDemoSection; leaf: number } | null>(null);
let catalogLocation = $derived(heldCatalogLocation ?? { section: optimisticState.section, leaf: optimisticState.leaf });

let recommendations = $derived(deriveQuestHallDemoRecommendations(data).slice(0, 2));
let unreadReplyCount = $derived(getQuestHallDemoUnreadReplyCount(data));
let unreadReplySummary = $derived(`${unreadReplyCount} ${unreadReplyCount === 1 ? "nouvelle réponse non lue" : "nouvelles réponses non lues"}`);
let currentLeaf = $derived(getQuestHallDemoBookSpread(data, catalogLocation.section, catalogLocation.leaf));
let catalogPagePosition = $derived(getQuestHallDemoCatalogPagePosition(data, catalogLocation.section, currentLeaf.leaf));
let staticLeftPage = $derived.by(() => {
	if (!turnPreview?.usesSheet) return { section: catalogLocation.section, spread: currentLeaf };
	return turnPreview.direction > 0
		? { section: turnPreview.fromSection, spread: turnPreview.fromSpread }
		: { section: turnPreview.toSection, spread: turnPreview.toSpread };
});
let staticRightPage = $derived.by(() => {
	if (!turnPreview?.usesSheet) return { section: catalogLocation.section, spread: currentLeaf };
	return turnPreview.direction > 0
		? { section: turnPreview.toSection, spread: turnPreview.toSpread }
		: { section: turnPreview.fromSection, spread: turnPreview.fromSpread };
});
let leftPageItems = $derived(staticLeftPage.spread.leftItems);
let rightPageItems = $derived(staticRightPage.spread.rightItems);
let previousTurnTarget = $derived(getQuestHallDemoCatalogTurnTarget(data, catalogLocation.section, currentLeaf.leaf, -1));
let nextTurnTarget = $derived(getQuestHallDemoCatalogTurnTarget(data, catalogLocation.section, currentLeaf.leaf, 1));
let currentMobileItem = $derived(currentLeaf.items[mobilePosition] ?? currentLeaf.items[0] ?? null);
let forceReduced = $derived(optimisticState.motion === "reduce");
let reducedMotion = $derived(forceReduced || systemReduced);
let liveMessage = $derived.by(() => {
	if (optimisticState.view === "home") {
		return `${recommendations.length} recommandations disponibles.${unreadReplyCount > 0 ? ` ${unreadReplySummary}.` : ""}`;
	}
	if (optimisticState.view === "prepare") return "Préparation de la mission sélectionnée.";
	return `${SECTION_LABELS[catalogLocation.section]}, feuillet ${catalogPagePosition.current} sur ${catalogPagePosition.total}.`;
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

function stopClosedBookIdle() {
	for (const tween of closedBookIdle) tween.kill();
	closedBookIdle = [];
}

/** Writes the modelled window response onto the board for the current tilt. */
function applyCoverLight(rotateX: number, rotateY: number) {
	if (!carteCover) return;
	const light = createCarteCoverLight(rotateX, rotateY);
	carteCover.style.setProperty("--cover-sheen-x", `${light.sheenX.toFixed(2)}%`);
	carteCover.style.setProperty("--cover-sheen-y", `${light.sheenY.toFixed(2)}%`);
	carteCover.style.setProperty("--cover-gloss", light.gloss.toFixed(3));
	carteCover.style.setProperty("--cover-shade", light.shade.toFixed(3));
}

function syncCoverLightToTilt() {
	if (!carteBookTilt) return;
	const tilt = readCarteTilt(carteBookTilt);
	applyCoverLight(tilt.rotateX, tilt.rotateY);
}

/**
 * Eases the board back to the pose the window models as square-on, so a view
 * change never snaps the sheen off the cover it was resting on.
 */
function addCoverLightSettle(timeline: ReturnType<CarteMotionScope["timeline"]>, at: number, duration: number, ease: string) {
	if (!carteCover) return;
	timeline.to(
		carteCover,
		{
			"--cover-sheen-x": `${CARTE_COVER_LIGHT_REST.sheenX}%`,
			"--cover-sheen-y": `${CARTE_COVER_LIGHT_REST.sheenY}%`,
			"--cover-gloss": CARTE_COVER_LIGHT_REST.gloss,
			"--cover-shade": CARTE_COVER_LIGHT_REST.shade,
			duration,
			ease,
		},
		at,
	);
}

/**
 * A closed CARTE resting on the bureau keeps drifting. The two axes run on
 * their own periods and re-roll their target every cycle, so the board wanders
 * instead of retracing a loop, and the cover's lighting is recomputed from the
 * angles it reaches rather than baked into the sway.
 */
function startClosedBookIdle() {
	stopClosedBookIdle();
	if (!motionScope || !carteBookTilt) return;
	if (isReduced()) {
		motionScope.set(carteBookTilt, { rotateX: 0, rotateY: 0, rotateZ: 0 });
		applyCoverLight(0, 0);
		return;
	}

	motionScope.set(carteBookTilt, { rotateZ: 0 });
	closedBookIdle = [
		motionScope.to(carteBookTilt, {
			rotateX: `random(${-CARTE_IDLE_SWAY.pitch}, ${CARTE_IDLE_SWAY.pitch}, 0.1)`,
			duration: CARTE_IDLE_SWAY.pitchPeriod,
			ease: "sine.inOut",
			repeat: -1,
			repeatRefresh: true,
			onUpdate: syncCoverLightToTilt,
		}),
		motionScope.to(carteBookTilt, {
			rotateY: `random(${-CARTE_IDLE_SWAY.yaw}, ${CARTE_IDLE_SWAY.yaw}, 0.1)`,
			duration: CARTE_IDLE_SWAY.yawPeriod,
			ease: "sine.inOut",
			repeat: -1,
			repeatRefresh: true,
			onUpdate: syncCoverLightToTilt,
		}),
	];
}

type CarteView = QuestHallDemoUrlState["view"];

const IDENTITY_FIT: CarteFitVars = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0 };

/** The spread only exists on wide viewports; narrower ones read a flat leaf. */
function isBookSpread(view: CarteView): boolean {
	return view === "catalog" && !narrowLayout;
}

function slotFor(view: CarteView): HTMLElement | undefined {
	if (view === "catalog") return narrowLayout ? undefined : catalogSlot;
	return view === "prepare" ? prepareSlot : homeSlot;
}

/**
 * Closed views only show the book's right half, so they are aligned by that
 * half rather than by the whole spread box. Measured lazily right before the
 * tween so a resize or a scroll mid-flight cannot desynchronise it.
 */
function measureBookFit(view: CarteView): CarteFitVars {
	if (!carteBook) return IDENTITY_FIT;
	const slot = slotFor(view);
	if (!slot) return IDENTITY_FIT;
	return measureCarteFit(carteBook, slot, isBookSpread(view) ? null : carteRectoProbe);
}

function leftHalfParts(): HTMLElement[] {
	return carteLeftHalf ? Array.from(carteLeftHalf.querySelectorAll<HTMLElement>(".carte-surface")) : [];
}

/** Puts the solid into a view's resting pose without any interpolation. */
function setBookTerminal(view: CarteView) {
	if (!motionScope || !carteBook) return;
	const open = isBookSpread(view);
	motionScope.set(carteBook, { ...measureBookFit(view), rotation: 0, skewX: 0 });
	if (carteBookTilt) motionScope.set(carteBookTilt, { rotateX: 0, rotateY: 0, rotateZ: 0 });
	if (carteCover) motionScope.set(carteCover, { rotateY: open ? COVER_OPEN_ROTATION : 0 });
	applyCoverLight(0, 0);
	motionScope.set(leftHalfParts(), { autoAlpha: open ? 1 : 0 });
	if (carteTurnZones) motionScope.set(carteTurnZones, { autoAlpha: open ? 1 : 0 });
	if (carteShadow) motionScope.set(carteShadow, { autoAlpha: 1, z: -2, scaleX: open ? 1 : 0.52, transformOrigin: "right center" });
	if (bookLayer) motionScope.set(bookLayer, { autoAlpha: view === "catalog" && narrowLayout ? 0 : 1 });
}

function setSceneObjectsTerminal(view: CarteView) {
	if (!motionScope) return;
	setBookTerminal(view);
	if (turningSheet) motionScope.set(turningSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 });
	if (mobileBook) motionScope.set(mobileBook, { autoAlpha: view === "catalog" ? 1 : 0, y: 0, scale: 1 });
	if (mobilePaper) motionScope.set(mobilePaper, { autoAlpha: 1, x: 0, y: 0, scale: 1, rotateZ: 0 });
	if (mobileEdgeTabs) motionScope.set(mobileEdgeTabs, { autoAlpha: view === "catalog" ? 1 : 0, x: 0, y: 0, scale: 1, rotateZ: 0 });
	if (recommendationsEl) motionScope.set(recommendationsEl, { autoAlpha: view === "home" ? 1 : 0, x: 0 });
	if (prepareDock) motionScope.set(prepareDock, { autoAlpha: view === "prepare" ? 1 : 0, x: 0, y: 0, scaleX: 1, scaleY: 1 });
	if (preparationPanel) motionScope.set(preparationPanel, { autoAlpha: view === "prepare" ? 1 : 0, x: 0, y: 0 });
	if (rootEl) motionScope.set(rootEl.querySelectorAll(".task-card, .recommendation-card"), { x: 0, y: 0, scaleX: 1, scaleY: 1 });
}

function resetPaperTurnVisuals() {
	if (!motionScope) return;
	paperTurnSequence += 1;
	pendingPaperTurnSection = null;
	turnPreview = null;
	if (cartePageLeft) motionScope.set(cartePageLeft, { autoAlpha: 1 });
	if (cartePageRight) motionScope.set(cartePageRight, { autoAlpha: 1 });
	if (turningSheet) motionScope.set(turningSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 });
	if (mobilePaper) motionScope.set(mobilePaper, { autoAlpha: 1, x: 0, y: 0, scale: 1, rotateZ: 0 });
	if (mobileEdgeTabs) motionScope.set(mobileEdgeTabs, { x: 0, y: 0, rotateZ: 0 });
}

function applyStageTerminal(view: QuestHallDemoUrlState["view"]) {
	if (!motionScope || !homeStage || !catalogStage || !prepareStage) return;
	motionScope.set(homeStage, { autoAlpha: view === "home" ? 1 : 0, zIndex: "auto", pointerEvents: view === "home" ? "auto" : "none" });
	motionScope.set(catalogStage, { autoAlpha: view === "catalog" ? 1 : 0, zIndex: "auto", pointerEvents: view === "catalog" ? "auto" : "none" });
	motionScope.set(prepareStage, { autoAlpha: view === "prepare" ? 1 : 0, zIndex: "auto", pointerEvents: view === "prepare" ? "auto" : "none" });
	setSceneObjectsTerminal(view);
}

/**
 * A view change that leaves the spread pins the leaves in place for the whole
 * swing, so the cover closes over the spread the reader was actually on rather
 * than over a book that flipped itself back to the first feuillet mid-air.
 */
function holdCatalogLocationFor(from: CarteView, to: CarteView) {
	heldCatalogLocation = from === "catalog" && to !== "catalog" ? { section: catalogLocation.section, leaf: currentLeaf.leaf } : null;
}

function setStageTerminal(view: QuestHallDemoUrlState["view"]) {
	transitionFrom = null;
	transitionTo = null;
	heldCatalogLocation = null;
	visualView = view;
	if (!motionScope) return;
	motionScope.stopAll("hold");
	applyStageTerminal(view);
	if (view === "home") startClosedBookIdle();
	else stopClosedBookIdle();
}

function settleViewTransition() {
	if (transitionTo) setStageTerminal(transitionTo);
}

function completeViewTransition(view: QuestHallDemoUrlState["view"]) {
	visualView = view;
	transitionFrom = null;
	transitionTo = null;
	heldCatalogLocation = null;
	applyStageTerminal(view);
	if (view === "home") startClosedBookIdle();
	else stopClosedBookIdle();
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

function getCatalogReopenScrollY(): number {
	if (!rootEl) return window.scrollY;
	if (catalogReturnScrollY !== null) {
		const target = catalogReturnScrollY;
		catalogReturnScrollY = null;
		return target;
	}

	const stageStack = rootEl.querySelector<HTMLElement>(".stage-stack");
	if (!stageStack) return window.scrollY;

	const narrow = isNarrowViewport();
	const navigationBottom = document.querySelector<HTMLElement>("[data-app-nav]")?.getBoundingClientRect().bottom ?? 0;
	const narrowStageOffset = window.innerHeight >= 600 ? 86 : 16;
	const targetViewportTop = Math.max(0, navigationBottom) + (narrow ? narrowStageOffset : 16);
	const stageBounds = stageStack.getBoundingClientRect();
	if (!narrow && stageBounds.top >= targetViewportTop && stageBounds.top <= window.innerHeight * 0.55) return window.scrollY;

	return Math.max(0, window.scrollY + stageBounds.top - targetViewportTop);
}

function addScrollTransition(timeline: ReturnType<CarteMotionScope["timeline"]>, targetY: number, duration: number) {
	const scrollPosition = { y: window.scrollY };
	if (Math.abs(scrollPosition.y - targetY) < 1) return;
	timeline.to(
		scrollPosition,
		{
			y: targetY,
			duration,
			ease: CARTE_MOTION_TOKENS.easeInOut,
			onUpdate: () => window.scrollTo({ left: window.scrollX, top: scrollPosition.y, behavior: "auto" }),
		},
		0,
	);
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
	const firstTask = firstVisibleButton(rootEl, ".task-select");
	focusStageTarget(catalogStage, closeButton ?? firstTask ?? selectedTab);
}

function focusSelectedTask() {
	const selector = lastSelectedKey ? `.task-select[data-task-key="${lastSelectedKey}"]` : ".task-select";
	queueMicrotask(() => {
		const selectedTask = firstVisibleButton(rootEl, selector);
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
	focusStageTarget(homeStage, homeSlot);
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
		const preferred = firstVisibleButton(rootEl, `button.page-turn-surface[aria-label="${preferredLabel}"]:not(:disabled)`);
		const fallback = firstVisibleButton(rootEl, `button.page-turn-surface[aria-label="${fallbackLabel}"]:not(:disabled)`);
		(preferred ?? fallback)?.focus({ preventScroll: true });
	});
}

/**
 * Re-fits the one solid onto a view's slot. Measured inside the timeline so a
 * scroll or resize between the click and the first frame cannot desync it.
 */
function addBookFit(timeline: ReturnType<CarteMotionScope["timeline"]>, view: CarteView, at: number, duration: number, ease: string) {
	if (!carteBook) return;
	let fit = IDENTITY_FIT;
	timeline.call(
		() => {
			fit = measureBookFit(view);
		},
		[],
		at,
	);
	timeline.to(
		carteBook,
		{
			x: () => fit.x,
			y: () => fit.y,
			scaleX: () => fit.scaleX,
			scaleY: () => fit.scaleY,
			duration,
			ease,
		},
		at,
	);
}

/**
 * The cover is a hinged board; opening it is the only thing that turns a closed
 * CARTE into a spread. The left leaf block and the contact shadow follow it.
 */
function addCoverSwing(
	timeline: ReturnType<CarteMotionScope["timeline"]>,
	open: boolean,
	at: number,
	duration: number,
	ease: string | ((progress: number) => number),
) {
	if (carteCover) timeline.to(carteCover, { rotateY: open ? COVER_OPEN_ROTATION : 0, duration, ease }, at);
	const parts = leftHalfParts();
	if (parts.length > 0) {
		// The already-turned leaves only belong on the table once the cover has
		// swung past them, so they arrive under it rather than popping beside it.
		if (open) timeline.to(parts, { autoAlpha: 1, duration: duration * 0.3 }, at + duration * 0.62);
		else timeline.to(parts, { autoAlpha: 0, duration: duration * 0.26 }, at + duration * 0.06);
	}
	if (carteTurnZones) timeline.to(carteTurnZones, { autoAlpha: open ? 1 : 0, duration: duration * 0.3 }, open ? at + duration * 0.62 : at);
	if (carteShadow) timeline.to(carteShadow, { scaleX: open ? 1 : 0.52, duration, ease }, at);
}

/**
 * Every view change is the same physical event: the one book is re-fitted onto
 * the destination slot and its cover swung to match. Nothing is ever swapped
 * for a look-alike, so there is no seam left to cross-fade.
 */
function playViewTransition(from: CarteView, to: CarteView, selectedElement?: HTMLElement) {
	if (!motionScope || !homeStage || !catalogStage || !prepareStage) {
		setStageTerminal(to);
		return;
	}

	settleViewTransition();
	const scrollTargetY =
		to === "home" && from !== "home" ? homeReturnScrollY : from === "prepare" && to === "catalog" ? getCatalogReopenScrollY() : null;
	stopClosedBookIdle();
	motionScope.stopAll("hold");
	resetPaperTurnVisuals();
	if (rootEl?.contains(document.activeElement)) rootEl.focus({ preventScroll: true });
	holdCatalogLocationFor(from, to);
	transitionFrom = from;
	transitionTo = to;

	const reduced = isReduced();
	const narrow = isNarrowViewport();
	const timeline = motionScope.timeline({ defaults: { ease: CARTE_MOTION_TOKENS.easeInOut } });
	const stages = { home: homeStage, catalog: catalogStage, prepare: prepareStage } satisfies Record<CarteView, HTMLElement>;
	const fromStage = stages[from];
	const toStage = stages[to];
	const idleStage = [homeStage, catalogStage, prepareStage].find((stage) => stage !== fromStage && stage !== toStage);
	const finish = () => {
		completeViewTransition(to);
		focusViewDestination(from, to);
	};

	if (idleStage) timeline.set(idleStage, { autoAlpha: 0, pointerEvents: "none" }, 0);
	timeline.set(fromStage, { autoAlpha: 1, pointerEvents: "none" }, 0);
	timeline.set(toStage, { autoAlpha: 0, visibility: "visible", pointerEvents: "none" }, 0);

	if (scrollTargetY !== null) {
		if (reduced) window.scrollTo({ left: window.scrollX, top: scrollTargetY, behavior: "auto" });
		else addScrollTransition(timeline, scrollTargetY, from === "prepare" && to === "catalog" ? 0.48 : 0.62);
	}

	if (reduced) {
		setSceneObjectsTerminal(to);
		timeline.to(fromStage, { autoAlpha: 0, duration: 0.1 }, 0).to(toStage, { autoAlpha: 1, duration: 0.12 }, 0.04).call(finish);
		return;
	}

	// The idle sway was killed wherever it happened to be, so the window's
	// reading of the board has to be eased back to square rather than snapped.
	addCoverLightSettle(timeline, 0, CARTE_MOTION_TOKENS.durationStandard, CARTE_MOTION_TOKENS.easeInOut);

	const opening = isBookSpread(to) && !isBookSpread(from);
	const closing = isBookSpread(from) && !isBookSpread(to);
	const bookLeaves = to === "catalog" && narrow;
	const bookReturns = from === "catalog" && narrow;
	let bookEnd: number = CARTE_MOTION_TOKENS.durationCeremonial;

	if (bookLeaves) {
		if (bookLayer) timeline.to(bookLayer, { autoAlpha: 0, duration: 0.22, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		bookEnd = 0.24;
	} else if (bookReturns) {
		// Nothing to interpolate from: the solid was parked off-screen while the
		// flat leaf held the stage, so it is posed first and then faded back in.
		timeline.call(() => setBookTerminal(to), [], 0.1);
		if (bookLayer) timeline.to(bookLayer, { autoAlpha: 1, duration: 0.28, ease: CARTE_MOTION_TOKENS.easeOut }, 0.14);
		bookEnd = 0.46;
	} else if (opening) {
		const timing = createCarteBookOpenTiming();
		if (bookLayer) timeline.set(bookLayer, { autoAlpha: 1 }, 0);
		addBookFit(timeline, to, 0, timing.spinDuration, "power2.inOut");
		if (carteBookTilt) {
			timeline.to(carteBookTilt, { rotateX: 0, rotateY: CARTE_BOOK_FULL_TURN, rotateZ: 0, duration: timing.spinDuration, ease: "power2.inOut" }, 0);
			timeline.set(carteBookTilt, { rotateY: 0 }, timing.spinDuration);
		}
		addCoverSwing(timeline, true, timing.coverStart, timing.coverDuration, createCarteBookOpenEase(timing));
		bookEnd = Math.max(timing.spinDuration, timing.totalDuration);
	} else if (closing) {
		const timing = createCarteBookCloseTiming();
		if (bookLayer) timeline.set(bookLayer, { autoAlpha: 1 }, 0);
		addCoverSwing(timeline, false, 0, timing.coverDuration, "power1.inOut");
		addBookFit(timeline, to, timing.coverStart, timing.spinDuration, "power2.inOut");
		if (carteBookTilt) {
			timeline.set(carteBookTilt, { rotateY: CARTE_BOOK_FULL_TURN }, timing.coverStart);
			timeline.to(carteBookTilt, { rotateX: 0, rotateY: 0, rotateZ: 0, duration: timing.spinDuration, ease: "power2.inOut" }, timing.coverStart);
		}
		bookEnd = timing.totalDuration;
	} else {
		if (bookLayer) timeline.set(bookLayer, { autoAlpha: 1 }, 0);
		// The idle sway is killed wherever it happened to be, so the book has to
		// be eased out of that angle rather than snapped flat on arrival.
		if (carteBookTilt) {
			timeline.to(
				carteBookTilt,
				{ rotateX: 0, rotateY: 0, rotateZ: 0, duration: CARTE_MOTION_TOKENS.durationCeremonial, ease: CARTE_MOTION_TOKENS.easeInOut },
				0,
			);
		}
		addBookFit(timeline, to, 0, CARTE_MOTION_TOKENS.durationCeremonial, CARTE_MOTION_TOKENS.easeInOut);
	}

	const chromeIn = Math.max(0.2, bookEnd - 0.36);
	timeline.to(fromStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.24 }, 0.04);
	timeline.set(toStage, { autoAlpha: 1 }, chromeIn);

	if (selectedElement) {
		const surface = selectedElement.closest<HTMLElement>(".task-card, .recommendation-card") ?? selectedElement;
		timeline.to(surface, { y: -7, scale: 1.01, duration: 0.12, ease: CARTE_MOTION_TOKENS.easeOut }, 0);
		timeline.to(surface, { y: 0, scale: 1, duration: 0.16 }, 0.12);
	}

	if (recommendationsEl) {
		if (from === "home") timeline.to(recommendationsEl, { autoAlpha: 0, x: -28, duration: 0.3, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		if (to === "home") {
			timeline.set(recommendationsEl, { autoAlpha: 0, x: -28 }, 0);
			timeline.to(recommendationsEl, { autoAlpha: 1, x: 0, duration: 0.34, ease: CARTE_MOTION_TOKENS.easeOut }, chromeIn);
		}
	}
	if (prepareDock) {
		if (from === "prepare") timeline.to(prepareDock, { autoAlpha: 0, duration: 0.2, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		if (to === "prepare") {
			timeline.set(prepareDock, { autoAlpha: 0 }, 0);
			timeline.to(prepareDock, { autoAlpha: 1, duration: 0.24, ease: CARTE_MOTION_TOKENS.easeOut }, chromeIn);
		}
	}
	if (preparationPanel) {
		if (from === "prepare") timeline.to(preparationPanel, { autoAlpha: 0, x: 28, duration: 0.26, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
		if (to === "prepare") {
			timeline.set(preparationPanel, { autoAlpha: 0, x: narrow ? 0 : 36 }, 0);
			timeline.to(preparationPanel, { autoAlpha: 1, x: 0, duration: 0.4, ease: CARTE_MOTION_TOKENS.easeOut }, chromeIn + 0.04);
		}
	}

	if (narrow) {
		if (to === "catalog") {
			if (mobileBook) {
				timeline.set(mobileBook, { autoAlpha: 0, y: 18, scale: 0.985, transformOrigin: "center top" }, 0);
				timeline.to(mobileBook, { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: CARTE_MOTION_TOKENS.easeOut }, chromeIn);
			}
			if (mobilePaper) {
				timeline.set(mobilePaper, { autoAlpha: 0, y: 54, scale: 0.95, rotateZ: -1, transformOrigin: "center bottom" }, 0);
				timeline.to(mobilePaper, { autoAlpha: 1, y: 0, scale: 1, rotateZ: 0, duration: 0.5, ease: CARTE_MOTION_TOKENS.easeOut }, chromeIn + 0.06);
			}
			if (mobileEdgeTabs) {
				timeline.set(mobileEdgeTabs, { autoAlpha: 0, x: -12 }, 0);
				timeline.to(mobileEdgeTabs, { autoAlpha: 1, x: 0, duration: 0.24, ease: CARTE_MOTION_TOKENS.easeOut }, chromeIn + 0.22);
			}
		} else if (from === "catalog") {
			if (mobileEdgeTabs) timeline.to(mobileEdgeTabs, { autoAlpha: 0, x: -12, duration: 0.14, ease: CARTE_MOTION_TOKENS.easeExit }, 0);
			if (mobilePaper) timeline.to(mobilePaper, { autoAlpha: 0, y: 64, scale: 0.94, rotateZ: 1.1, duration: 0.34 }, 0);
			if (mobileBook) timeline.to(mobileBook, { autoAlpha: 0, y: 18, scale: 0.985, duration: 0.22 }, 0.22);
		}
	}

	timeline.call(finish, [], Math.max(bookEnd, chromeIn + 0.44));
}

async function playPaperTurn(
	direction: -1 | 1,
	swap?: () => void,
	target?: { section: QuestHallDemoSection; leaf: number },
	source?: { section: QuestHallDemoSection; leaf: number },
) {
	if (!motionScope || !turningSheet) {
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
		// Reduced motion swaps the leaves in place; both page faces fade as one.
		const content = narrow && mobilePaper ? [mobilePaper] : [cartePageLeft, cartePageRight].filter((page) => page !== undefined);
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
	if (previous.view === "home" && transition.state.view !== "home") homeReturnScrollY = window.scrollY;
	if (previous.view === "catalog" && transition.state.view === "prepare") catalogReturnScrollY = window.scrollY;
	optimisticState = { ...transition.state };
	pendingSignature = stateSignature(transition.state);

	if (previous.view !== transition.state.view) {
		visualView = transition.state.view;
		playViewTransition(previous.view, transition.state.view, selectedElement);
	}

	if (transition.historyIntent === "back" && localHistoryDepth > 0) {
		localHistoryDepth -= 1;
		suppressNextPopstateScroll = true;
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
	preparationOriginView = optimisticState.view === "home" ? "home" : "catalog";
	void navigateTransition({ type: "select-task", task: item.key }, event.currentTarget as HTMLElement);
}

function returnFromPreparation(event?: MouseEvent) {
	event?.preventDefault();
	void navigateTransition({ type: "return-from-prepare", destination: preparationOriginView });
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
		timeline.call(() => setBookTerminal("catalog"), [], 0.24);
		timeline.set(stamps, { autoAlpha: 0, scale: 1, rotate: -2 }, 0.24);
		timeline.to(stamps, { autoAlpha: 1, duration: 0.12 }, 0.26);
		timeline.to(catalogStage, { autoAlpha: 0, duration: 0.1 }, 0.4);
		timeline.call(() => setBookTerminal("home"), [], 0.5);
		timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" }, 0.5);
		timeline.to(cards, { autoAlpha: 1, duration: 0.12 }, 0.52);
		timeline.call(finish);
		return;
	}

	// The replay opens the CARTE to stamp mission 01 and closes it again, so it
	// drives the same solid through the same swing the real transition uses.
	const closeAt = 0.8;
	const closeTiming = createCarteBookCloseTiming();
	if (oldRecommendation) timeline.to(oldRecommendation, { autoAlpha: 0, x: -28, duration: 0.28 }, 0.08);
	timeline.to(homeStage, { autoAlpha: 0, duration: 0.2 }, 0.3);
	timeline.call(() => setBookTerminal("catalog"), [], 0.36);
	timeline.set(catalogStage, { autoAlpha: 1 }, 0.44);
	timeline.set(stamps, { autoAlpha: 0, scale: 1.6, rotate: -8 });
	timeline.to(stamps, { autoAlpha: 1, scale: 1, rotate: -2, duration: 0.28, ease: "back.out(1.8)" }, 0.54);
	addCoverSwing(timeline, false, closeAt, closeTiming.coverDuration, "power1.inOut");
	addBookFit(timeline, "home", closeAt + closeTiming.coverStart, closeTiming.spinDuration, "power2.inOut");
	if (carteBookTilt) {
		timeline.set(carteBookTilt, { rotateY: CARTE_BOOK_FULL_TURN }, closeAt + closeTiming.coverStart);
		timeline.to(
			carteBookTilt,
			{ rotateX: 0, rotateY: 0, rotateZ: 0, duration: closeTiming.spinDuration, ease: "power2.inOut" },
			closeAt + closeTiming.coverStart,
		);
	}
	timeline.to(catalogStage, { autoAlpha: 0, duration: 0.2 }, closeAt + closeTiming.coverDuration * 0.5);
	timeline.set(homeStage, { autoAlpha: 1, pointerEvents: "none" }, closeAt + closeTiming.totalDuration - 0.3);
	if (recommendationsEl) timeline.set(recommendationsEl, { autoAlpha: 1, x: 0 }, closeAt + closeTiming.totalDuration - 0.3);
	timeline.to(
		cards,
		{
			autoAlpha: 1,
			y: 0,
			duration: 0.32,
			stagger: 0.08,
			ease: CARTE_MOTION_TOKENS.easeOut,
		},
		closeAt + closeTiming.totalDuration - 0.28,
	);
	timeline.call(finish, [], closeAt + closeTiming.totalDuration + 0.12);
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
	motionScope.matchMedia().add("(max-width: 64rem)", () => {
		narrowLayout = true;
		setStageTerminal(optimisticState.view);
		return () => {
			narrowLayout = false;
			setStageTerminal(optimisticState.view);
		};
	});
	mounted = true;
	setStageTerminal(data.demoState.view);
	return () => {
		mounted = false;
		stopClosedBookIdle();
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
	if (suppressNextPopstateScroll) {
		disableScrollHandling();
		suppressNextPopstateScroll = false;
	}
	if (previous.view === "home" && next.view !== "home") homeReturnScrollY = window.scrollY;
	if (previous.view === "catalog" && next.view === "prepare") catalogReturnScrollY = window.scrollY;
	observedSignature = signature;
	optimisticState = { ...next };
	if (next.view === "prepare" && (previous.view === "home" || previous.view === "catalog")) preparationOriginView = previous.view;
	if (next.view === "prepare" && data.selectedPreparation) displayedPreparation = data.selectedPreparation;
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
	const location = `${catalogLocation.section}-${catalogLocation.leaf}`;
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
			{#if side === "left"}
				{@render resourceStateCopy(spread)}
			{/if}
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
					<div class="closed-book-stack">
						<button
							bind:this={homeSlot}
							type="button"
							class="carte-slot carte-slot--home carte-focusable"
							aria-label={unreadReplyCount > 0 ? `Ouvrir la CARTE — ${unreadReplySummary}` : "Ouvrir la CARTE"}
							aria-expanded={optimisticState.view !== "home"}
							onclick={() => openCatalog()}
						></button>
						<RibbonTabs
							tabs={ribbonTabs}
							value={catalogLocation.section}
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
					<p>{SECTION_LABELS[catalogLocation.section]}</p>
					<h2 id="catalog-title">Choisissez une mission</h2>
				</div>
				<span class="leaf-counter" aria-live="polite">Feuillet {catalogPagePosition.current} / {catalogPagePosition.total}</span>
			</div>

			<div class="catalog-book-stage">
				<div class="carte-slot carte-slot--catalog" bind:this={catalogSlot} aria-hidden="true"></div>
				<RibbonTabs
					tabs={ribbonTabs}
					value={catalogLocation.section}
					onselect={switchSection}
					orientation="vertical"
					variant="bookmark"
					controls="bureau-catalog-panel"
					class="desktop-page-tabs"
				/>
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
							value={catalogLocation.section}
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
							<span>{SECTION_LABELS[catalogLocation.section]} · Feuillet {catalogPagePosition.current} / {catalogPagePosition.total}</span>
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
					<span class="carte-slot carte-slot--prepare" bind:this={prepareSlot} aria-hidden="true"></span>
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
					{:else if displayedPreparation?.kind === "quest"}
						<TaskPreparation
							task={displayedPreparation.data.task}
							nativeLanguage={displayedPreparation.data.nativeLanguage}
							simulated={optimisticState.scenario !== "actual"}
							backHref={stateUrl({ ...optimisticState, view: "catalog", task: null })}
							backLabel="Retour au catalogue"
							onback={returnFromPreparation}
						/>
					{:else if displayedPreparation?.kind === "translation"}
						<TranslationPreparation
							template={displayedPreparation.data.template}
							attempt={displayedPreparation.data.attempt}
							blockedReason={displayedPreparation.data.blockedReason}
							lang={displayedPreparation.data.template.language}
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

		<!--
			The CARTE itself. It sits outside the three stages because it is the
			same physical object in all of them: only its slot and its cover angle
			change. The layer ignores pointers so the slots underneath stay
			clickable; the open spread takes events back on its own.
		-->
		<div class="carte-book-layer" bind:this={bookLayer}>
			<div class="carte-book-frame">
				<div
					class="carte-book"
					bind:this={carteBook}
					id="bureau-catalog-panel"
					role="tabpanel"
					aria-busy={isPaperTurning}
					inert={!spreadIsLive || isPaperTurning}
				>
					<span class="carte-recto-probe" bind:this={carteRectoProbe} aria-hidden="true"></span>
					<div class="carte-book-tilt" bind:this={carteBookTilt}>
						<div class="carte-book-solid">
							<span class="carte-contact-shadow" bind:this={carteShadow} aria-hidden="true"></span>

							<!-- Leaves already turned: they only exist once the cover has cleared them. -->
							<div class="carte-half carte-half--left" bind:this={carteLeftHalf} aria-hidden="true">
								<span class="carte-surface carte-deck carte-deck--blank"></span>
								<span class="carte-surface carte-edge carte-edge--fore"></span>
								<span class="carte-surface carte-edge carte-edge--head"></span>
								<span class="carte-surface carte-edge carte-edge--tail"></span>
								<span class="carte-surface carte-board carte-board--base"></span>
							</div>

							<!-- The text block, and the recto is its top leaf. -->
							<div class="carte-half carte-half--right">
								<span class="carte-edge carte-edge--fore" aria-hidden="true"></span>
								<span class="carte-edge carte-edge--head" aria-hidden="true"></span>
								<span class="carte-edge carte-edge--tail" aria-hidden="true"></span>
								<span class="carte-edge carte-edge--spine" aria-hidden="true"></span>
								<span class="carte-board carte-board--base" aria-hidden="true"></span>
								<div class="carte-page carte-page--right carte-face" bind:this={cartePageRight}>
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
								</div>
							</div>

							<!--
								Turning a leaf is a grab at the edge of the book, not a click on
								the page, so the pagers sit in their own band rather than inside
								either page's clipped box.
							-->
							<div class="carte-turn-zones" bind:this={carteTurnZones}>
								<button
									type="button"
									class="page-turn-surface page-turn-previous"
									aria-label="Feuillet précédent"
									disabled={!previousTurnTarget || isPaperTurning || transitionTo !== null}
									onclick={() => turnLeaf(-1)}
								>
									<span class="page-turn-cue" aria-hidden="true"><ChevronLeft size={22} strokeWidth={1.35} /></span>
								</button>
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

							<div class="carte-turn-hinge" aria-hidden="true">
								<div class="turning-sheet carte-preserve-3d" bind:this={turningSheet}>
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
							</div>

							<!--
								The cover is a board hinged on the spine. Its underside is the
								left page, which is why opening it never swaps anything out.
							-->
							<div class="carte-cover-hinge">
								<div class="carte-cover carte-preserve-3d" bind:this={carteCover}>
									<span class="carte-cover-face carte-cover-face--front carte-face" aria-hidden="true">
										<span class="cover-depth"></span>
										<span class="cover-rule"></span>
										<strong>CARTE</strong>
										<CoverEmblem size={104} finish="foil" unreadCount={unreadReplyCount} />
										<span class="cover-rule cover-rule-bottom"></span>
										<span class="cover-sheen"></span>
									</span>
									<div
										class="carte-cover-face carte-cover-face--back carte-face carte-face--back carte-page carte-page--left"
										bind:this={cartePageLeft}
									>
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
									<span class="carte-edge carte-edge--board carte-edge--fore" aria-hidden="true"></span>
									<span class="carte-edge carte-edge--board carte-edge--head" aria-hidden="true"></span>
									<span class="carte-edge carte-edge--board carte-edge--tail" aria-hidden="true"></span>
									<span class="carte-edge carte-edge--board carte-edge--spine" aria-hidden="true"></span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
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
	/* A book does not change proportion when it opens: the spread is exactly
	   two of its pages, so the closed footprint is half of it. */
	--carte-spread-aspect: 1.48;
	--carte-page-aspect: 0.74;
	/* How far the bookmark of the section you are on slides out of the book. */
	--ribbon-tab-reach: 0.62rem;
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
	position: relative;
	width: min(100%, 26rem);
}

.closed-book-stack > :global(.book-edge-tabs) {
	position: absolute;
	top: 22%;
	left: calc(100% - 0.9rem);
	z-index: 1;
	width: max-content;
	gap: 0.12rem;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab),
.catalog-book-stage > :global(.desktop-page-tabs .ribbon-tab) {
	width: 4.3rem;
	min-width: 4.3rem;
	height: 2.75rem;
	min-height: 2.75rem;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-face),
.catalog-book-stage > :global(.desktop-page-tabs .ribbon-face) {
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
.catalog-book-stage > :global(.desktop-page-tabs .ribbon-label) {
	font-size: 0.64rem;
	line-height: 1;
	writing-mode: horizontal-tb;
	text-orientation: mixed;
	white-space: nowrap;
}

/*
 * A closed CARTE is not open at any section, so its three bookmarks sit flush
 * and all behave alike under the pointer.
 */
.closed-book-stack > :global(.book-edge-tabs .ribbon-tab[aria-selected="true"]:not(:hover) .ribbon-face) {
	transform: none;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab:hover:not(:disabled) .ribbon-face) {
	transform: translateX(0.3rem);
}

/*
 * Open, the current section stays out. Hovering it must leave it exactly where
 * it is — the hover reach is shorter, so sharing one rule pulled it back in and
 * made switching sections look like two moves instead of one.
 */
.catalog-book-stage > :global(.desktop-page-tabs .ribbon-tab[aria-selected="true"] .ribbon-face) {
	transform: translateX(var(--ribbon-tab-reach));
}

.catalog-book-stage > :global(.desktop-page-tabs .ribbon-tab:hover:not(:disabled):not([aria-selected="true"]) .ribbon-face) {
	transform: translateX(0.3rem);
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab:focus-visible),
.catalog-book-stage > :global(.desktop-page-tabs .ribbon-tab:focus-visible),
.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-tab:focus-visible) {
	outline: 0;
}

.closed-book-stack > :global(.book-edge-tabs .ribbon-tab:focus-visible .ribbon-face),
.catalog-book-stage > :global(.desktop-page-tabs .ribbon-tab:focus-visible .ribbon-face),
.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-tab:focus-visible .ribbon-face) {
	box-shadow:
		inset 0 0 0 2px var(--carte-sheet),
		inset 1px 0 color-mix(in oklab, white 18%, transparent),
		inset -1px 0 color-mix(in oklab, black 20%, transparent);
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

.carte-cover-face--front > strong,
.carte-cover-face--front > :global(.cover-emblem) {
	position: relative;
	z-index: 1;
}

.carte-cover-face--front > strong {
	font-family: var(--font-serif);
	font-size: clamp(2rem, 5vw, 4.4rem);
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

/*
 * How the bureau's window falls on the board. There is one source — a soft,
 * low afternoon window high on the front-left, roughly ten o'clock and some
 * 35° above the desk — plus warm bounce off the paper-coloured room for
 * everything it misses, so the light it lays down is faint and amber rather
 * than white. The board is faintly bowed, as bound board always is, so the
 * window leaves a broad satin lobe on the cloth instead of a mirror point: the
 * lobe slides as the CARTE sways, the far corner deepens as the board turns
 * out of the light, and both sit above the foil so the emblem and the title
 * catch the same sweep the cloth does.
 */
.cover-sheen {
	position: absolute;
	z-index: 2;
	inset: 0;
	pointer-events: none;
}

.cover-sheen::before,
.cover-sheen::after {
	position: absolute;
	inset: 0;
	content: "";
}

.cover-sheen::before {
	background: radial-gradient(
		62% 58% at var(--cover-sheen-x) var(--cover-sheen-y),
		color-mix(in oklab, #fff1d4 14%, transparent),
		color-mix(in oklab, #fff1d4 5%, transparent) 42%,
		transparent 74%
	);
	opacity: var(--cover-gloss);
}

/* A shadow on wine cloth is dark wine, not grey: the room's bounce keeps the
   corner the window misses in the cover's own colour. */
.cover-sheen::after {
	background: linear-gradient(
		128deg,
		transparent 34%,
		color-mix(in oklab, color-mix(in oklab, var(--carte-ink) 76%, var(--carte-cover)) 15%, transparent)
	);
	opacity: var(--cover-shade);
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
	--carte-stage-gutter: 3.25rem;
	--ribbon-tab-width: 4.3rem;
	--ribbon-tab-offset: -0.15rem;
	/* The leaves sit a little proud of the book's layout box, being lifted by
	   the block's own thickness, so the clip has to clear that too. */
	--carte-leaf-bleed: 0.25rem;
	position: relative;
	max-width: 74rem;
	margin: 0 auto;
	padding: 1.5rem var(--carte-stage-gutter) 1.5rem 2.5rem;
}

.carte-page {
	position: absolute;
	inset: 0;
	display: flex;
	min-width: 0;
	flex-direction: column;
	padding: clamp(1.75rem, 8%, 3rem);
	border: 1px solid color-mix(in oklab, var(--carte-ink) 16%, transparent);
	overflow: hidden;
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
	pointer-events: auto;
}

.carte-page--left {
	border-right: 0;
	background: linear-gradient(90deg, var(--carte-sheet), color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)));
}

.carte-page--right {
	border-left: 0;
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)), var(--carte-sheet));
	transform: translateZ(var(--carte-depth));
}

.carte-page > * {
	position: relative;
	z-index: 2;
	pointer-events: none;
}

.carte-turn-zones {
	position: absolute;
	inset: 0;
	/* Level with the leaves, so no sheet can sit between hand and page edge. */
	transform: translateZ(calc(var(--carte-depth) + 2px));
	pointer-events: none;
}

/*
 * Turning reaches from the arrow's inner edge out to one button width past the
 * book, because that overshoot is where a hand goes for the corner of a page.
 * The full page used to be live, which made the left leaf greedy and left the
 * right arrow with nothing to catch a slightly wide aim.
 */
.page-turn-surface {
	--page-turn-reach: 1.8rem;
	--page-turn-cue-inset: 0.35rem;
	position: absolute;
	top: 0;
	bottom: 0;
	z-index: 1;
	width: calc(var(--page-turn-cue-inset) + var(--page-turn-reach) * 2);
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--carte-wine);
	cursor: pointer;
	pointer-events: auto;
	touch-action: manipulation;
}

.page-turn-previous {
	left: calc(-1 * var(--page-turn-reach));
}

.page-turn-next {
	right: calc(-1 * var(--page-turn-reach));
}

/* The wash stays on the paper: it starts at the book edge and fades inward. */
.page-turn-surface::before {
	position: absolute;
	top: 0;
	bottom: 0;
	content: "";
	opacity: 0;
	pointer-events: none;
	transition: opacity 160ms ease;
}

.page-turn-previous::before {
	right: -7rem;
	left: var(--page-turn-reach);
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-wine) 7%, transparent), transparent 24%);
}

.page-turn-next::before {
	right: var(--page-turn-reach);
	left: -7rem;
	background: linear-gradient(270deg, color-mix(in oklab, var(--carte-wine) 7%, transparent), transparent 24%);
}

.page-turn-cue {
	position: absolute;
	top: 50%;
	display: grid;
	width: var(--page-turn-reach);
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
	left: calc(var(--page-turn-reach) + var(--page-turn-cue-inset));
}

.page-turn-next .page-turn-cue {
	right: calc(var(--page-turn-reach) + var(--page-turn-cue-inset));
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

.page-copy {
	position: absolute;
	inset: 0;
	z-index: 1;
	display: flex;
	min-width: 0;
	flex-direction: column;
	padding: clamp(1.75rem, 8%, 3rem);
	overflow: hidden;
	background: linear-gradient(90deg, color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)), var(--carte-sheet));
	color: var(--carte-ink);
	text-align: left;
}

.page-copy.is-left-copy {
	background: linear-gradient(90deg, var(--carte-sheet), color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)));
}

.carte-turn-hinge {
	position: absolute;
	inset: 0;
	transform: translateZ(calc(var(--carte-depth) + 1.4px));
	transform-style: preserve-3d;
	pointer-events: none;
}

.turning-sheet {
	position: absolute;
	top: 0;
	right: 0;
	z-index: 14;
	width: 50%;
	height: 100%;
	visibility: hidden;
	transform-origin: left center;
	transform-style: preserve-3d;
	pointer-events: none;
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
	display: grid;
	gap: 0.8rem;
	width: 100%;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
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

/*
 * The CARTE, as one solid. Every surface below is a face of the same box: the
 * cover hinged on the spine, the text block under it, and the leaves already
 * turned on the left. Views never swap it for a look-alike — they only re-fit
 * it onto their slot and change the cover angle, so there is no seam to hide.
 */
.carte-book-layer {
	position: absolute;
	z-index: 3;
	inset: 0;
	pointer-events: none;
}

.carte-book-frame {
	max-width: 74rem;
	margin: 0 auto;
	padding: 1.5rem 3.25rem 1.5rem 2.5rem;
	/* Flat enough that the book stays undistorted when it sits off-centre in
	   the home and preparation slots, deep enough to still read as an object. */
	perspective: clamp(2600px, 220vw, 4200px);
	perspective-origin: 50% 42%;
}

.carte-book {
	--carte-depth: 26px;
	--carte-cover-depth: 6px;
	--carte-leaf-depth: calc(var(--carte-depth) - var(--carte-cover-depth));
	position: relative;
	width: 100%;
	aspect-ratio: var(--carte-spread-aspect);
	transform-style: preserve-3d;
	will-change: transform;
}

/* Closed views align the book by this half, never by the whole spread box. */
.carte-recto-probe {
	position: absolute;
	inset: 0 0 0 50%;
	visibility: hidden;
	pointer-events: none;
}

.carte-book-tilt,
.carte-book-solid {
	position: absolute;
	inset: 0;
	transform-style: preserve-3d;
}

.carte-book-tilt {
	/* A closed CARTE turns about its own centre, which is the recto's centre. */
	transform-origin: 75% 50%;
	will-change: transform;
}

.carte-contact-shadow {
	position: absolute;
	right: 0;
	bottom: -3.5%;
	left: 0;
	height: 17%;
	border-radius: 50%;
	background: radial-gradient(
		ellipse at center,
		color-mix(in oklab, var(--carte-ink) 28%, transparent) 0%,
		color-mix(in oklab, var(--carte-ink) 13%, transparent) 46%,
		transparent 76%
	);
	filter: blur(16px);
	transform-origin: right center;
	pointer-events: none;
}

.carte-half {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 50%;
	transform-style: preserve-3d;
}

.carte-half--right {
	--carte-edge-depth: var(--carte-depth);
	right: 0;
}

.carte-half--left {
	--carte-edge-depth: var(--carte-leaf-depth);
	left: 0;
}

.carte-deck,
.carte-board,
.carte-edge {
	position: absolute;
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
	pointer-events: none;
}

.carte-deck {
	inset: 0;
	border: 1px solid color-mix(in oklab, var(--carte-ink) 16%, transparent);
	transform: translateZ(var(--carte-edge-depth));
}

.carte-deck--blank {
	border-right: 0;
	background: linear-gradient(90deg, var(--carte-sheet), color-mix(in oklab, var(--carte-paper) 92%, var(--carte-ink)));
}

/* The underside of the block: the back board, only ever seen mid-spin. */
.carte-board--base {
	inset: 0;
	border: 1px solid color-mix(in oklab, var(--carte-brass) 45%, transparent);
	background: linear-gradient(115deg, color-mix(in oklab, white 8%, transparent), transparent 30%), var(--carte-cover);
	transform: rotateY(180deg);
}

.carte-edge {
	background:
		linear-gradient(90deg, color-mix(in oklab, var(--carte-ink) 15%, transparent), transparent 42%),
		repeating-linear-gradient(0deg, #cec3b2 0 1px, #faf4e9 1px 3px);
}

.carte-edge--fore {
	top: 0;
	right: 0;
	width: var(--carte-edge-depth);
	height: 100%;
	transform-origin: right center;
	transform: rotateY(90deg);
}

.carte-edge--spine {
	top: 0;
	left: 0;
	width: var(--carte-edge-depth);
	height: 100%;
	background: linear-gradient(90deg, #55232c, #773440);
	transform-origin: left center;
	transform: rotateY(-90deg);
}

.carte-edge--head {
	top: 0;
	right: 0;
	left: 0;
	height: var(--carte-edge-depth);
	background:
		linear-gradient(0deg, color-mix(in oklab, var(--carte-ink) 15%, transparent), transparent 42%),
		repeating-linear-gradient(90deg, #cec3b2 0 1px, #faf4e9 1px 3px);
	transform-origin: center top;
	transform: rotateX(90deg);
}

.carte-edge--tail {
	right: 0;
	bottom: 0;
	left: 0;
	height: var(--carte-edge-depth);
	background:
		linear-gradient(180deg, color-mix(in oklab, var(--carte-ink) 15%, transparent), transparent 42%),
		repeating-linear-gradient(90deg, #cec3b2 0 1px, #faf4e9 1px 3px);
	transform-origin: center bottom;
	transform: rotateX(-90deg);
}

/* Board edges are the same geometry with cover material and cover thickness. */
.carte-edge--board {
	background: linear-gradient(135deg, color-mix(in oklab, var(--carte-cover) 88%, black), color-mix(in oklab, var(--carte-cover) 68%, black));
}

.carte-cover-hinge {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 50%;
	/* A hair above the recto so the two coincident planes never z-fight. */
	transform: translateZ(calc(var(--carte-depth) + 0.6px));
	transform-style: preserve-3d;
	pointer-events: none;
}

.carte-cover {
	--carte-edge-depth: var(--carte-cover-depth);
	/* Where the window rests on a board lying square to the reader; the sway
	   drives these away from rest frame by frame. */
	--cover-sheen-x: 32%;
	--cover-sheen-y: 26%;
	--cover-gloss: 1;
	--cover-shade: 1;
	position: absolute;
	inset: 0;
	transform-origin: left center;
	transform-style: preserve-3d;
	will-change: transform;
}

.carte-cover-face {
	position: absolute;
	inset: 0;
}

.carte-cover-face--front {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	border: 1px solid color-mix(in oklab, var(--carte-brass) 58%, transparent);
	background: var(--carte-cover);
	box-shadow:
		inset -3px 0 5px -3px color-mix(in oklab, var(--carte-ink) 32%, transparent),
		inset 0 -3px 5px -3px color-mix(in oklab, var(--carte-ink) 28%, transparent);
	color: var(--carte-brass);
	transform: translateZ(var(--carte-cover-depth));
}

.carte-cover-face--front > strong,
.carte-cover-face--front > :global(.cover-emblem) {
	position: relative;
	z-index: 1;
}

.carte-cover-face--front > strong {
	font-family: var(--font-serif);
	font-size: clamp(2rem, 5vw, 4.4rem);
	font-weight: 380;
	letter-spacing: 0.08em;
}

/* Layout-only footprints. Each view owns one; the book is fitted onto it. */
.carte-slot {
	display: block;
	width: 100%;
	aspect-ratio: var(--carte-page-aspect);
	padding: 0;
	border: 0;
	background: transparent;
}

.carte-slot--catalog {
	aspect-ratio: var(--carte-spread-aspect);
}

/*
 * A bookmark reads as tucked under the page edge, which normally means letting
 * the book paint over it. But the turn band reaches out across the bookmarks
 * and, being in the layer above, would take every tap meant for them. So they
 * outrank the layer for hit testing and are clipped at the leaf edge instead of
 * being occluded by it — same picture, opposite priority.
 */
.catalog-book-stage > :global(.desktop-page-tabs) {
	position: absolute;
	top: 24%;
	right: var(--ribbon-tab-offset);
	z-index: 5;
	gap: 0.12rem;
	/* Only the left edge clips; the other three are opened up so neither the
	   drop shadow nor the current bookmark's reach gets cut off. */
	clip-path: inset(
		-1rem calc(-1 * var(--ribbon-tab-reach) - 0.75rem) -1rem
			calc(var(--ribbon-tab-width) + var(--ribbon-tab-offset) - var(--carte-stage-gutter) + var(--carte-leaf-bleed))
	);
	filter: drop-shadow(7px 5px 7px color-mix(in oklab, var(--carte-ink) 14%, transparent));
}

button.carte-slot {
	cursor: pointer;
}

@media (min-width: 64.01rem) {
	.bureau-demo {
		--bureau-canvas-width: min(90rem, calc(100vw - 2rem));
		width: var(--bureau-canvas-width);
		margin-inline: calc((100% - var(--bureau-canvas-width)) / 2);
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
		grid-template-columns: 5.5rem 1fr;
		align-items: center;
	}

	.carte-slot--prepare {
		width: 5.5rem;
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
		width: clamp(12rem, 60vw, 14rem);
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
}

@media (max-width: 22rem) {
	.closed-book-stack :global(.book-edge-tabs .ribbon-label),
	.mobile-edge-tab-shell :global(.menu-edge-tabs .ribbon-label) {
		font-size: 0.56rem;
		letter-spacing: 0.02em;
	}
}

@media (prefers-reduced-motion: reduce) {
	.carte-book-tilt {
		transform: none;
	}
}
</style>
