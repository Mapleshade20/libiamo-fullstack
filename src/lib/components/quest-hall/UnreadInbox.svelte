<script lang="ts">
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Mail from "@lucide/svelte/icons/mail";
import { fade } from "svelte/transition";
import { base } from "$app/paths";
import WineGlassIcon from "$lib/components/WineGlassIcon.svelte";
import { UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";
import { formatRelativeAge, type UnreadInboxItem, unreadTargetHref } from "$lib/unread";

let { lang }: { lang: LanguageCode } = $props();

let items = $state<UnreadInboxItem[]>([]);
let isOpen = $state(false);
let container = $state<HTMLElement | null>(null);

let total = $derived(items.reduce((sum, item) => sum + item.unreadCount, 0));

async function refresh() {
	try {
		const res = await fetch(`${base}/api/unread`);
		if (!res.ok) return;
		const data = (await res.json()) as { items: UnreadInboxItem[] };
		items = data.items;
	} catch {
		// offline or session expired: keep the last known state
	}
}

$effect(() => {
	void refresh();
	const interval = setInterval(() => {
		if (!document.hidden) void refresh();
	}, 12_000);
	const onKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") isOpen = false;
	};
	const onPointerdown = (event: PointerEvent) => {
		if (container && !container.contains(event.target as Node)) isOpen = false;
	};
	const onVisibility = () => {
		if (!document.hidden) void refresh();
	};
	window.addEventListener("keydown", onKeydown);
	document.addEventListener("pointerdown", onPointerdown);
	document.addEventListener("visibilitychange", onVisibility);
	return () => {
		clearInterval(interval);
		window.removeEventListener("keydown", onKeydown);
		document.removeEventListener("pointerdown", onPointerdown);
		document.removeEventListener("visibilitychange", onVisibility);
	};
});
</script>

<div class="unread-inbox" class:has-unread={total > 0} bind:this={container}>
	<button
		type="button"
		class="edition-seal inbox-trigger"
		aria-label={t(lang, "hall.unreadInboxTitle")}
		aria-expanded={isOpen}
		onclick={() => (isOpen = !isOpen)}
	>
		<span class="seal-word">LIBIAMO</span>
		<WineGlassIcon width={42} height={42} />
		<span class="seal-word">DAILY</span>
		{#if total > 0}
			<span class="seal-count" aria-hidden="true">{total > 99 ? "99+" : total}</span>
		{/if}
	</button>

	{#if isOpen}
		<div class="inbox-panel" transition:fade={{ duration: 140 }}>
			<header class="inbox-header">
				<span>{t(lang, "hall.unreadInboxTitle")}</span>
				{#if total > 0}
					<span class="inbox-total">{total}</span>
				{/if}
			</header>
			{#if items.length === 0}
				<p class="inbox-empty">{t(lang, "hall.unreadEmpty")}</p>
			{:else}
				<ul>
					{#each items as item (item.taskId)}
						<li>
							<a href={unreadTargetHref(item)} class="inbox-item" onclick={() => (isOpen = false)}>
								<span class="item-meta">
									<span class="item-channel">{UI_VARIANT_LABELS[item.ui as UiVariant] ?? item.ui}</span>
									{#if item.latestAgeSeconds !== null}
										<span class="item-age">{formatRelativeAge(item.latestAgeSeconds, lang)}</span>
									{/if}
								</span>
								<span class="item-title">{item.title}</span>
								<span class="item-row">
									<span class="item-count">
										<Mail size={12} strokeWidth={1.75} />
										{t(lang, "hall.unreadReply")}{item.unreadCount > 1 ? ` × ${item.unreadCount}` : ""}
									</span>
									<span class="item-chevron"><ChevronRight size={14} /></span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style>
.unread-inbox {
	position: relative;
	justify-self: end;
}

/* The seal stays hidden on small screens unless there is something to read. */
.edition-seal {
	display: none;
}

.unread-inbox.has-unread .edition-seal {
	display: grid;
}

@media (min-width: 640px) {
	.edition-seal {
		display: grid;
	}
}

.edition-seal {
	position: relative;
	width: 6.3rem;
	aspect-ratio: 1;
	place-items: center;
	align-content: center;
	padding: 0;
	border: 1px solid color-mix(in oklab, var(--hall-wine) 62%, var(--border));
	background: transparent;
	color: var(--hall-wine);
	cursor: pointer;
	transform: rotate(2deg);
	transition:
		transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
		border-color 220ms ease;
}

.edition-seal:focus-visible {
	outline: 2px solid color-mix(in oklab, var(--hall-wine) 70%, transparent);
	outline-offset: 3px;
}

.edition-seal:hover {
	transform: rotate(0.5deg) scale(1.02);
	border-color: color-mix(in oklab, var(--hall-wine) 85%, var(--border));
}

.edition-seal::before,
.edition-seal::after {
	position: absolute;
	inset: 0.35rem;
	border: 1px solid color-mix(in oklab, var(--hall-wine) 38%, transparent);
	content: "";
}

.edition-seal::after {
	inset: 0.7rem;
}

.seal-word {
	position: relative;
	z-index: 1;
	font-size: 0.48rem;
	font-weight: 700;
	letter-spacing: 0.15em;
}

.seal-count {
	position: absolute;
	right: -0.55rem;
	bottom: 0.35rem;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 1.35rem;
	padding-inline: 0.35rem;
	border: 1px solid color-mix(in oklab, var(--hall-wine) 50%, var(--background));
	background: var(--hall-wine);
	color: white;
	font-size: 0.62rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	line-height: 1.4;
}

.inbox-panel {
	position: absolute;
	right: 0;
	top: calc(100% + 0.6rem);
	z-index: 50;
	width: 20rem;
	max-width: calc(100vw - 2rem);
	overflow: hidden;
	border: 1px solid var(--border);
	border-radius: 0.375rem;
	background: var(--background);
	box-shadow: 0 12px 32px rgb(0 0 0 / 0.1);
}

.inbox-header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	padding: 0.75rem 1rem;
	border-bottom: 1px solid var(--border);
	font-size: 0.625rem;
	font-weight: 700;
	letter-spacing: 0.16em;
	text-transform: uppercase;
	color: var(--muted-foreground);
}

.inbox-total {
	color: var(--hall-wine);
}

.inbox-empty {
	padding: 1rem;
	margin: 0;
	font-size: 0.8125rem;
	color: var(--muted-foreground);
}

.inbox-item {
	display: flex;
	flex-direction: column;
	gap: 0.2rem;
	padding: 0.7rem 1rem;
	border-bottom: 1px solid var(--border);
	transition: background-color 160ms ease;
}

li:last-child .inbox-item {
	border-bottom: none;
}

.inbox-item:hover {
	background: var(--secondary);
}

.item-meta {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.5rem;
}

.item-channel {
	font-size: 0.625rem;
	font-weight: 700;
	letter-spacing: 0.14em;
	text-transform: uppercase;
	color: var(--muted-foreground);
}

.item-age {
	flex-shrink: 0;
	font-size: 0.6875rem;
	color: var(--muted-foreground);
}

.item-title {
	font-size: 0.875rem;
	font-weight: 500;
	color: var(--foreground);
}

.item-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 0.1rem;
}

.item-count {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--hall-wine);
}

.item-chevron {
	display: inline-flex;
	color: var(--muted-foreground);
	transition: color 160ms ease;
}

.inbox-item:hover .item-chevron {
	color: var(--foreground);
}
</style>
