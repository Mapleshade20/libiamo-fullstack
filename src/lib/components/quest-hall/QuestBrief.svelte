<script lang="ts">
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import FileText from "@lucide/svelte/icons/file-text";
import Gauge from "@lucide/svelte/icons/gauge";
import Play from "@lucide/svelte/icons/play";
import Star from "@lucide/svelte/icons/star";
import type { Component } from "svelte";
import { UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";
import { getHallQuestAction, type HallQuest, isHallQuestFinished } from "$lib/quest-hall";

interface Props {
	task: HallQuest;
	icon: Component;
	lang: LanguageCode;
	headingId: string;
}

let { task, icon: Icon, lang, headingId }: Props = $props();
let action = $derived(getHallQuestAction(task));
let isFinished = $derived(isHallQuestFinished(task.sessionStatus));
let difficulty = $derived(
	[t(lang, "task.difficulty.beginner"), t(lang, "task.difficulty.intermediate"), t(lang, "task.difficulty.advanced")][task.templateDifficulty - 1] ??
		`${t(lang, "hall.difficulty")} ${task.templateDifficulty}`,
);
let uiLabel = $derived(UI_VARIANT_LABELS[task.templateUi as UiVariant] ?? task.templateUi);
</script>

<article class="quest-brief" class:is-finished={isFinished} aria-labelledby={headingId}>
	<div class="living-print" aria-hidden="true">
		<div class="print-register print-register-top">VOL. {String(task.id).padStart(3, "0")}</div>
		<div class="print-frame">
			<div class="print-hatching"></div>
			<span class="print-icon"><Icon size={72} strokeWidth={0.85} /></span>
			<span class="print-icon print-icon-echo"><Icon size={72} strokeWidth={0.85} /></span>
		</div>
		<div class="print-caption">{uiLabel}</div>
	</div>

	<div class="brief-copy">
		{#if task.hasUnreadReply}
			<p class="unread-note">{t(lang, "hall.unreadReply")}</p>
		{/if}
		{#if isFinished}
			<div class="brief-status">
				<span class="finished-label"><CheckCircle2 size={14} /> {t(lang, "hall.card.completed")}</span>
				<span class="brief-rule"></span>
			</div>
		{/if}

		<h3 id={headingId}>{task.title}</h3>
		<p class="brief-objective">{task.shortObjective ?? t(lang, "hall.card.missionObjective")}</p>

		<div class="brief-footer">
			<div class="brief-meta">
				<div class="brief-reward">
					<Star size={15} strokeWidth={1.6} />
					<span>{task.pointReward} {t(lang, "task.points")}</span>
				</div>
				<div class="brief-difficulty">
					<Gauge size={15} strokeWidth={1.6} />
					<span>{difficulty}</span>
				</div>
			</div>
			<div class="brief-actions">
				<a class="full-brief-link" href="/task/{task.id}">
					<FileText size={16} strokeWidth={1.6} />
					<span>{t(lang, "hall.edition.fullBrief")}</span>
				</a>
				<a class="quest-start-button" class:is-finished={isFinished} href={action.href}>
					{#if !isFinished}
						<Play size={16} fill="currentColor" />
					{/if}
					<span>{t(lang, action.labelKey)}</span>
				</a>
			</div>
		</div>
	</div>
</article>

<style>
.quest-brief {
	position: relative;
	display: grid;
	gap: 1.25rem;
	min-width: 0;
	padding: 1.25rem 0.25rem 0.35rem;
	color: var(--foreground);
}

.unread-note {
	width: fit-content;
	border-bottom: 1px solid currentColor;
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--hall-wine, #9a3943);
}

.living-print {
	position: relative;
	overflow: hidden;
	min-height: 7.25rem;
	border: 1px solid color-mix(in oklab, var(--foreground) 22%, transparent);
	background: color-mix(in oklab, var(--card) 82%, var(--color-accent-blue));
	box-shadow: inset 0 0 0 4px color-mix(in oklab, var(--card) 76%, transparent);
	animation: ink-wipe 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.living-print::after {
	position: absolute;
	inset: 0;
	background-image: repeating-linear-gradient(0deg, transparent 0 5px, color-mix(in oklab, var(--foreground) 7%, transparent) 5px 6px);
	content: "";
	mix-blend-mode: multiply;
	pointer-events: none;
}

.print-register {
	position: absolute;
	z-index: 2;
	top: 0.55rem;
	left: 0.65rem;
	font-family: var(--font-sans);
	font-size: 0.6rem;
	font-weight: 650;
	letter-spacing: 0.12em;
}

.print-frame {
	position: absolute;
	inset: 1.65rem 0.75rem 1.55rem;
	display: grid;
	place-items: center;
	overflow: hidden;
	border-block: 1px solid color-mix(in oklab, var(--foreground) 30%, transparent);
}

.print-hatching {
	position: absolute;
	inset: -50%;
	background-image: repeating-linear-gradient(108deg, transparent 0 8px, color-mix(in oklab, var(--foreground) 9%, transparent) 8px 9px);
	animation: print-reel 14s linear infinite;
}

.print-icon {
	position: relative;
	z-index: 1;
	display: grid;
	place-items: center;
	color: color-mix(in oklab, var(--foreground) 75%, var(--color-accent-blue));
	filter: drop-shadow(5px 5px 0 color-mix(in oklab, var(--color-accent-rose) 42%, transparent));
	animation: portrait-drift 7s ease-in-out infinite alternate;
}

.print-icon-echo {
	position: absolute;
	transform: translate(8px, 5px);
	opacity: 0.08;
	animation-direction: alternate-reverse;
}

.print-caption {
	position: absolute;
	z-index: 2;
	right: 0.65rem;
	bottom: 0.45rem;
	font-family: var(--font-sans);
	font-size: 0.62rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
}

.brief-copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	animation: copy-rise 400ms 80ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.brief-status {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	font-family: var(--font-sans);
	font-size: 0.68rem;
	font-weight: 650;
	text-transform: uppercase;
	color: var(--muted-foreground);
}

.finished-label {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	color: #247448;
}

.brief-rule {
	height: 1px;
	width: 1.5rem;
	background: var(--border);
}

h3 {
	display: none;
	margin-top: 0.8rem;
	font-family: var(--font-serif);
	font-size: clamp(1.5rem, 3vw, 2rem);
	font-weight: 500;
	line-height: 1.18;
	letter-spacing: 0;
}

.brief-objective {
	margin-top: 0.7rem;
	max-width: 43rem;
	font-size: 1rem;
	line-height: 1.55;
	color: var(--muted-foreground);
}

.brief-footer {
	display: flex;
	margin-top: 1rem;
	flex-direction: column;
	gap: 1rem;
}

.brief-meta,
.brief-reward,
.brief-difficulty,
.full-brief-link,
.brief-actions {
	display: flex;
	align-items: center;
}

.brief-reward {
	gap: 0.4rem;
	font-size: 0.78rem;
	font-weight: 550;
	color: var(--muted-foreground);
}

.brief-meta {
	gap: 1rem;
}

.brief-difficulty {
	gap: 0.4rem;
	font-size: 0.78rem;
	font-weight: 550;
	color: var(--muted-foreground);
}

.brief-actions {
	display: grid;
	min-width: 0;
	grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
	align-items: stretch;
	gap: 0.8rem;
}

.full-brief-link {
	min-height: 3.1rem;
	justify-content: center;
	gap: 0.4rem;
	border: 1px solid color-mix(in oklab, var(--foreground) 28%, var(--border));
	border-radius: 6px;
	padding: 0.7rem 0.75rem;
	background: var(--card);
	box-shadow:
		0 4px 0 color-mix(in oklab, var(--foreground) 22%, var(--border)),
		0 8px 14px rgb(40 35 30 / 8%);
	font-size: 0.85rem;
	font-weight: 650;
	color: var(--foreground);
	transition:
		border-color 180ms ease,
		background-color 180ms ease,
		box-shadow 120ms ease,
		transform 120ms ease;
}

.full-brief-link:hover {
	border-color: color-mix(in oklab, var(--foreground) 44%, var(--border));
	background: color-mix(in oklab, var(--card) 82%, var(--secondary));
	color: var(--foreground);
}

.full-brief-link:active {
	transform: translateY(3px);
	box-shadow:
		0 1px 0 color-mix(in oklab, var(--foreground) 22%, var(--border)),
		0 3px 7px rgb(40 35 30 / 7%);
}

.quest-start-button {
	display: flex;
	min-height: 3.1rem;
	align-items: center;
	justify-content: center;
	gap: 0.55rem;
	border: 1px solid #29282b;
	border-radius: 6px;
	padding: 0.7rem 0.9rem;
	background: #29282b;
	box-shadow:
		0 4px 0 #111114,
		0 8px 16px rgb(40 35 30 / 14%);
	color: var(--primary-foreground);
	font-size: 0.85rem;
	font-weight: 650;
	transition:
		box-shadow 120ms ease,
		transform 120ms ease,
		background-color 180ms ease;
}

.quest-start-button:hover {
	background: #38363a;
}

.quest-start-button:active {
	transform: translateY(3px);
	box-shadow:
		0 1px 0 #111114,
		0 3px 7px rgb(40 35 30 / 12%);
}

.quest-start-button.is-finished {
	border-color: #317452;
	background: #317452;
	box-shadow:
		0 4px 0 #1f4d36,
		0 8px 16px rgb(31 77 54 / 14%);
}

@media (min-width: 640px) {
	.quest-brief {
		grid-template-columns: minmax(8rem, 0.42fr) minmax(0, 1fr);
		align-items: stretch;
	}

	h3 {
		display: block;
	}

	.brief-actions {
		align-items: center;
	}

	.full-brief-link {
		justify-content: center;
	}
}

@media (min-width: 1024px) {
	.quest-brief {
		height: 100%;
		grid-template-columns: 1fr;
		padding: 1.5rem 0 0.35rem 1.75rem;
	}

	.living-print {
		min-height: 10.5rem;
	}

	h3,
	.brief-objective {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}
}

@keyframes ink-wipe {
	from {
		clip-path: inset(0 100% 0 0);
		transform: translateX(-8px);
	}
	to {
		clip-path: inset(0);
		transform: translateX(0);
	}
}

@keyframes copy-rise {
	from {
		opacity: 0;
		transform: translateY(8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes print-reel {
	to {
		transform: translate3d(7%, 0, 0);
	}
}

@keyframes portrait-drift {
	from {
		transform: translate3d(-2px, 1px, 0) rotate(-1deg);
	}
	to {
		transform: translate3d(3px, -2px, 0) rotate(1deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.living-print,
	.brief-copy,
	.print-hatching,
	.print-icon {
		animation: none;
	}

	.quest-start-button,
	.full-brief-link {
		transition: none;
	}
}
</style>
