<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Languages from "@lucide/svelte/icons/languages";
import { onMount, tick } from "svelte";
import { fly } from "svelte/transition";
import { replaceState } from "$app/navigation";
import { base } from "$app/paths";
import { restoreQuestHallReturnContext, saveQuestHallReturnContext } from "$lib/client/quest-hall/return-context";
import { type LanguageCode, t } from "$lib/i18n";
import { shiftCalendarMonth } from "$lib/month";
import { getQuestMenuItemKey } from "$lib/quest-hall/menu";

interface TranslationTask {
	id: number;
	titleBase: string;
	descriptionBase: string | null;
	difficulty: number;
	createdMonth: string;
}

interface Props {
	tasks: TranslationTask[];
	statusMap: Record<string, string>;
	initialMonth: string;
	accountScope: string;
	edition: string;
	lang: LanguageCode;
}

let { tasks, statusMap, initialMonth, accountScope, edition, lang }: Props = $props();
// The month intentionally starts from the server-provided month and then stays client-controlled.
// svelte-ignore state_referenced_locally
let month = $state(initialMonth);
let monthDirection = $state(1);
let visibleTasks = $derived(tasks.filter((task) => task.createdMonth === month));

function monthLabel(value: string) {
	return new Date(`${value}-01T12:00:00.000Z`).toLocaleDateString(lang, {
		month: "long",
		year: "numeric",
	});
}

function changeMonth(amount: -1 | 1) {
	monthDirection = amount;
	month = shiftCalendarMonth(month, amount);
}

function saveReturnContext(task: TranslationTask): void {
	const selectedKey = getQuestMenuItemKey("translation", task.id);
	saveQuestHallReturnContext({
		accountScope,
		activeLanguage: lang,
		edition,
		origin: "translation-index",
		section: "translation",
		spread: 1,
		narrowItemKey: selectedKey,
		selectedKey,
		translationMonth: task.createdMonth,
		scrollOffset: window.scrollY,
		focusTarget: "translation-item",
	});
}

onMount(() => {
	if (new URL(window.location.href).searchParams.get("return") !== "translation") return;
	replaceState(`${base}/`, {});
	const translationKeys = tasks.map((task) => getQuestMenuItemKey("translation", task.id));
	const returnContext = restoreQuestHallReturnContext({
		accountScope,
		activeLanguage: lang,
		edition,
		translationMonths: new Set([initialMonth, ...tasks.map((task) => task.createdMonth)]),
		itemKeys: new Set(translationKeys),
		translationItemMonths: new Map(tasks.map((task) => [getQuestMenuItemKey("translation", task.id), task.createdMonth])),
		spreadCounts: { daily: 1, weekly: 1, translation: 1 },
	});
	if (!returnContext || returnContext.origin !== "translation-index") return;
	monthDirection = 1;
	month = returnContext.translationMonth;
	void tick().then(() => {
		requestAnimationFrame(() => {
			window.scrollTo({ top: returnContext.scrollOffset, behavior: "auto" });
			document.querySelector<HTMLElement>(`[data-translation-key="${returnContext.selectedKey}"]`)?.focus({ preventScroll: true });
		});
	});
});
</script>

<section class="translation-index" aria-labelledby="translation-index-title">
	<header class="translation-header">
		<div>
			<h2 id="translation-index-title">{t(lang, "translate.title")}</h2>
		</div>

		<div class="month-press" aria-label={t(lang, "translate.month")}>
			<button
				type="button"
				aria-label={t(lang, "translate.previousMonth")}
				title={t(lang, "translate.previousMonth")}
				onclick={() => changeMonth(-1)}
			>
				<ArrowLeft size={17} />
			</button>
			<span>{monthLabel(month)}</span>
			<button type="button" aria-label={t(lang, "translate.nextMonth")} title={t(lang, "translate.nextMonth")} onclick={() => changeMonth(1)}>
				<ArrowRight size={17} />
			</button>
		</div>
	</header>

	{#key month}
		<div class="month-sheet" in:fly={{ x: monthDirection * 24, duration: 340, opacity: 0.2 }}>
			{#if visibleTasks.length === 0}
				<div class="translation-empty">
					<Languages size={24} strokeWidth={1.25} />
					<p>{t(lang, "translate.empty")}</p>
				</div>
			{:else}
				<ol class="translation-list">
					{#each visibleTasks as task, index (task.id)}
						{@const status = statusMap[String(task.id)]}
						<li style="--translation-order: {index};">
							<a
								href="{base}/translate/{task.id}"
								data-translation-key={getQuestMenuItemKey("translation", task.id)}
								class:is-complete={status === "completed"}
								onclick={() => saveReturnContext(task)}
							>
								<span class="translation-number">{String(index + 1).padStart(2, "0")}</span>
								<span class="translation-mark">
									{#if status === "completed"}
										<CheckCircle2 size={21} strokeWidth={1.7} />
									{:else}
										<Languages size={21} strokeWidth={1.35} />
									{/if}
								</span>
								<span class="translation-copy">
									<span class="translation-title">{task.titleBase}</span>
									{#if task.descriptionBase}
										<span class="translation-summary">{task.descriptionBase}</span>
									{/if}
								</span>
								<span class="translation-arrow"><ArrowUpRight size={19} strokeWidth={1.7} /></span>
							</a>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	{/key}
</section>

<style>
.translation-index {
	border-bottom: 1px solid var(--border);
	padding: 1.15rem 0 1.4rem;
}

.translation-header {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 1rem;
}

.translation-header h2 {
	margin-top: 0.15rem;
	font-size: 1.8rem;
	line-height: 1;
	letter-spacing: 0;
}

.month-press {
	display: grid;
	width: 100%;
	grid-template-columns: 2.35rem minmax(0, 1fr) 2.35rem;
	align-items: center;
	border: 1px solid var(--border);
	border-radius: 6px;
	background: color-mix(in oklab, var(--card) 88%, transparent);
	box-shadow: 0 3px 0 color-mix(in oklab, var(--foreground) 18%, var(--border));
}

.month-press button {
	display: grid;
	min-height: 2.35rem;
	place-items: center;
	color: var(--muted-foreground);
	transition:
		background-color 180ms ease,
		color 180ms ease,
		transform 100ms ease;
}

.month-press button:hover {
	background: var(--secondary);
	color: var(--foreground);
}

.month-press button:active {
	transform: translateY(2px);
}

.month-press span {
	border-inline: 1px solid var(--border);
	padding: 0.65rem 0.75rem;
	text-align: center;
	font-size: 0.67rem;
	font-weight: 650;
	text-transform: uppercase;
	color: var(--foreground);
}

.month-sheet {
	min-height: 7rem;
	margin-top: 1rem;
	overflow: hidden;
}

.translation-list {
	list-style: none;
}

.translation-list li {
	border-top: 1px solid var(--border);
	animation: index-line-arrive 400ms calc(var(--translation-order) * 55ms) cubic-bezier(0.22, 1, 0.36, 1) both;
}

.translation-list li:last-child {
	border-bottom: 1px solid var(--border);
}

.translation-list a {
	position: relative;
	display: grid;
	min-height: 5.8rem;
	grid-template-columns: auto 2.6rem minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.7rem;
	padding: 0.85rem 0.25rem;
	transition:
		background-color 220ms ease,
		padding 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.translation-list a::after {
	position: absolute;
	inset: auto 0 0;
	height: 2px;
	background: #9a3943;
	content: "";
	transform: scaleX(0);
	transform-origin: left;
	transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.translation-list a:hover {
	padding-inline: 0.7rem;
	background: color-mix(in oklab, var(--card) 58%, transparent);
}

.translation-list a:hover::after {
	transform: scaleX(1);
}

.translation-list a:focus-visible {
	border-radius: 0.2rem;
	outline: 2px solid var(--hall-wine, #803945);
	outline-offset: 3px;
}

.translation-number {
	font-size: 0.6rem;
	font-weight: 700;
	color: var(--muted-foreground);
}

.translation-mark {
	display: grid;
	height: 2.6rem;
	place-items: center;
	border: 1px solid var(--border);
	border-radius: 5px;
	background: var(--card);
	color: var(--foreground);
}

.is-complete .translation-mark {
	background: color-mix(in oklab, #8faf8f 24%, var(--card));
	color: #225c3b;
}

.translation-copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 0.08rem;
}

.translation-title {
	display: -webkit-box;
	overflow: hidden;
	font-family: var(--font-serif);
	font-size: 1rem;
	font-weight: 500;
	line-height: 1.2;
	letter-spacing: 0;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.translation-summary {
	display: none;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.78rem;
	color: var(--muted-foreground);
}

.translation-arrow {
	display: grid;
	place-items: center;
	color: var(--muted-foreground);
	transition:
		transform 200ms ease,
		color 200ms ease;
}

.translation-list a:hover .translation-arrow {
	transform: translate(2px, -2px);
	color: #9a3943;
}

.translation-empty {
	display: flex;
	min-height: 7rem;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	border-block: 1px dashed var(--border);
	color: var(--muted-foreground);
}

@media (min-width: 640px) {
	.translation-header {
		flex-direction: row;
		align-items: flex-end;
		justify-content: space-between;
	}

	.month-press {
		width: 15.5rem;
	}

	.translation-list a {
		grid-template-columns: auto 2.8rem minmax(0, 1fr) auto;
		gap: 1rem;
	}

	.translation-summary {
		display: block;
	}
}

@keyframes index-line-arrive {
	from {
		opacity: 0;
		transform: translateX(-10px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.translation-list li {
		animation: none;
	}

	.month-press button,
	.translation-list a,
	.translation-list a::after,
	.translation-arrow {
		transition: none;
	}
}
</style>
