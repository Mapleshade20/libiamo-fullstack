<script lang="ts">
import { base } from "$app/paths";
import type { UnreadSubscriptionStatus } from "$lib/client/quest-hall/unread-subscription";
import { type LanguageCode, UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import { t } from "$lib/i18n";
import { formatRelativeAge, type UnreadInboxItem, unreadTargetHref } from "$lib/unread";
import NotificationIcon from "./NotificationIcon.svelte";

let { items, total, status, lang }: { items: UnreadInboxItem[]; total: number; status: UnreadSubscriptionStatus; lang: LanguageCode } = $props();
let expanded = $state(false);
let container = $state<HTMLElement>();
let pointerType = "";

function close() {
	expanded = false;
}
</script>

<svelte:document
	onpointerdown={(event) => { if (!container?.contains(event.target as Node)) close(); }}
	onkeydown={(event) => {
	if (event.key === "Escape" && expanded) { close(); container?.querySelector("a")?.focus({ preventScroll: true }); }
}}
/>

<span class="sr-only" role="status"
	>{t(lang, "hall.unreadTrigger")}: {t(lang, total === 1 ? "hall.unreadCountOne" : "hall.unreadCountMany").replace("{count}", String(total))}</span
>
{#if items.length > 0}
	<section
		bind:this={container}
		class="notifications"
		class:expanded
		aria-label={t(lang, "hall.unreadTrigger")}
		onpointerenter={(event) => { if (event.pointerType === "mouse") expanded = true; }}
		onpointerleave={(event) => { if (event.pointerType === "mouse" && !container?.contains(document.activeElement)) close(); }}
		onfocusout={(event) => { if (!container?.contains(event.relatedTarget as Node)) close(); }}
	>
		<div class="cards" style:--count={items.length}>
			{#each items as item, index (item.taskId)}
				<a
					href={unreadTargetHref(item, base)}
					class="notification"
					style:--index={index}
					style:--depth={Math.min(index, 2)}
					inert={!expanded && index > 0}
					onpointerdown={(event) => { pointerType = event.pointerType; }}
					onclick={(event) => {
						if (!expanded && (pointerType !== "mouse" || event.detail === 0)) { event.preventDefault(); expanded = true; }
						pointerType = "";
					}}
					onkeydown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); expanded = true; } }}
				>
					<span class="icon"><NotificationIcon ui={item.ui} /></span>
					<span class="copy">
						<span class="meta"
							><span>{UI_VARIANT_LABELS[item.ui as UiVariant] ?? item.ui}</span>
							{#if item.latestAgeSeconds !== null}
								<span>{formatRelativeAge(item.latestAgeSeconds, lang)}</span>
							{/if}
						</span>
						<span class="title">{item.title}</span>
						<span class="reply">{t(lang, "hall.unreadReply")}{item.unreadCount > 1 ? ` × ${item.unreadCount}` : ""}</span>
					</span>
				</a>
			{/each}
		</div>
		<span class="sr-only" role="status">{total}</span>
		{#if status === "error"}
			<p class="notice">{t(lang, "hall.unreadError")}</p>
		{/if}
	</section>
{:else if status === "error"}
	<p class="notice" role="status">{t(lang, "hall.unreadError")}</p>
{/if}

<style>
.notifications {
	width: min(20rem, calc(100vw - 2rem));
	font-family: var(--font-sans);
}
.cards {
	position: relative;
	height: 86px;
	transition: height 300ms cubic-bezier(0.32, 0, 0.2, 1);
}
.expanded .cards {
	height: min(calc(var(--count) * 76px), 65dvh);
	overflow-y: auto;
	overscroll-behavior: contain;
	transition: height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
.notification {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 68px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	border: 1px solid #8b817329;
	border-radius: 16px;
	background: #fafaf9ed;
	backdrop-filter: blur(20px);
	box-shadow: 0 0.15rem 0.5rem rgb(74 59 43 / 0.035);
	color: var(--foreground);
	text-decoration: none;
	transform-origin: top center;
	transform: translateY(calc(var(--depth) * 9px)) scale(calc(1 - var(--depth) * 0.045));
	z-index: calc(var(--count) - var(--index));
	opacity: 0;
	transition:
		transform 300ms cubic-bezier(0.32, 0, 0.2, 1),
		opacity 220ms ease-out,
		background 220ms ease-out;
}
.notification:nth-child(-n + 3) {
	opacity: 1;
}
.expanded .notification {
	transform: translateY(calc(var(--index) * 76px));
	opacity: 1;
	/* Depth changes settling time, not start time, so quick reversals stay responsive. */
	transition:
		transform calc(380ms + var(--depth) * 35ms) cubic-bezier(0.22, 1.12, 0.36, 1),
		opacity 260ms ease-out,
		background 220ms ease-out;
}
.notification:hover {
	background: #fafaf9;
}
.notification:focus-visible {
	outline: 2px solid var(--ring);
	outline-offset: -3px;
}
.icon {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	flex: 0 0 auto;
	color: var(--muted-foreground);
}
.icon :global(svg) {
	width: 20px;
	height: 20px;
}
.copy {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}
.meta {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.62rem;
	color: var(--muted-foreground);
}
.title {
	font-size: 0.8rem;
	font-weight: 550;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.reply {
	font-size: 0.68rem;
	color: var(--muted-foreground);
}
.notice {
	padding: 12px;
	border-radius: 12px;
	background: #fafaf9ed;
	font-size: 0.75rem;
}
@media (prefers-reduced-motion: reduce) {
	.cards,
	.expanded .cards,
	.notification,
	.expanded .notification {
		transition: none;
	}
}
</style>
