<script lang="ts">
import { onMount, tick } from "svelte";
import { pushState, replaceState } from "$app/navigation";
import { base } from "$app/paths";
import { type LanguageCode, t } from "$lib/i18n";
import {
	adaptHallDataToQuestMenu,
	getQuestMenuFolio,
	getQuestMenuNarrowTarget,
	getQuestMenuSpread,
	getQuestMenuTurnTarget,
	getQuestMenuUnreadCount,
	QUEST_MENU_SECTIONS,
	type QuestMenuItemKey,
	type QuestMenuSection,
} from "$lib/quest-hall/menu";
import { type HallLocation, type HallNavigationEvent, hallLocationUrl, parseHallLocation, reduceHallLocation } from "$lib/quest-hall/navigation";
import type { HallData } from "$lib/server/quest-hall";
import { createQuestMenuAnimator, prefersReducedQuestMenuMotion, type QuestMenuAnimator, type QuestMenuMotionElements } from "./motion";
import QuestMenuBook, { type QuestMenuTurnPreview } from "./QuestMenuBook.svelte";
import QuestMenuCatalog from "./QuestMenuCatalog.svelte";
import QuestMenuHome from "./QuestMenuHome.svelte";
import type { QuestMenuRibbon } from "./QuestMenuRibbonTabs.svelte";

interface Props {
	data: HallData;
	initialLocation: HallLocation;
	lang: LanguageCode;
}

let { data, initialLocation, lang }: Props = $props();
// svelte-ignore state_referenced_locally
let location = $state<HallLocation>({ ...initialLocation });
let narrowItemKey = $state<QuestMenuItemKey | null>(null);
let narrowLayout = $state(false);
let mounted = $state(false);
let turning = $state(false);
let turnPreview = $state<QuestMenuTurnPreview | null>(null);
let transitionFrom = $state<"home" | "catalog" | null>(null);
let transitionTo = $state<"home" | "catalog" | null>(null);
let localHistoryDepth = 0;
let resizeFrame = 0;
let paperTurnSequence = 0;
let viewTransitionSequence = 0;
let animator: QuestMenuAnimator | null = null;

let homeStage = $state<HTMLElement | null>(null);
let catalogStage = $state<HTMLElement | null>(null);
let recommendationsElement = $state<HTMLDivElement | null>(null);
let homeSlot = $state<HTMLButtonElement | null>(null);
let catalogSlot = $state<HTMLDivElement | null>(null);
let mobilePaper = $state<HTMLDivElement | null>(null);
let bookFrame = $state<HTMLDivElement | null>(null);
let bookTilt = $state<HTMLDivElement | null>(null);
let rectoProbe = $state<HTMLSpanElement | null>(null);
let bookShadow = $state<HTMLSpanElement | null>(null);
let leftHalf = $state<HTMLDivElement | null>(null);
let cover = $state<HTMLDivElement | null>(null);
let turnControls = $state<HTMLDivElement | null>(null);
let turnSheet = $state<HTMLDivElement | null>(null);

let catalog = $derived(adaptHallDataToQuestMenu(data));
let currentSpread = $derived(getQuestMenuSpread(catalog, location.section, location.leaf));
let currentFolio = $derived(getQuestMenuFolio(catalog, location.section, currentSpread.leaf));
let previousTarget = $derived(getQuestMenuTurnTarget(catalog, location.section, currentSpread.leaf, -1));
let nextTarget = $derived(getQuestMenuTurnTarget(catalog, location.section, currentSpread.leaf, 1));
let currentNarrowItem = $derived(currentSpread.items.find((item) => item.key === narrowItemKey) ?? currentSpread.items[0] ?? null);
let narrowPreviousTarget = $derived(getQuestMenuNarrowTarget(catalog, location.section, currentSpread.leaf, currentNarrowItem?.key ?? null, -1));
let narrowNextTarget = $derived(getQuestMenuNarrowTarget(catalog, location.section, currentSpread.leaf, currentNarrowItem?.key ?? null, 1));
let unreadCount = $derived(getQuestMenuUnreadCount(catalog));
let visibleView: "home" | "catalog" = $derived(location.view === "home" ? "home" : "catalog");
let viewTransitioning = $derived(transitionTo !== null);
let homePresent = $derived(visibleView === "home" || transitionFrom === "home" || transitionTo === "home");
let catalogPresent = $derived(visibleView === "catalog" || transitionFrom === "catalog" || transitionTo === "catalog");
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
		recommendationsElement,
		homeSlot,
		catalogSlot,
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
	const transition = reduceHallLocation(location, event, catalog);
	if (transition.historyIntent === "none") return;
	const previousView = visibleView;
	const nextView = transition.location.view === "home" ? "home" : "catalog";
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
		};
		if (animator) animator.transitionView(nextView, finish);
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
				if (targetItemKey !== undefined) narrowItemKey = targetItemKey;
				void applyTransition(event);
			},
			() => {
				if (sequence === paperTurnSequence) turnPreview = null;
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

function moveNarrow(direction: -1 | 1): void {
	const target = direction < 0 ? narrowPreviousTarget : narrowNextTarget;
	if (!target) return;
	moveTo(target, direction, target.itemKey);
}

function handleKeydown(event: KeyboardEvent): void {
	if (visibleView !== "catalog" || event.defaultPrevented) return;
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

onMount(() => {
	mounted = true;
	animator = createQuestMenuAnimator(motionElements);
	const media = matchMedia("(max-width: 64rem)");
	const updateLayout = () => {
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
		const nextView = nextLocation.view === "home" ? "home" : "catalog";
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
			};
			if (animator) animator.transitionView(nextView, finish);
			else finish();
		}
	};
	media.addEventListener("change", updateLayout);
	window.addEventListener("resize", updateLayout);
	window.addEventListener("popstate", handlePopstate);
	updateLayout();
	void tick().then(() => animator?.settle(visibleView));
	return () => {
		cancelAnimationFrame(resizeFrame);
		media.removeEventListener("change", updateLayout);
		window.removeEventListener("resize", updateLayout);
		window.removeEventListener("popstate", handlePopstate);
		animator?.destroy();
		animator = null;
	};
});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
	<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&display=swap" rel="stylesheet">
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="quest-menu" data-view={visibleView}>
	<header class="hall-heading">
		<h1>{data.greeting}</h1>
		<p>{data.subtitle}</p>
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
		/>

		<QuestMenuCatalog
			visible={catalogPresent}
			interactive={visibleView === "catalog" && !viewTransitioning}
			section={location.section}
			sectionLabel={sectionLabel(location.section)}
			folio={currentFolio}
			item={currentNarrowItem}
			itemCount={catalog.sections[location.section].length}
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
		bind:bookFrame
		bind:bookTilt
		bind:rectoProbe
		bind:bookShadow
		bind:leftHalf
		bind:cover
		bind:turnControls
		bind:turnSheet
		onturn={turn}
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
	z-index: 1;
}

.hall-heading {
	max-width: 74rem;
	margin: 0 auto clamp(1.25rem, 3vw, 2.25rem);
}

.hall-heading h1 {
	margin: 0;
	font-family: var(--font-serif);
	font-size: clamp(2rem, 4vw, 3.65rem);
	font-weight: 350;
	letter-spacing: 0.006em;
	line-height: 1.02;
	white-space: nowrap;
}

.hall-heading > p {
	margin: 0.65rem 0 0;
	font-size: 1rem;
	line-height: 1.55;
	color: var(--menu-ink-muted);
}

.stage-stack {
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
	.hall-heading h1 {
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
