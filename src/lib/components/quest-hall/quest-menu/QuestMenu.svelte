<script lang="ts">
import { onMount, tick, untrack } from "svelte";
import { afterNavigate, invalidate, pushState, replaceState } from "$app/navigation";
import { base } from "$app/paths";
import { createQuestHallPreparationResource, type QuestHallPreparationResourceState } from "$lib/client/quest-hall/preparation-resource";
import { restoreQuestHallReturnContext, saveQuestHallReturnContext } from "$lib/client/quest-hall/return-context";
import { createUnreadSubscription, type UnreadSubscriptionState } from "$lib/client/quest-hall/unread-subscription";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { shiftCalendarMonth } from "$lib/month";
import {
	adaptHallDataToQuestMenu,
	getQuestMenuFolio,
	getQuestMenuItemId,
	getQuestMenuNarrowTarget,
	getQuestMenuSpread,
	getQuestMenuTurnTarget,
	getQuestMenuUnreadCount,
	QUEST_MENU_SECTIONS,
	type QuestMenuItem,
	type QuestMenuItemKey,
	type QuestMenuSection,
} from "$lib/quest-hall/menu";
import {
	type HallLocation,
	type HallNavigationEvent,
	hallLocationUrl,
	parseHallLocation,
	QUEST_HALL_DEPENDENCY,
	reduceHallLocation,
} from "$lib/quest-hall/navigation";
import type { HallData } from "$lib/server/quest-hall";
import type { QuestHallPreparation } from "$lib/server/quest-hall-preparation";
import {
	createQuestMenuAnimator,
	prefersReducedQuestMenuMotion,
	QUEST_MENU_NARROW_MEDIA_QUERY,
	type QuestMenuAnimator,
	type QuestMenuMotionElements,
	type QuestMenuView,
} from "./motion";
import QuestMenuBook, { type QuestMenuTurnPreview } from "./QuestMenuBook.svelte";
import QuestMenuCatalog from "./QuestMenuCatalog.svelte";
import QuestMenuHome from "./QuestMenuHome.svelte";
import QuestMenuInbox from "./QuestMenuInbox.svelte";
import QuestMenuPreparation from "./QuestMenuPreparation.svelte";
import type { QuestMenuRibbon } from "./QuestMenuRibbonTabs.svelte";

interface Props {
	data: HallData;
	initialLocation: HallLocation;
	initialPreparation?: QuestHallPreparation | null;
	accountScope: string;
	lang: LanguageCode;
}

let { data, initialLocation, initialPreparation = null, accountScope, lang }: Props = $props();
function getInitialTranslationMonth(): string {
	const taskId = initialLocation.section === "translation" ? getQuestMenuItemId(initialLocation.task) : null;
	return data.translationTasks.find((task) => task.id === taskId)?.createdMonth ?? data.translationMonth;
}
// svelte-ignore state_referenced_locally
let location = $state<HallLocation>({ ...initialLocation });
// svelte-ignore state_referenced_locally
let translationMonth = $state(untrack(getInitialTranslationMonth));
let narrowItemKey = $state<QuestMenuItemKey | null>(null);
let narrowLayout = $state(false);
let mounted = $state(false);
let turning = $state(false);
let turnPreview = $state<QuestMenuTurnPreview | null>(null);
let transitionFrom = $state<QuestMenuView | null>(null);
let transitionTo = $state<QuestMenuView | null>(null);
let preparationOriginView = $state<"home" | "catalog">("catalog");
// svelte-ignore state_referenced_locally
let preparationState = $state<QuestHallPreparationResourceState>(
	initialLocation.view === "prepare" && initialPreparation
		? { status: "ready", key: initialPreparation.key, preparation: initialPreparation, error: null }
		: initialLocation.view === "prepare" && initialLocation.task
			? { status: "error", key: initialLocation.task, preparation: null, error: "Preparation is unavailable" }
			: { status: "idle", key: null, preparation: null, error: null },
);
let localHistoryDepth = 0;
let resizeFrame = 0;
let paperTurnSequence = 0;
let viewTransitionSequence = 0;
let animator: QuestMenuAnimator | null = null;
let preparationResource: ReturnType<typeof createQuestHallPreparationResource> | null = null;
let unreadSubscription: ReturnType<typeof createUnreadSubscription> | null = null;
let editionRefresh: Promise<void> | null = null;
let observedEditionDate = untrack(() => data.editionDate);

let homeStage = $state<HTMLElement | null>(null);
let catalogStage = $state<HTMLElement | null>(null);
let preparationStage = $state<HTMLElement | null>(null);
let recommendationsElement = $state<HTMLDivElement | null>(null);
let homeSlot = $state<HTMLButtonElement | null>(null);
let catalogSlot = $state<HTMLDivElement | null>(null);
let preparationSlot = $state<HTMLSpanElement | null>(null);
let preparationDock = $state<HTMLButtonElement | null>(null);
let preparationPanel = $state<HTMLDivElement | null>(null);
let mobilePaper = $state<HTMLDivElement | null>(null);
let bookFrame = $state<HTMLDivElement | null>(null);
let bookTilt = $state<HTMLDivElement | null>(null);
let rectoProbe = $state<HTMLSpanElement | null>(null);
let bookShadow = $state<HTMLSpanElement | null>(null);
let leftHalf = $state<HTMLDivElement | null>(null);
let cover = $state<HTMLDivElement | null>(null);
let turnControls = $state<HTMLDivElement | null>(null);
let turnSheet = $state<HTMLDivElement | null>(null);

let catalog = $derived(adaptHallDataToQuestMenu(data, translationMonth));
let currentSpread = $derived(getQuestMenuSpread(catalog, location.section, location.leaf));
let currentFolio = $derived(getQuestMenuFolio(catalog, location.section, currentSpread.leaf));
let previousTarget = $derived(getQuestMenuTurnTarget(catalog, location.section, currentSpread.leaf, -1));
let nextTarget = $derived(getQuestMenuTurnTarget(catalog, location.section, currentSpread.leaf, 1));
let currentNarrowItem = $derived(currentSpread.items.find((item) => item.key === narrowItemKey) ?? currentSpread.items[0] ?? null);
let narrowPreviousTarget = $derived(getQuestMenuNarrowTarget(catalog, location.section, currentSpread.leaf, currentNarrowItem?.key ?? null, -1));
let narrowNextTarget = $derived(getQuestMenuNarrowTarget(catalog, location.section, currentSpread.leaf, currentNarrowItem?.key ?? null, 1));
// The server-rendered current-edition total prevents a blank badge before the
// all-edition subscription supplies the authoritative inbox total.
// svelte-ignore state_referenced_locally
let unreadState = $state<UnreadSubscriptionState>({ items: [], total: getQuestMenuUnreadCount(catalog), status: "loading" });
let unreadCount = $derived(unreadState.total);
let visibleView: QuestMenuView = $derived(location.view);
let viewTransitioning = $derived(transitionTo !== null);
let homePresent = $derived(visibleView === "home" || transitionFrom === "home" || transitionTo === "home");
let catalogPresent = $derived(visibleView === "catalog" || transitionFrom === "catalog" || transitionTo === "catalog");
let preparationPresent = $derived(visibleView === "prepare" || transitionFrom === "prepare" || transitionTo === "prepare");
let ribbons = $derived(
	QUEST_MENU_SECTIONS.map(
		(section): QuestMenuRibbon => ({
			id: section,
			label: sectionLabel(section),
			shortLabel: t(lang, `hall.menu.ribbon.${section}`),
			count: catalog.sections[section].length,
		}),
	),
);

$effect(() => {
	const keys = currentSpread.items.map((item) => item.key);
	if (!narrowItemKey || !keys.includes(narrowItemKey)) narrowItemKey = currentSpread.items[0]?.key ?? null;
});

function sectionLabel(section: QuestMenuSection): string {
	if (section === "daily") return t(lang, "hall.today");
	if (section === "weekly") return t(lang, "hall.thisWeek");
	return t(lang, "translate.title");
}

function motionElements(): QuestMenuMotionElements {
	return {
		homeStage,
		catalogStage,
		preparationStage,
		recommendationsElement,
		homeSlot,
		catalogSlot,
		preparationSlot,
		preparationDock,
		preparationPanel,
		mobilePaper,
		bookFrame,
		bookTilt,
		rectoProbe,
		bookShadow,
		leftHalf,
		cover,
		turnControls,
		turnSheet,
	};
}

async function applyTransition(event: HallNavigationEvent, selectedElement?: HTMLElement, transitionCatalog = catalog): Promise<void> {
	const transition = reduceHallLocation(location, event, transitionCatalog);
	if (transition.historyIntent === "none") return;
	const previousView = visibleView;
	const nextView = transition.location.view;
	const changesView = previousView !== nextView;
	const sequence = changesView ? ++viewTransitionSequence : viewTransitionSequence;
	if (changesView) {
		if (previousView === "prepare" && nextView !== "prepare") preparationResource?.cancel();
		paperTurnSequence += 1;
		turnPreview = null;
		turning = false;
		transitionFrom = previousView;
		transitionTo = nextView;
	}
	location = { ...transition.location };
	await tick();
	if (changesView) {
		const finish = () => {
			if (sequence !== viewTransitionSequence) return;
			transitionFrom = null;
			transitionTo = null;
			if (previousView === "prepare" && nextView !== "prepare") preparationResource?.cancel(true);
			focusView(nextView);
		};
		if (animator) animator.transitionView(previousView, nextView, finish, selectedElement);
		else finish();
	}

	if (transition.historyIntent === "back" && localHistoryDepth > 0) {
		localHistoryDepth -= 1;
		history.back();
		return;
	}
	const url = hallLocationUrl(location, base);
	if (transition.historyIntent === "push") {
		localHistoryDepth += 1;
		pushState(url, {});
	} else {
		replaceState(url, {});
	}
}

function isPlainPrimaryActivation(event: MouseEvent): boolean {
	const anchor = event.currentTarget as HTMLAnchorElement;
	return (
		!event.defaultPrevented &&
		event.button === 0 &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey &&
		!event.altKey &&
		(!anchor.target || anchor.target === "_self") &&
		!anchor.hasAttribute("download")
	);
}

function selectItem(item: QuestMenuItem, event: MouseEvent): void {
	if (!isPlainPrimaryActivation(event) || viewTransitioning) return;
	event.preventDefault();
	let transitionCatalog = catalog;
	if (item.kind === "translation" && item.task.createdMonth !== translationMonth) {
		translationMonth = item.task.createdMonth;
		transitionCatalog = adaptHallDataToQuestMenu(data, translationMonth);
	}
	preparationOriginView = visibleView === "home" ? "home" : "catalog";
	void preparationResource?.load(item.key, data.editionDate);
	void applyTransition({ type: "select-item", task: item.key }, event.currentTarget as HTMLElement, transitionCatalog);
}

function returnFromPreparation(): void {
	void applyTransition({ type: "return-from-prepare", destination: preparationOriginView });
}

function retryPreparation(): void {
	if (location.task) void preparationResource?.load(location.task, data.editionDate);
}

function sameLocation(left: HallLocation, right: HallLocation): boolean {
	return left.view === right.view && left.section === right.section && left.leaf === right.leaf && left.task === right.task;
}

async function synchronizeServerLocation(nextLocation: HallLocation, nextPreparation: QuestHallPreparation | null): Promise<void> {
	const previousView = visibleView;
	localHistoryDepth = 0;
	viewTransitionSequence += 1;
	paperTurnSequence += 1;
	turnPreview = null;
	turning = false;
	transitionFrom = null;
	transitionTo = null;

	if (nextLocation.section === "translation") {
		const taskId = getQuestMenuItemId(nextLocation.task);
		translationMonth = data.translationTasks.find((task) => task.id === taskId)?.createdMonth ?? data.translationMonth;
	}
	location = { ...nextLocation };

	if (nextLocation.view === "prepare" && nextLocation.task) {
		if (previousView !== "prepare") preparationOriginView = previousView === "home" ? "home" : "catalog";
		if (nextPreparation?.key === nextLocation.task) {
			preparationResource?.cancel();
			preparationState = { status: "ready", key: nextLocation.task, preparation: nextPreparation, error: null };
		} else {
			void preparationResource?.load(nextLocation.task, data.editionDate);
		}
	} else {
		preparationResource?.cancel(true);
	}

	await tick();
	animator?.settle(nextLocation.view);
	focusView(nextLocation.view);
}

function refreshExpiredEdition(): void {
	if (editionRefresh) return;
	editionRefresh = invalidate(QUEST_HALL_DEPENDENCY)
		.catch(() => undefined)
		.finally(() => {
			editionRefresh = null;
		});
}

function saveWorkflowReturnContext(): void {
	if (!location.task) return;
	const sectionKeys = new Set(catalog.sections[location.section].map((item) => item.key));
	saveQuestHallReturnContext({
		accountScope,
		activeLanguage: data.activeLanguage,
		edition: data.editionDate,
		origin: preparationOriginView,
		section: location.section,
		spread: location.leaf,
		narrowItemKey: narrowItemKey && sectionKeys.has(narrowItemKey) ? narrowItemKey : null,
		selectedKey: location.task,
		translationMonth,
		scrollOffset: window.scrollY,
		focusTarget: "preparation",
	});
}

function focusView(view: QuestMenuView): void {
	queueMicrotask(() => {
		const target = view === "prepare" ? preparationPanel : view === "home" ? homeSlot : catalogStage?.querySelector<HTMLElement>(".quiet-button");
		target?.focus({ preventScroll: true });
	});
}

afterNavigate(() => {
	if (!mounted || sameLocation(initialLocation, location)) return;
	void synchronizeServerLocation(initialLocation, initialPreparation);
});

$effect(() => {
	const nextEditionDate = data.editionDate;
	if (!mounted || nextEditionDate === observedEditionDate) return;
	observedEditionDate = nextEditionDate;
	void synchronizeServerLocation(initialLocation, initialPreparation);
});

function openCatalog(section: QuestMenuSection = location.section): void {
	void applyTransition({ type: "open-catalog", section });
}

function closeCatalog(): void {
	void applyTransition({ type: "close-catalog" });
}

function moveTo(target: { section: QuestMenuSection; leaf: number }, direction: -1 | 1, targetItemKey?: QuestMenuItemKey | null): void {
	if (turning) return;
	const event: HallNavigationEvent = { type: "turn-leaf", section: target.section, leaf: target.leaf };
	if (!mounted || !animator || prefersReducedQuestMenuMotion()) {
		if (targetItemKey !== undefined) narrowItemKey = targetItemKey;
		void applyTransition(event);
		return;
	}

	turning = true;
	const preview: QuestMenuTurnPreview = {
		direction,
		fromSection: location.section,
		toSection: target.section,
		fromSpread: currentSpread,
		toSpread: getQuestMenuSpread(catalog, target.section, target.leaf),
		fromFolio: currentFolio.current,
		toFolio: getQuestMenuFolio(catalog, target.section, target.leaf).current,
	};
	const sequence = ++paperTurnSequence;
	turnPreview = preview;
	void tick().then(() => {
		if (sequence !== paperTurnSequence) return;
		if (!animator) {
			turnPreview = null;
			turning = false;
			void applyTransition(event);
			return;
		}
		animator.transitionPage(
			narrowLayout,
			direction,
			() => {
				if (sequence !== paperTurnSequence) return;
				if (targetItemKey !== undefined) narrowItemKey = targetItemKey;
				void applyTransition(event);
			},
			() => {
				if (sequence !== paperTurnSequence) return;
				turnPreview = null;
				turning = false;
			},
		);
	});
}

function turn(direction: -1 | 1): void {
	if (narrowLayout) {
		const target = direction < 0 ? narrowPreviousTarget : narrowNextTarget;
		if (!target) return;
		moveTo(target, direction, target.itemKey);
		return;
	}
	const target = direction < 0 ? previousTarget : nextTarget;
	if (target) moveTo(target, direction);
}

function switchSection(section: QuestMenuSection): void {
	if (visibleView === "home") {
		openCatalog(section);
		return;
	}
	if (section === location.section) return;
	const direction = QUEST_MENU_SECTIONS.indexOf(section) > QUEST_MENU_SECTIONS.indexOf(location.section) ? 1 : -1;
	const targetItemKey = catalog.spreads[section][0].items[0]?.key ?? null;
	if (!narrowLayout) narrowItemKey = targetItemKey;
	moveTo({ section, leaf: 1 }, direction, narrowLayout ? targetItemKey : undefined);
}

function changeTranslationMonth(direction: -1 | 1): void {
	if (turning || viewTransitioning) return;
	const nextMonth = shiftCalendarMonth(translationMonth, direction);
	const nextCatalog = adaptHallDataToQuestMenu(data, nextMonth);
	translationMonth = nextMonth;
	if (location.section === "translation") {
		location = {
			...location,
			leaf: getQuestMenuSpread(nextCatalog, "translation", location.leaf).leaf,
		};
	}
}

function moveNarrow(direction: -1 | 1): void {
	const target = direction < 0 ? narrowPreviousTarget : narrowNextTarget;
	if (!target) return;
	moveTo(target, direction, target.itemKey);
}

function handleKeydown(event: KeyboardEvent): void {
	if (event.defaultPrevented) return;
	if (visibleView === "prepare" && event.key === "Escape") {
		event.preventDefault();
		returnFromPreparation();
		return;
	}
	if (visibleView !== "catalog") return;
	if (event.key === "ArrowLeft" || event.key === "PageUp") {
		event.preventDefault();
		turn(-1);
	}
	if (event.key === "ArrowRight" || event.key === "PageDown") {
		event.preventDefault();
		turn(1);
	}
	if (event.key === "Escape") {
		event.preventDefault();
		closeCatalog();
	}
}

function handleBookPointerMove(event: PointerEvent): void {
	if (event.pointerType !== "mouse" || turning || viewTransitioning) {
		animator?.clearPointerInteraction(visibleView);
		return;
	}
	animator?.interactWithPointer(visibleView, event.clientX, event.clientY);
}

function handleBookPointerLeave(): void {
	animator?.clearPointerInteraction(visibleView);
}

onMount(() => {
	mounted = true;
	const returnContext = restoreQuestHallReturnContext({
		accountScope,
		activeLanguage: data.activeLanguage,
		edition: data.editionDate,
		translationMonths: new Set([data.translationMonth, ...data.translationTasks.map((task) => task.createdMonth)]),
		itemKeys: new Set([
			...QUEST_MENU_SECTIONS.flatMap((section) => catalog.sections[section].map((item) => item.key)),
			...data.translationTasks.map((task) => `translation-${task.id}`),
		]),
		translationItemMonths: new Map(data.translationTasks.map((task) => [`translation-${task.id}`, task.createdMonth])),
		spreadCounts: Object.fromEntries(QUEST_MENU_SECTIONS.map((section) => [section, catalog.spreads[section].length])) as Record<
			QuestMenuSection,
			number
		>,
	});
	const restoringWorkflow = returnContext !== null && initialLocation.view === "prepare" && initialLocation.task === returnContext.selectedKey;
	if (restoringWorkflow) {
		preparationOriginView = returnContext.origin === "home" ? "home" : "catalog";
		translationMonth = returnContext.translationMonth;
		narrowItemKey = returnContext.narrowItemKey;
	}
	preparationResource = createQuestHallPreparationResource({
		endpoint: `${base}/api/quest-hall/preparation`,
		onchange: (state) => {
			preparationState = state;
			if (state.status === "error") void tick().then(() => preparationPanel?.focus());
		},
		onEditionExpired: refreshExpiredEdition,
	});
	unreadSubscription = createUnreadSubscription({
		endpoint: `${base}/api/unread`,
		initialTotal: unreadState.total,
		onchange: (state) => {
			unreadState = state;
		},
		onHallFactsChange: () => {
			void invalidate(QUEST_HALL_DEPENDENCY);
		},
	});
	if (initialLocation.view === "prepare" && initialLocation.task && !initialPreparation) {
		void preparationResource.load(initialLocation.task, data.editionDate);
	}
	animator = createQuestMenuAnimator(motionElements);
	const media = matchMedia(QUEST_MENU_NARROW_MEDIA_QUERY);
	const updateLayout = () => {
		// Settling kills the page timeline without invoking its completion callback.
		// Drop its preview and input lock as well, keeping the last committed spread.
		paperTurnSequence += 1;
		turnPreview = null;
		turning = false;
		narrowLayout = media.matches;
		cancelAnimationFrame(resizeFrame);
		resizeFrame = requestAnimationFrame(() => {
			viewTransitionSequence += 1;
			transitionFrom = null;
			transitionTo = null;
			animator?.settle(visibleView);
		});
	};
	const handlePopstate = async () => {
		const previousView = visibleView;
		const nextLocation = parseHallLocation(window.location.href, catalog);
		const nextView = nextLocation.view;
		if (nextView === "prepare" && nextLocation.task) {
			preparationOriginView = previousView === "home" ? "home" : "catalog";
			if (preparationState.status !== "ready" || preparationState.key !== nextLocation.task) {
				void preparationResource?.load(nextLocation.task, data.editionDate);
			}
		} else if (previousView === "prepare") {
			preparationResource?.cancel();
		}
		const changesView = previousView !== nextView;
		const sequence = changesView ? ++viewTransitionSequence : viewTransitionSequence;
		if (changesView) {
			paperTurnSequence += 1;
			turnPreview = null;
			turning = false;
			transitionFrom = previousView;
			transitionTo = nextView;
		}
		location = nextLocation;
		await tick();
		if (changesView) {
			const finish = () => {
				if (sequence !== viewTransitionSequence) return;
				transitionFrom = null;
				transitionTo = null;
				if (previousView === "prepare" && nextView !== "prepare") preparationResource?.cancel(true);
				focusView(nextView);
			};
			if (animator) animator.transitionView(previousView, nextView, finish);
			else finish();
		}
	};
	media.addEventListener("change", updateLayout);
	window.addEventListener("resize", updateLayout);
	window.addEventListener("popstate", handlePopstate);
	updateLayout();
	void tick().then(() => {
		animator?.settle(visibleView);
		if (!restoringWorkflow || !returnContext) return;
		requestAnimationFrame(() => {
			window.scrollTo({ top: returnContext.scrollOffset, behavior: "auto" });
			if (returnContext.focusTarget === "preparation") preparationPanel?.focus({ preventScroll: true });
		});
	});
	return () => {
		cancelAnimationFrame(resizeFrame);
		media.removeEventListener("change", updateLayout);
		window.removeEventListener("resize", updateLayout);
		window.removeEventListener("popstate", handlePopstate);
		preparationResource?.cancel();
		preparationResource = null;
		unreadSubscription?.destroy();
		unreadSubscription = null;
		animator?.destroy();
		animator = null;
	};
});
</script>

<svelte:window onkeydown={handleKeydown} onpointermove={handleBookPointerMove} onpointerleave={handleBookPointerLeave} />

<div class="quest-menu" data-view={visibleView}>
	<header class="hall-heading">
		<div class="heading-copy">
			<h1>{data.greeting}</h1>
			<p>{data.subtitle}</p>
		</div>
		<QuestMenuInbox items={unreadState.items} total={unreadCount} status={unreadState.status} {lang} />
	</header>

	<div class="stage-stack">
		<QuestMenuHome
			visible={homePresent}
			interactive={visibleView === "home" && !viewTransitioning}
			recommendations={catalog.recommendations}
			{ribbons}
			selectedSection={location.section}
			{unreadCount}
			{lang}
			bind:bookSlot={homeSlot}
			bind:stageElement={homeStage}
			bind:recommendationsElement
			onopen={() => openCatalog()}
			onselect={switchSection}
			onselectitem={selectItem}
		/>

		<QuestMenuCatalog
			visible={catalogPresent}
			interactive={visibleView === "catalog" && !viewTransitioning}
			section={location.section}
			sectionLabel={sectionLabel(location.section)}
			folio={currentFolio}
			item={currentNarrowItem}
			itemCount={catalog.sections[location.section].length}
			{translationMonth}
			{ribbons}
			canMovePrevious={narrowPreviousTarget !== null}
			canMoveNext={narrowNextTarget !== null}
			{lang}
			bind:catalogSlot
			bind:paperElement={mobilePaper}
			bind:stageElement={catalogStage}
			onclose={closeCatalog}
			onselect={switchSection}
			onmove={moveNarrow}
			onmonthchange={changeTranslationMonth}
			onselectitem={selectItem}
		/>

		<QuestMenuPreparation
			visible={preparationPresent}
			interactive={visibleView === "prepare" && !viewTransitioning}
			resource={preparationState}
			returnView={preparationOriginView}
			{lang}
			bind:stageElement={preparationStage}
			bind:bookSlot={preparationSlot}
			bind:dockElement={preparationDock}
			bind:panelElement={preparationPanel}
			onback={returnFromPreparation}
			onretry={retryPreparation}
			onworkflowentry={saveWorkflowReturnContext}
		/>
	</div>

	<QuestMenuBook
		view={visibleView}
		section={location.section}
		spread={currentSpread}
		{turnPreview}
		folio={currentFolio.current}
		{unreadCount}
		canTurnPrevious={previousTarget !== null}
		canTurnNext={nextTarget !== null}
		{turning}
		{lang}
		{translationMonth}
		bind:bookFrame
		bind:bookTilt
		bind:rectoProbe
		bind:bookShadow
		bind:leftHalf
		bind:cover
		bind:turnControls
		bind:turnSheet
		onturn={turn}
		onmonthchange={changeTranslationMonth}
		onselectitem={selectItem}
	/>
</div>

<style>
.quest-menu {
	--menu-canvas: #f1ece2;
	--menu-paper: #f7f1e6;
	--menu-sheet: #fffaf1;
	--menu-cover: #6f303a;
	--menu-ink: #2d2924;
	--menu-ink-muted: #6d665d;
	--menu-wine: #803945;
	--menu-olive: #65705a;
	--menu-blue: #526878;
	--menu-green: #416c55;
	--menu-brass: #b39150;
	--menu-brass-dark: #765d28;
	--menu-focus: #305f89;
	--menu-ribbon-text: #fffaf1;
	--menu-spread-aspect: 1.48;
	--menu-page-aspect: 0.74;
	--menu-ribbon-reach: 0.62rem;
	--font-serif: "Newsreader", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
	position: relative;
	min-height: calc(100dvh - 8rem);
	padding: clamp(1rem, 2.5vw, 2rem);
	overflow: clip;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 12%, transparent);
	border-radius: 0.8rem;
	background: var(--menu-canvas);
	color: var(--menu-ink);
	font-family: var(--font-serif);
	font-optical-sizing: auto;
	font-weight: 380;
	font-kerning: normal;
	font-synthesis: none;
}

.quest-menu::before {
	position: absolute;
	inset: 0;
	background-image:
		linear-gradient(90deg, transparent 0 49.9%, color-mix(in oklab, var(--menu-ink) 3%, transparent) 50%, transparent 50.1%),
		repeating-linear-gradient(0deg, transparent 0 34px, color-mix(in oklab, var(--menu-ink) 2%, transparent) 34px 35px);
	content: "";
	pointer-events: none;
}

.hall-heading,
.stage-stack {
	position: relative;
}

.hall-heading {
	z-index: 2;
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: clamp(1rem, 3vw, 2.5rem);
	max-width: 74rem;
	margin: 0 auto clamp(1.25rem, 3vw, 2.25rem);
}

.heading-copy {
	min-width: 0;
}

.heading-copy h1 {
	margin: 0;
	font-family: var(--font-serif);
	font-size: clamp(2rem, 4vw, 3.65rem);
	font-weight: 350;
	letter-spacing: 0.006em;
	line-height: 1.02;
	white-space: nowrap;
}

.heading-copy > p {
	margin: 0.65rem 0 0;
	font-size: 1rem;
	line-height: 1.55;
	color: var(--menu-ink-muted);
}

.stage-stack {
	z-index: 1;
	display: grid;
	min-height: clamp(39rem, 68vw, 54rem);
}

@media (min-width: 64.01rem) {
	.quest-menu {
		width: min(90rem, calc(100vw - 2rem));
		margin-inline: calc((100% - min(90rem, calc(100vw - 2rem))) / 2);
	}
}

@media (max-width: 64rem) {
	.heading-copy h1 {
		white-space: normal;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.stage-stack {
		min-height: 0;
	}
}

@media (max-width: 56.24rem) {
	.quest-menu {
		padding: 1rem;
	}
}

@media (max-width: 30rem) {
	.quest-menu {
		padding-inline: 0.75rem;
	}
}
</style>
