<script lang="ts">
import BookOpen from "@lucide/svelte/icons/book-open";
import TaskPreparation from "$lib/components/task/TaskPreparation.svelte";
import TranslationPreparation from "$lib/components/translate/TranslationPreparation.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { QuestHallPreparation } from "$lib/quest-hall/preparation";

interface Props {
	visible: boolean;
	interactive: boolean;
	preparation: QuestHallPreparation | null;
	returnView: "home" | "catalog";
	lang: LanguageCode;
	stageElement?: HTMLElement | null;
	bookSlot?: HTMLSpanElement | null;
	dockElement?: HTMLButtonElement | null;
	panelElement?: HTMLDivElement | null;
	onback: () => void;
	form?: { error?: string } | null;
}

let {
	visible,
	interactive,
	preparation,
	returnView,
	lang,
	stageElement = $bindable(null),
	bookSlot = $bindable(null),
	dockElement = $bindable(null),
	panelElement = $bindable(null),
	onback,
	form = null,
}: Props = $props();

let backLabel = $derived(t(lang, returnView === "home" ? "hall.menu.backToRecommendations" : "hall.menu.backToCatalog"));
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

		<div bind:this={panelElement} class="preparation-panel" tabindex="-1">
			{#if preparation?.kind === "quest"}
				<TaskPreparation
					task={preparation.data.task}
					nativeLanguage={preparation.data.nativeLanguage}
					{backLabel}
					onback={(event) => {
						event.preventDefault();
						onback();
					}}
				/>
			{:else if preparation?.kind === "translation"}
				<TranslationPreparation
					template={preparation.data.template}
					attempt={preparation.data.attempt}
					blockedReason={preparation.data.blockedReason}
					{form}
					{lang}
					{backLabel}
					{onback}
				/>
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

@media (width < 56.25rem) {
	.preparation-dock {
		display: none;
	}
}

@media (max-width: 30rem) {
	.preparation-panel {
		padding-inline: 0.9rem;
	}
}
</style>
