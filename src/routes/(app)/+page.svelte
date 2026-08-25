<script lang="ts">
import QuestEdition from "$lib/components/quest-hall/QuestEdition.svelte";
import TranslationIndex from "$lib/components/quest-hall/TranslationIndex.svelte";
import UnreadInbox from "$lib/components/quest-hall/UnreadInbox.svelte";
import { type LanguageCode, t } from "$lib/i18n";
import { formatHallEditionDate } from "$lib/quest-hall";

let { data } = $props();
let lang = $derived(data.user.activeLanguage as LanguageCode);
</script>

<svelte:head>
	<title>Quest Hall · Libiamo</title>
	<meta name="description" content="Choose today's language practice quests and continue your learning routine.">
</svelte:head>

<div class="quest-hall">
	<header class="hall-masthead">
		<div class="masthead-copy">
			<div class="masthead-kicker">
				<span class="register-mark" aria-hidden="true"></span>
				<span>{formatHallEditionDate(data.editionDate)} {t(lang, "hall.edition.label")}</span>
			</div>
			<h1>{data.greeting}</h1>
			<p>{data.subtitle}</p>
		</div>

		<UnreadInbox {lang} />
	</header>

	{#key data.user.activeLanguage}
		<div class="hall-sections">
			<QuestEdition id="daily" title={t(lang, "hall.today")} tasks={data.dailyTasks} {lang} />

			<QuestEdition id="weekly" title={t(lang, "hall.thisWeek")} tasks={data.weeklyTasks} {lang} />

			<TranslationIndex tasks={data.translationTasks} statusMap={data.translationStatusMap} initialMonth={data.translationMonth} {lang} />
		</div>
	{/key}
</div>

<style>
.quest-hall {
	--hall-wine: #9a3943;
	--hall-ink: #29282b;
	padding-bottom: 3rem;
}

.hall-masthead {
	position: relative;
	z-index: 10;
	display: grid;
	min-height: 12rem;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 1.5rem;
	border-top: 3px double color-mix(in oklab, var(--foreground) 46%, transparent);
	border-bottom: 1px solid var(--border);
	padding-block: 1.7rem 1.9rem;
	animation: masthead-enter 620ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hall-masthead::after {
	position: absolute;
	right: 0;
	bottom: -4px;
	left: 0;
	height: 1px;
	background: var(--border);
	content: "";
}

.masthead-copy {
	min-width: 0;
}

.masthead-kicker {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	font-size: 0.64rem;
	font-weight: 650;
	text-transform: uppercase;
	color: var(--muted-foreground);
}

.register-mark {
	display: inline-block;
	width: 0.5rem;
	height: 0.5rem;
	background: var(--hall-wine);
	box-shadow: 3px 3px 0 color-mix(in oklab, var(--color-accent-blue) 72%, transparent);
}

.hall-masthead h1 {
	max-width: 46rem;
	margin-top: 0.8rem;
	font-size: clamp(2rem, 5vw, 3.15rem);
	font-weight: 500;
	line-height: 1.02;
	letter-spacing: 0;
	animation: headline-ink 680ms 80ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hall-masthead p:not(.masthead-kicker) {
	max-width: 44rem;
	margin-top: 0.55rem;
	font-family: var(--font-serif);
	font-size: clamp(1.05rem, 2.4vw, 1.4rem);
	font-style: italic;
	line-height: 1.3;
	color: var(--muted-foreground);
	animation: subtitle-ink 520ms 220ms ease-out both;
}

.hall-sections {
	display: flex;
	margin-top: 2rem;
	flex-direction: column;
	gap: 2.6rem;
}

@keyframes masthead-enter {
	from {
		opacity: 0;
		transform: translateY(-8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes headline-ink {
	from {
		clip-path: inset(0 100% 0 0);
		transform: translateX(-10px);
	}
	to {
		clip-path: inset(0);
		transform: translateX(0);
	}
}

@keyframes subtitle-ink {
	from {
		opacity: 0;
		transform: translateY(6px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.hall-masthead,
	.hall-masthead h1,
	.hall-masthead p:not(.masthead-kicker) {
		animation: none;
	}
}
</style>
