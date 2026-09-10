<script lang="ts">
import { Portal } from "bits-ui";
import { flushSync, onMount, setContext, tick, untrack } from "svelte";
import { afterNavigate, disableScrollHandling, goto, invalidate, pushState, replaceState } from "$app/navigation";
import { base } from "$app/paths";
import { isQuestMenuPath } from "$lib/client/page-transition";
import { createUnreadSubscription, type UnreadSubscriptionState } from "$lib/client/quest-hall/unread-subscription";
import Typewriter from "$lib/components/Typewriter.svelte";
import WineGlassIcon from "$lib/components/WineGlassIcon.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
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
import type { QuestHallPreparation } from "$lib/quest-hall/preparation";
import type { HallData } from "$lib/server/quest-hall";
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
	lang: LanguageCode;
	form?: { error?: string } | null;
}

let { data, initialLocation, initialPreparation = null, lang, form = null }: Props = $props();
// Loaders randomize this copy; route data refreshes must not restart the typewriter.
const subtitle = untrack(() => data.subtitle);
// Keep the outgoing sheet populated until the reverse timeline releases it.
let displayedPreparation = $state(untrack(() => initialPreparation));
let preparationOrigin = $state<HallLocation | null>(null);
let selectedElement: HTMLElement | undefined;

$effect(() => {
	if (initialPreparation) displayedPreparation = initialPreparation;
});
const translationYears = () => [...new Set(data.translationTasks.map((task) => task.createdMonth.slice(0, 4)))].sort();
setContext("quest-menu-translation-years", translationYears);
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
let bookReady = $state(false);
let bookRevealed = $state(false);
let turning = $state(false);
let turnPreview = $state<QuestMenuTurnPreview | null>(null);
let transitionFrom = $state<QuestMenuView | null>(null);
let transitionTo = $state<QuestMenuView | null>(null);
let localHistoryDepth = 0;
let resizeFrame = 0;
let paperTurnSequence = 0;
let viewTransitionSequence = 0;
let animator: QuestMenuAnimator | null = null;
let updateAmbientMotion = () => {};
let unreadSubscription: ReturnType<typeof createUnreadSubscription> | null = null;

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

let catalog = $derived(adaptHallDataToQuestMenu(data, translationMonth, "year"));
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
// Keep both catalog layouts populated through transitions. CSS switches at the
// breakpoint before a matchMedia listener can mount the newly visible content.
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

async function applyTransition(event: HallNavigationEvent): Promise<void> {
	if (bookReady) finishBookReveal();
	const transition = reduceHallLocation(location, event, catalog);
	if (transition.historyIntent === "none") return;
	if (initialLocation.view === "prepare") {
		await goto(catalogUrl(transition.location));
		return;
	}
	const previousView = visibleView;
	const nextView = transition.location.view;
	const changesView = previousView !== nextView;
	const sequence = changesView ? ++viewTransitionSequence : viewTransitionSequence;
	if (changesView) {
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
			focusView(nextView);
		};
		if (animator) animator.transitionView(previousView, nextView, finish);
		else finish();
		// Resize/reflow may settle the book timeline without invoking its completion.
		// Scroll belongs to navigation, not to that cancellable visual timeline.
		if (transition.historyIntent !== "back") window.scrollTo({ top: 0, behavior: prefersReducedQuestMenuMotion() ? "instant" : "smooth" });
	}

	if (transition.historyIntent === "back" && localHistoryDepth > 0) {
		localHistoryDepth -= 1;
		replaceState(catalogUrl(location), {});
		return;
	}
	const url = catalogUrl(location);
	if (transition.historyIntent === "push") {
		localHistoryDepth += 1;
		pushState(url, {});
	} else {
		replaceState(url, {});
	}
}

function catalogUrl(value: HallLocation): string {
	const url = hallLocationUrl(value, base);
	return value.view === "catalog" && value.section === "translation"
		? `${url}${url.includes("?") ? "&" : "?"}year=${translationMonth.slice(0, 4)}`
		: url;
}

function returnFromPreparation(): void {
	void goto(catalogUrl(preparationOrigin ?? { ...location, view: "catalog", task: null }), { noScroll: true, keepFocus: true });
}

function rememberSelection(_item: QuestMenuItem, event: MouseEvent): void {
	if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
	selectedElement = event.currentTarget as HTMLElement;
}

function sameLocation(left: HallLocation, right: HallLocation): boolean {
	return left.view === right.view && left.section === right.section && left.leaf === right.leaf && left.task === right.task;
}

async function synchronizeServerLocation(nextLocation: HallLocation): Promise<void> {
	if (bookReady) finishBookReveal();
	const previousView = visibleView;
	const nextView = nextLocation.view;
	const source = selectedElement;
	selectedElement = undefined;
	if (nextView === "prepare" && previousView !== "prepare") preparationOrigin = { ...location };
	localHistoryDepth = 0;
	const sequence = ++viewTransitionSequence;
	paperTurnSequence += 1;
	turnPreview = null;
	turning = false;
	transitionFrom = previousView !== nextView ? previousView : null;
	transitionTo = previousView !== nextView ? nextView : null;

	if (nextLocation.section === "translation") {
		const taskId = getQuestMenuItemId(nextLocation.task);
		translationMonth = data.translationTasks.find((task) => task.id === taskId)?.createdMonth ?? data.translationMonth;
	}
	location = { ...nextLocation };

	await tick();
	if (sequence !== viewTransitionSequence) return;
	const finish = () => {
		if (sequence !== viewTransitionSequence) return;
		transitionFrom = null;
		transitionTo = null;
		if (nextView !== "prepare") displayedPreparation = null;
		focusView(nextView);
	};
	if (animator && previousView !== nextView) animator.transitionView(previousView, nextView, finish, source);
	else {
		animator?.settle(nextView);
		finish();
	}
	window.scrollTo({ top: 0, behavior: prefersReducedQuestMenuMotion() ? "instant" : "smooth" });
}

function focusView(view: QuestMenuView): void {
	queueMicrotask(() => {
		const target =
			view === "prepare"
				? preparationPanel
				: view === "home"
					? narrowLayout
						? homeStage?.querySelector<HTMLElement>(".mobile-catalog-link")
						: homeSlot
					: catalogStage?.querySelector<HTMLElement>(narrowLayout ? ".back-button" : ".quiet-button");
		target?.focus({ preventScroll: true });
	});
}

afterNavigate((navigation) => {
	if (mounted && navigation.from && isQuestMenuPath(navigation.from.url.pathname) && navigation.to && isQuestMenuPath(navigation.to.url.pathname)) {
		disableScrollHandling();
	}
	if (!mounted || sameLocation(initialLocation, location)) return;
	void synchronizeServerLocation(initialLocation);
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
				// The animator hides the sheet immediately after this callback.
				flushSync(() => {
					turnPreview = null;
					turning = false;
				});
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
	const year = translationMonth.slice(0, 4);
	const years = translationYears();
	const nextYear = direction < 0 ? years.filter((value) => value < year).at(-1) : years.find((value) => value > year);
	if (!nextYear) return;
	const nextMonth = `${nextYear}-01`;
	const nextCatalog = adaptHallDataToQuestMenu(data, nextMonth, "year");
	translationMonth = nextMonth;
	if (location.section === "translation") {
		location = {
			...location,
			leaf: getQuestMenuSpread(nextCatalog, "translation", location.leaf).leaf,
		};
	}
	replaceState(catalogUrl(location), {});
}

function handleKeydown(event: KeyboardEvent): void {
	if (event.defaultPrevented) return;
	if (visibleView === "prepare" && event.key === "Escape") {
		event.preventDefault();
		returnFromPreparation();
		return;
	}
	if (visibleView !== "catalog") return;
	if (!narrowLayout && (event.key === "ArrowLeft" || event.key === "PageUp")) {
		event.preventDefault();
		turn(-1);
	}
	if (!narrowLayout && (event.key === "ArrowRight" || event.key === "PageDown")) {
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

function finishBookReveal(): void {
	bookRevealed = true;
	updateAmbientMotion();
}

onMount(() => {
	mounted = true;
	unreadSubscription = createUnreadSubscription({
		endpoint: `${base}/api/unread`,
		initialTotal: unreadState.total,
		getHallFacts: () =>
			[...data.dailyTasks, ...data.weeklyTasks].map((task) => ({
				taskId: task.id,
				sessionStatus: task.sessionStatus,
				unreadCount: task.unreadCount ?? 0,
			})),
		onchange: (state) => {
			unreadState = state;
		},
		onHallFactsChange: () => {
			void invalidate(QUEST_HALL_DEPENDENCY);
		},
	});
	animator = createQuestMenuAnimator(motionElements);
	const media = matchMedia(QUEST_MENU_NARROW_MEDIA_QUERY);
	const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
	let homeBookInView = true;
	updateAmbientMotion = () => {
		animator?.setAmbientMotionEnabled(bookRevealed && !document.hidden && !media.matches && !reducedMotion.matches && homeBookInView);
	};
	const bookVisibility = new IntersectionObserver(([entry]) => {
		homeBookInView = entry.isIntersecting;
		updateAmbientMotion();
	});
	if (homeSlot) bookVisibility.observe(homeSlot);
	const updateLayout = () => {
		// A resize completes the one-time reveal; it must never restart it.
		if (bookReady) finishBookReveal();
		// Settling kills the page timeline without invoking its completion callback.
		// Drop its preview and input lock as well, keeping the last committed spread.
		paperTurnSequence += 1;
		turnPreview = null;
		turning = false;
		narrowLayout = media.matches;
		updateAmbientMotion();
		cancelAnimationFrame(resizeFrame);
		resizeFrame = requestAnimationFrame(() => {
			viewTransitionSequence += 1;
			transitionFrom = null;
			transitionTo = null;
			if (visibleView !== "prepare") displayedPreparation = null;
			const fitted = animator?.settle(visibleView);
			// A hidden/zero-size book is not a successful fit. Narrow home/catalog
			// already have a usable 2D surface and do not need a loading handoff.
			if (!bookReady && (fitted || (media.matches && visibleView !== "prepare"))) {
				bookReady = true;
				if (media.matches || reducedMotion.matches) finishBookReveal();
				initialLayoutObserver.disconnect();
			}
		});
	};
	// Retry a deferred first fit if its container becomes measurable, without
	// polling or replaying the initial fade on later resizes.
	const initialLayoutObserver = new ResizeObserver(updateLayout);
	for (const element of [bookFrame, homeSlot, catalogSlot, preparationSlot]) {
		if (element) initialLayoutObserver.observe(element);
	}
	const handlePopstate = async () => {
		// Cross-route history is handled after server data has arrived.
		if (initialLocation.view === "prepare" || window.location.pathname !== `${base}/`) return;
		if (bookReady) finishBookReveal();
		const previousView = visibleView;
		const year = new URL(window.location.href).searchParams.get("year");
		if (year && translationYears().includes(year)) translationMonth = `${year}-01`;
		const nextLocation = parseHallLocation(window.location.href, catalog);
		const nextView = nextLocation.view;

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
				focusView(nextView);
			};
			if (animator) animator.transitionView(previousView, nextView, finish);
			else finish();
		}
	};
	media.addEventListener("change", updateLayout);
	const handleReducedMotion = () => {
		if (bookReady && reducedMotion.matches) finishBookReveal();
		updateAmbientMotion();
	};
	reducedMotion.addEventListener("change", handleReducedMotion);
	document.addEventListener("visibilitychange", updateAmbientMotion);
	window.addEventListener("resize", updateLayout);
	window.addEventListener("popstate", handlePopstate);
	updateLayout();
	return () => {
		cancelAnimationFrame(resizeFrame);
		media.removeEventListener("change", updateLayout);
		reducedMotion.removeEventListener("change", handleReducedMotion);
		document.removeEventListener("visibilitychange", updateAmbientMotion);
		bookVisibility.disconnect();
		initialLayoutObserver.disconnect();
		window.removeEventListener("resize", updateLayout);
		window.removeEventListener("popstate", handlePopstate);
		unreadSubscription?.destroy();
		unreadSubscription = null;
		animator?.destroy();
		animator = null;
		updateAmbientMotion = () => {};
	};
});
</script>

<svelte:window onkeydown={handleKeydown} onpointermove={handleBookPointerMove} onpointerleave={handleBookPointerLeave} />

<div class="quest-menu" data-view={visibleView}>
	<header class="hall-heading">
		<div class="heading-copy">
			<h1>{data.greeting}</h1>
			<p><Typewriter text={subtitle} /></p>
		</div>
		<span class="hall-wine" aria-hidden="true"><WineGlassIcon width={52} height={52} /></span>
		{#if mounted}
			<Portal to="#hall-nav-inbox"> <QuestMenuInbox items={unreadState.items} total={unreadCount} status={unreadState.status} {lang} /> </Portal>
		{/if}
	</header>

	<div class="stage-stack">
		<QuestMenuHome
			visible={homePresent}
			interactive={visibleView === "home" && !viewTransitioning}
			recommendations={catalog.recommendations}
			{ribbons}
			selectedSection={location.section}
			{lang}
			bind:bookSlot={homeSlot}
			bind:stageElement={homeStage}
			bind:recommendationsElement
			onopen={() => openCatalog("daily")}
			onselect={switchSection}
			onselectitem={rememberSelection}
		/>

		<QuestMenuCatalog
			visible={catalogPresent}
			renderSheet={catalogPresent}
			interactive={visibleView === "catalog" && !viewTransitioning}
			sectionLabel={sectionLabel(location.section)}
			folio={currentFolio}
			sections={catalog.sections}
			section={location.section}
			onselect={switchSection}
			{translationMonth}
			{lang}
			bind:catalogSlot
			bind:paperElement={mobilePaper}
			bind:stageElement={catalogStage}
			onclose={closeCatalog}
			onmonthchange={changeTranslationMonth}
			onselectitem={rememberSelection}
		/>

		<QuestMenuPreparation
			visible={preparationPresent}
			interactive={visibleView === "prepare" && !viewTransitioning}
			preparation={displayedPreparation}
			returnView={preparationOrigin?.view === "home" ? "home" : "catalog"}
			{form}
			{lang}
			bind:stageElement={preparationStage}
			bind:bookSlot={preparationSlot}
			bind:dockElement={preparationDock}
			bind:panelElement={preparationPanel}
			onback={returnFromPreparation}
		/>
	</div>

	<QuestMenuBook
		ready={bookReady}
		revealed={bookRevealed}
		onrevealed={finishBookReveal}
		renderPages={catalogPresent}
		interactive={!viewTransitioning}
		{ribbons}
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
		onselectsection={switchSection}
		onselectitem={rememberSelection}
	/>
</div>

<style>
.hall-wine {
	flex: 0 0 auto;
}

.quest-menu {
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
	position: relative;
	min-height: calc(100dvh - 8rem);
	padding: clamp(1rem, 2.5vw, 2rem);
	overflow: clip;
	color: var(--menu-ink);
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
	font-family: var(--font-serif);
}

.heading-copy h1 {
	margin: 0;
	font-size: clamp(2rem, 4vw, 3.65rem);
	font-weight: 500;
	letter-spacing: 0.006em;
	line-height: 1.02;
	white-space: nowrap;
}

.heading-copy > p {
	margin: 0.65rem 0 0;
	font-size: 1rem;
	font-style: italic;
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

@media (width < 56.25rem) {
	.quest-menu {
		max-width: 42rem;
		margin-inline: auto;
		padding: 0;
	}
	.heading-copy h1 {
		font-size: clamp(1.75rem, 4vw, 2.25rem);
	}
}
</style>
