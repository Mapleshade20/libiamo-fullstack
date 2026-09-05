<script lang="ts">
import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
import BookOpen from "@lucide/svelte/icons/book-open";
import FileText from "@lucide/svelte/icons/file-text";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import { base } from "$app/paths";
import type { QuestHallPreparationResourceState } from "$lib/client/quest-hall/preparation-resource";
import TaskPreparation from "$lib/components/task/TaskPreparation.svelte";
import TranslationPreparation from "$lib/components/translate/TranslationPreparation.svelte";
import { type LanguageCode, t } from "$lib/i18n";

interface Props {
	visible: boolean;
	interactive: boolean;
	resource: QuestHallPreparationResourceState;
	returnView: "home" | "catalog";
	lang: LanguageCode;
	stageElement?: HTMLElement | null;
	bookSlot?: HTMLSpanElement | null;
	dockElement?: HTMLButtonElement | null;
	panelElement?: HTMLDivElement | null;
	onback: () => void;
	onretry: () => void;
	onworkflowentry: () => void;
}

let {
	visible,
	interactive,
	resource,
	returnView,
	lang,
	stageElement = $bindable(null),
	bookSlot = $bindable(null),
	dockElement = $bindable(null),
	panelElement = $bindable(null),
	onback,
	onretry,
	onworkflowentry,
}: Props = $props();

let backLabel = $derived(t(lang, returnView === "home" ? "hall.menu.backToRecommendations" : "hall.menu.backToCatalog"));

function productionPath(url: URL): string {
	return base && url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname;
}

function handleClickCapture(event: MouseEvent): void {
	if (!(event.target instanceof Element)) return;
	const anchor = event.target.closest("a");
	if (!(anchor instanceof HTMLAnchorElement)) return;
	const path = productionPath(new URL(anchor.href));
	if (/^\/task\/[1-9]\d*\/(?:session|feedback)$/.test(path) || /^\/translate\/[1-9]\d*\/(?:attempt|feedback)$/.test(path)) {
		onworkflowentry();
	}
}

function handleSubmitCapture(event: SubmitEvent): void {
	if (!(event.target instanceof HTMLFormElement)) return;
	const action = new URL(event.target.action);
	if (/^\/translate\/[1-9]\d*$/.test(productionPath(action)) && (action.search === "?/start" || action.search === "?/retake")) {
		onworkflowentry();
	}
}
</script>

<section
	bind:this={stageElement}
	class="preparation-stage"
	aria-label={t(lang, "hall.menu.preparationHeading")}
	aria-hidden={!visible}
	inert={!interactive}
>
	<div class="preparation-grid">
		<button bind:this={dockElement} type="button" class="preparation-dock" aria-label={backLabel} onclick={onback}>
			<span bind:this={bookSlot} class="preparation-book-slot" aria-hidden="true"></span>
			<span class="dock-action"><BookOpen size={17} aria-hidden="true" /> {backLabel}</span>
		</button>

		<div
			bind:this={panelElement}
			class="preparation-panel"
			tabindex="-1"
			aria-busy={resource.status === "loading"}
			onclickcapture={handleClickCapture}
			onsubmitcapture={handleSubmitCapture}
		>
			{#if resource.status === "loading"}
				<div class="resource-state" role="status" aria-live="polite">
					<LoaderCircle class="loading-icon" size={24} aria-hidden="true" />
					<strong>{t(lang, "hall.menu.preparationLoading")}</strong>
					<div class="skeleton-lines" aria-hidden="true"><span></span><span></span><span></span></div>
				</div>
			{:else if resource.status === "error"}
				<div class="resource-state" role="alert">
					<AlertTriangle size={25} aria-hidden="true" />
					<strong>{t(lang, "hall.menu.preparationError")}</strong>
					<p>{t(lang, "hall.menu.preparationErrorHelp")}</p>
					<div class="resource-actions">
						<button type="button" class="paper-button" onclick={onretry}>{t(lang, "common.retry")}</button>
						<button type="button" class="paper-button secondary" onclick={onback}>{backLabel}</button>
					</div>
				</div>
			{:else if resource.status === "ready" && resource.preparation.kind === "quest"}
				<TaskPreparation
					task={resource.preparation.data.task}
					nativeLanguage={resource.preparation.data.nativeLanguage}
					mode="pane"
					{backLabel}
					onback={(event) => {
						event.preventDefault();
						onback();
					}}
				/>
			{:else if resource.status === "ready" && resource.preparation.kind === "translation"}
				<TranslationPreparation
					template={resource.preparation.data.template}
					attempt={resource.preparation.data.attempt}
					blockedReason={resource.preparation.data.blockedReason}
					{lang}
					mode="pane"
					{backLabel}
					{onback}
				/>
			{:else}
				<div class="resource-state" role="alert">
					<FileText size={28} aria-hidden="true" />
					<strong>{t(lang, "hall.menu.preparationUnavailable")}</strong>
					<p>{t(lang, "hall.menu.preparationUnavailableHelp")}</p>
					<button type="button" class="paper-button secondary" onclick={onback}>{backLabel}</button>
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
.preparation-stage {
	grid-area: 1 / 1;
}

.preparation-stage[aria-hidden="true"] {
	visibility: hidden;
	opacity: 0;
	pointer-events: none;
}

.preparation-grid {
	display: grid;
	grid-template-columns: minmax(12rem, 0.34fr) minmax(0, 1fr);
	align-items: start;
	gap: clamp(1.25rem, 3vw, 2.75rem);
	max-width: 76rem;
	margin: 0 auto;
	padding-top: 1rem;
}

.preparation-dock {
	display: grid;
	gap: 0.8rem;
	width: 100%;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
}

.preparation-book-slot {
	display: block;
	width: 100%;
	aspect-ratio: var(--menu-page-aspect);
}

.dock-action {
	display: inline-flex;
	min-height: 44px;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	font-family: var(--font-sans);
	font-size: 0.75rem;
	font-weight: 750;
	color: var(--menu-wine);
}

.preparation-dock:focus-visible {
	border-radius: 0.15rem;
	outline: 2px solid var(--menu-focus);
	outline-offset: 3px;
}

.preparation-panel {
	display: flex;
	min-width: 0;
	min-height: clamp(34rem, 68vh, 48rem);
	flex-direction: column;
	padding: clamp(1.25rem, 3vw, 2.5rem);
	border: 1px solid color-mix(in oklab, var(--menu-ink) 16%, transparent);
	background: linear-gradient(110deg, color-mix(in oklab, white 42%, transparent), transparent 24%), var(--menu-sheet);
	box-shadow:
		0 18px 40px color-mix(in oklab, var(--menu-ink) 12%, transparent),
		inset 0 0 30px color-mix(in oklab, var(--menu-brass) 5%, transparent);
}

.preparation-panel:focus-visible {
	outline: 2px solid var(--menu-focus);
	outline-offset: 3px;
}

.resource-state {
	display: flex;
	min-height: 14rem;
	flex: 1;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 0.7rem;
	text-align: center;
	color: var(--menu-ink-muted);
}

.resource-state strong {
	color: var(--menu-ink);
}

.resource-state p {
	max-width: 32rem;
	margin: 0;
	line-height: 1.6;
}

:global(.loading-icon) {
	animation: preparation-spin 1s linear infinite;
}

.skeleton-lines {
	display: grid;
	gap: 0.55rem;
	width: min(100%, 18rem);
	margin-top: 0.6rem;
}

.skeleton-lines span {
	height: 0.7rem;
	background: color-mix(in oklab, var(--menu-ink) 10%, transparent);
}

.skeleton-lines span:nth-child(2) {
	width: 76%;
}

.skeleton-lines span:nth-child(3) {
	width: 52%;
}

.resource-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0.65rem;
}

.paper-button {
	min-height: 44px;
	padding: 0.55rem 0.8rem;
	border: 1px solid currentColor;
	background: transparent;
	color: var(--menu-wine);
	font-family: var(--font-sans);
	font-weight: 750;
	cursor: pointer;
}

.paper-button.secondary {
	border-color: transparent;
	color: var(--menu-ink-muted);
}

.paper-button:focus-visible {
	outline: 2px solid var(--menu-focus);
	outline-offset: 3px;
}

@keyframes preparation-spin {
	to {
		transform: rotate(360deg);
	}
}

@media (max-width: 64rem) {
	.preparation-grid {
		grid-template-columns: 1fr;
		padding-top: 0;
	}

	.preparation-dock {
		grid-template-columns: 5.5rem 1fr;
		align-items: center;
	}

	.preparation-book-slot {
		width: 5.5rem;
	}

	.preparation-panel {
		min-height: 34rem;
		padding: 1.1rem;
	}
}

@media (max-width: 30rem) {
	.preparation-panel {
		padding-inline: 0.9rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	:global(.loading-icon) {
		animation: none;
	}
}
</style>
