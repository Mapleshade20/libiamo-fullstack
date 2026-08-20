<script lang="ts">
import BookOpen from "@lucide/svelte/icons/book-open";
import Check from "@lucide/svelte/icons/check";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Hash from "@lucide/svelte/icons/hash";
import Languages from "@lucide/svelte/icons/languages";
import Mail from "@lucide/svelte/icons/mail";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessageSquare from "@lucide/svelte/icons/message-square";
import type { Component } from "svelte";
import { fade, fly, type TransitionConfig } from "svelte/transition";
import { UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";
import { getInitialHallQuestId, type HallQuest, isHallQuestFinished } from "$lib/quest-hall";
import QuestBrief from "./QuestBrief.svelte";

interface Props {
	id: "daily" | "weekly";
	title: string;
	tasks: HallQuest[];
	lang: LanguageCode;
}

let { id, title, tasks, lang }: Props = $props();
let selectedId = $state<number | null>(null);
let selectedTask = $derived(tasks.find((task) => task.id === selectedId) ?? null);
let desktopTask = $derived(selectedTask ?? tasks.find((task) => task.id === getInitialHallQuestId(tasks)) ?? tasks[0] ?? null);
let finishedCount = $derived(tasks.filter((task) => isHallQuestFinished(task.sessionStatus)).length);

$effect(() => {
	const taskIds = tasks.map((task) => task.id);
	if (selectedId !== null && !taskIds.includes(selectedId)) selectedId = null;
});

const uiIcons: Record<string, Component> = {
	reddit: MessageSquare,
	apple_mail: Mail,
	discord: Hash,
	imessage: MessageCircle,
	ao3: BookOpen,
	translator: Languages,
};

function selectTask(id: number) {
	selectedId = selectedId === id ? null : id;
}

function unfoldBrief(_node: Element, { duration = 340 }: { duration?: number } = {}): TransitionConfig {
	return {
		duration,
		css: (t) => {
			const eased = 1 - (1 - t) ** 3;
			return `
				grid-template-rows: ${eased}fr;
				opacity: ${eased};
			`;
		},
	};
}
</script>

<section class="quest-edition" aria-labelledby="edition-title-{id}">
	<header class="edition-header">
		<div class="edition-heading">
			<h2 id="edition-title-{id}">{title}</h2>
		</div>
	</header>

	<div
		class="edition-progress-track"
		role="progressbar"
		aria-label="{title}: {finishedCount} {t(lang, 'hall.edition.complete')}"
		aria-valuemin="0"
		aria-valuemax={tasks.length}
		aria-valuenow={finishedCount}
	>
		<span style:width={tasks.length === 0 ? "0%" : `${(finishedCount / tasks.length) * 100}%`}></span>
	</div>

	{#if tasks.length === 0}
		<p class="empty-edition">{t(lang, "hall.noTasks")}</p>
	{:else}
		<div class="edition-spread">
			<div class="quest-index">
				{#each tasks as task, index (task.id)}
					{@const Icon = uiIcons[task.templateUi] ?? MessageSquare}
					{@const active = selectedId === task.id}
					{@const finished = isHallQuestFinished(task.sessionStatus)}
					<div class="quest-entry" style="--quest-order: {index};">
						<button
							type="button"
							class="quest-key"
							class:is-active={active}
							class:is-finished={finished}
							aria-expanded={active}
							aria-controls="quest-mobile-detail-{id}-{task.id} quest-desktop-detail-{id}-{task.id}"
							onclick={() => selectTask(task.id)}
						>
							<span class="key-cap">
								{#if finished}
									<Check size={22} strokeWidth={2.2} />
								{:else}
									<Icon size={22} strokeWidth={1.45} />
								{/if}
								<span class="chapter-number">{String(index + 1).padStart(2, "0")}</span>
							</span>
							<span class="key-copy">
								<span class="key-meta"> {UI_VARIANT_LABELS[task.templateUi as UiVariant] ?? task.templateUi} </span>
								<span class="key-title">{task.title}</span>
							</span>
							{#if task.hasUnreadReply}
								<span class="unread-reply" aria-label={t(lang, "hall.unreadReply")}>
									<Mail size={12} strokeWidth={2} />
									{#if (task.unreadCount ?? 0) > 1}
										<span>×{task.unreadCount}</span>
									{/if}
								</span>
							{/if}
							<span class="difficulty-strokes" aria-label="{t(lang, 'hall.difficulty')} {task.templateDifficulty} / 3">
								{#each [1, 2, 3] as level}
									<span class:is-filled={level <= task.templateDifficulty}></span>
								{/each}
							</span>
							<span class="key-chevron"><ChevronRight size={18} strokeWidth={1.6} /></span>
						</button>

						{#if active}
							<div id="quest-mobile-detail-{id}-{task.id}" class="mobile-brief-shell" in:unfoldBrief out:unfoldBrief={{ duration: 170 }}>
								<div class="mobile-brief"><QuestBrief {task} icon={Icon} {lang} headingId="quest-mobile-title-{id}-{task.id}" /></div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="desktop-brief hidden lg:block">
				{#if desktopTask}
					{@const SelectedIcon = uiIcons[desktopTask.templateUi] ?? MessageSquare}
					{#key desktopTask.id}
						<div id="quest-desktop-detail-{id}-{desktopTask.id}" in:fly={{ x: 18, duration: 360, opacity: 0.25 }} out:fade={{ duration: 120 }}>
							<QuestBrief task={desktopTask} icon={SelectedIcon} {lang} headingId="quest-desktop-title-{id}-{desktopTask.id}" />
						</div>
					{/key}
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
.quest-edition {
	position: relative;
	border-bottom: 1px solid var(--border);
	padding: 1.15rem 0 1.4rem;
	animation: edition-settle 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.unread-reply {
	display: inline-flex;
	align-items: center;
	gap: 0.15rem;
	border-radius: 999px;
	background: var(--hall-wine);
	padding: 0.25rem 0.4rem;
	font-size: 0.62rem;
	font-weight: 700;
	color: white;
	white-space: nowrap;
}

.edition-header {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
}

.edition-heading h2 {
	margin-top: 0.15rem;
	font-size: 1.8rem;
	line-height: 1.12;
	letter-spacing: 0;
}

.edition-progress-track {
	height: 2px;
	margin-top: 0.9rem;
	overflow: hidden;
	background: var(--border);
}

.edition-progress-track span {
	display: block;
	height: 100%;
	background: #317452;
	transform-origin: left;
	animation: progress-ink 620ms 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.edition-spread {
	margin-top: 1.1rem;
}

.quest-index {
	display: flex;
	flex-direction: column;
	gap: 0.85rem;
}

.quest-entry {
	min-width: 0;
	animation: key-arrive 440ms calc(100ms + var(--quest-order) * 65ms) cubic-bezier(0.22, 1, 0.36, 1) both;
}

.quest-key {
	position: relative;
	display: grid;
	width: 100%;
	min-height: 4.85rem;
	grid-template-columns: 3.25rem minmax(0, 1fr) auto auto;
	align-items: center;
	gap: 0.8rem;
	border: 1px solid color-mix(in oklab, var(--foreground) 17%, var(--border));
	border-radius: 7px;
	padding: 0.65rem 0.75rem;
	background: color-mix(in oklab, var(--card) 90%, transparent);
	box-shadow:
		0 2px 0 color-mix(in oklab, var(--foreground) 18%, var(--border)),
		0 5px 10px rgb(49 42 35 / 5%);
	text-align: left;
	transition:
		border-color 180ms ease,
		background-color 180ms ease,
		box-shadow 120ms ease,
		transform 120ms ease;
}

.quest-key::before {
	position: absolute;
	inset: 0 auto 0 0;
	width: 3px;
	background: #9a3943;
	content: "";
	transform: scaleY(0);
	transform-origin: center;
	transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.quest-key:hover {
	border-color: color-mix(in oklab, var(--foreground) 34%, var(--border));
	background: var(--card);
}

.quest-key:active,
.quest-key.is-active {
	transform: translateY(3px);
	box-shadow:
		0 1px 0 color-mix(in oklab, var(--foreground) 25%, var(--border)),
		0 3px 8px rgb(49 42 35 / 7%);
}

.quest-key.is-active {
	border-color: color-mix(in oklab, #9a3943 48%, var(--border));
	background: var(--card);
}

.quest-key.is-active::before {
	transform: scaleY(1);
}

.quest-key.is-finished::before {
	background: #317452;
}

.key-cap {
	position: relative;
	display: grid;
	height: 3.15rem;
	place-items: center;
	border: 1px solid color-mix(in oklab, var(--foreground) 25%, var(--border));
	border-radius: 5px;
	background: var(--background);
	box-shadow: inset 0 0 0 3px color-mix(in oklab, var(--card) 70%, transparent);
	color: var(--foreground);
}

.is-active .key-cap {
	background: color-mix(in oklab, var(--color-accent-rose) 22%, var(--card));
}

.is-finished .key-cap {
	background: color-mix(in oklab, #8faf8f 24%, var(--card));
	color: #225c3b;
}

.chapter-number {
	position: absolute;
	right: 0.2rem;
	bottom: 0.08rem;
	font-family: var(--font-sans);
	font-size: 0.48rem;
	font-weight: 700;
	color: var(--muted-foreground);
}

.key-copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 0.15rem;
}

.key-meta {
	font-size: 0.62rem;
	font-weight: 650;
	text-transform: uppercase;
	color: var(--muted-foreground);
}

.key-title {
	display: -webkit-box;
	overflow: hidden;
	font-family: var(--font-serif);
	font-size: 1rem;
	font-weight: 500;
	line-height: 1.34;
	letter-spacing: 0;
	padding-block: 0.12rem;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.difficulty-strokes {
	display: flex;
	height: 1.5rem;
	align-items: center;
	gap: 2px;
}

.difficulty-strokes span {
	display: block;
	height: 0.75rem;
	width: 3px;
	background: var(--border);
}

.difficulty-strokes span.is-filled {
	background: var(--muted-foreground);
}

.key-chevron {
	display: grid;
	place-items: center;
	color: var(--muted-foreground);
	transition:
		transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
		color 180ms ease;
}

.is-active .key-chevron {
	transform: rotate(90deg);
	color: #9a3943;
}

.mobile-brief-shell {
	display: grid;
	overflow: hidden;
}

.mobile-brief {
	min-height: 0;
	overflow: hidden;
	padding: 0 0.6rem 0.5rem;
}

.desktop-brief {
	position: relative;
	height: 34rem;
	overflow: hidden;
	border-left: 1px solid var(--border);
}

.desktop-brief > div {
	position: absolute;
	inset: 0;
}

.empty-edition {
	padding: 2rem 0;
	color: var(--muted-foreground);
}

@media (max-width: 430px) {
	.quest-key {
		grid-template-columns: 3rem minmax(0, 1fr) auto;
		gap: 0.65rem;
	}

	.difficulty-strokes {
		display: none;
	}
}

@media (min-width: 1024px) {
	.mobile-brief-shell {
		display: none;
	}

	.quest-edition {
		padding-block: 1.35rem 1.55rem;
	}

	.edition-spread {
		display: grid;
		grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
		gap: 1.75rem;
	}

	.quest-index {
		padding-block: 0.4rem;
	}

	.quest-key {
		min-height: 5.35rem;
	}

	.key-chevron {
		display: none;
	}

	.key-title {
		font-size: 1.08rem;
	}
}

@keyframes edition-settle {
	from {
		opacity: 0;
		transform: translateY(14px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes key-arrive {
	from {
		opacity: 0;
		transform: translateY(10px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes progress-ink {
	from {
		transform: scaleX(0);
	}
	to {
		transform: scaleX(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.quest-edition,
	.quest-entry,
	.edition-progress-track span {
		animation: none;
	}

	.quest-key,
	.quest-key::before,
	.key-chevron {
		transition: none;
	}
}
</style>
