<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import { type LanguageCode, t } from "$lib/i18n";
import { formatCalendarMonth } from "$lib/month";

interface Props {
	month: string;
	lang: LanguageCode;
	disabled?: boolean;
	onchange: (direction: -1 | 1) => void;
}

let { month, lang, disabled = false, onchange }: Props = $props();
</script>

<span class="month-folio" role="group" aria-label={t(lang, "translate.month")}>
	<button
		type="button"
		{disabled}
		aria-label={t(lang, "translate.previousMonth")}
		title={t(lang, "translate.previousMonth")}
		onclick={() => onchange(-1)}
	>
		<ChevronLeft size={15} strokeWidth={1.5} aria-hidden="true" />
	</button>
	<time datetime={`${month}-01`} aria-live="polite">{formatCalendarMonth(month, lang)}</time>
	<button type="button" {disabled} aria-label={t(lang, "translate.nextMonth")} title={t(lang, "translate.nextMonth")} onclick={() => onchange(1)}>
		<ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" />
	</button>
</span>

<style>
.month-folio {
	display: inline-flex;
	min-width: 0;
	align-items: center;
	margin-left: auto;
	color: var(--menu-ink-muted);
	font-family: var(--font-sans);
}

.month-folio button {
	display: grid;
	width: 44px;
	height: 44px;
	flex: 0 0 44px;
	place-items: center;
	border: 0;
	background: transparent;
	color: var(--menu-wine);
	cursor: pointer;
	transition:
		background-color 160ms ease,
		color 160ms ease;
}

.month-folio button:not(:disabled):hover {
	background: color-mix(in oklab, var(--menu-wine) 7%, transparent);
	color: var(--menu-brass-dark);
}

.month-folio button:focus-visible {
	border-radius: 0.15rem;
	outline: 2px solid var(--menu-focus);
	outline-offset: -4px;
}

.month-folio button:disabled {
	cursor: default;
	opacity: 0.35;
}

.month-folio time {
	min-width: 6.75rem;
	padding-inline: 0.25rem;
	text-align: center;
	font-size: 0.62rem;
	font-weight: 750;
	letter-spacing: 0.08em;
	line-height: 1.2;
	text-transform: uppercase;
	white-space: nowrap;
}

@media (max-width: 30rem) {
	.month-folio time {
		min-width: 0;
		white-space: normal;
	}
}
</style>
