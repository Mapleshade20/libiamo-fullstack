<script lang="ts">
import PencilLine from "@lucide/svelte/icons/pencil-line";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";

/** A feature that is on its way: printed on the menu like a quest, but faint and with nothing to open. */
let { lang }: { lang: LanguageCode } = $props();
</script>

<article class="upcoming-card">
	<span class="mark" aria-hidden="true"><PencilLine size={18} strokeWidth={1.4} /></span>
	<h3>{t(lang, "hall.menu.custom.title")}</h3>
	<p class="font-prose">{t(lang, "hall.menu.custom.body")}</p>
	<span class="soon">{t(lang, "hall.menu.custom.soon")}</span>
</article>

<style>
.upcoming-card {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	padding: 1.25rem 0.8rem;
	border: 1px dashed color-mix(in oklab, var(--menu-ink) 22%, transparent);
	border-radius: 0.5rem;
	color: var(--menu-ink-muted);
	text-align: center;
}

.mark {
	display: grid;
	width: 2.5rem;
	height: 2.5rem;
	place-items: center;
	border: 1px solid color-mix(in oklab, var(--menu-wine) 20%, transparent);
	border-radius: 999px;
	color: color-mix(in oklab, var(--menu-wine) 70%, var(--menu-ink-muted));
}

h3 {
	margin: 0;
	font-family: var(--font-serif);
	font-size: clamp(1.2rem, 2.15vw, 1.6rem);
	font-weight: 380;
	line-height: 1.12;
	color: color-mix(in oklab, var(--menu-ink) 72%, transparent);
	text-wrap: balance;
}

p {
	max-width: 22rem;
	font-size: 0.95rem;
	line-height: 1.6;
	text-wrap: pretty;
}

.soon {
	padding: 0.3rem 0.7rem;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 16%, transparent);
	border-radius: 999px;
	font-family: var(--font-sans);
	font-size: 0.72rem;
	font-weight: 650;
}
</style>
