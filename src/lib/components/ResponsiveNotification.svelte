<script lang="ts">
import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Info from "@lucide/svelte/icons/info";
import X from "@lucide/svelte/icons/x";
import { onDestroy, onMount, tick } from "svelte";
import { fade, fly, scale } from "svelte/transition";
import { lockBodyScroll } from "$lib/client/scroll-lock";
import type { NotificationVariant } from "$lib/notifications";
import { cn } from "$lib/utils";

interface Props {
	open?: boolean;
	variant?: NotificationVariant;
	title?: string;
	message?: string;
	durationMs?: number;
	actionHref?: string;
	actionLabel?: string;
	onClose?: () => void;
}

let {
	open = false,
	variant = "info",
	title,
	message = "",
	durationMs = 4000,
	actionHref,
	actionLabel = "Open",
	onClose = () => {},
}: Props = $props();

let isWide = $state(false);
let desktopTop = $state(20);
let timer: ReturnType<typeof setTimeout> | null = null;
let mediaQuery: MediaQueryList | null = null;
let navObserver: ResizeObserver | null = null;

const variantClasses = $derived(
	variant === "success"
		? {
				icon: "text-emerald-600 bg-emerald-50 ring-emerald-100",
				accent: "from-emerald-500/20 via-emerald-400/8",
			}
		: variant === "error"
			? {
					icon: "text-destructive bg-red-50 ring-red-100",
					accent: "from-red-500/20 via-red-400/8",
				}
			: {
					icon: "text-blue-600 bg-blue-50 ring-blue-100",
					accent: "from-blue-500/20 via-blue-400/8",
				},
);
const resolvedTitle = $derived(title ?? (variant === "success" ? "Done" : variant === "error" ? "Something went wrong" : "Notice"));

function clearTimer() {
	if (timer) clearTimeout(timer);
	timer = null;
}

function updateDesktopTop() {
	const nav = document.querySelector("[data-app-nav]") as HTMLElement | null;
	desktopTop = nav ? Math.ceil(nav.getBoundingClientRect().bottom + 16) : 20;
}

onMount(() => {
	mediaQuery = window.matchMedia("(min-width: 768px)");
	const updateWide = () => {
		isWide = Boolean(mediaQuery?.matches);
	};
	updateWide();
	mediaQuery.addEventListener("change", updateWide);

	void tick().then(() => {
		updateDesktopTop();
		const nav = document.querySelector("[data-app-nav]") as HTMLElement | null;
		if (nav) {
			navObserver = new ResizeObserver(updateDesktopTop);
			navObserver.observe(nav);
		}
	});
	window.addEventListener("resize", updateDesktopTop);

	return () => {
		mediaQuery?.removeEventListener("change", updateWide);
		window.removeEventListener("resize", updateDesktopTop);
		navObserver?.disconnect();
	};
});

$effect(() => {
	clearTimer();
	if (open && isWide && durationMs > 0) {
		timer = setTimeout(onClose, durationMs);
	}

	return clearTimer;
});

$effect(() => {
	if (!open || isWide) return;

	return lockBodyScroll();
});

onDestroy(clearTimer);
</script>

{#if open && message}
	<div
		class="fixed inset-0 z-[4000] flex h-dvh w-screen items-center justify-center overscroll-contain bg-stone-200/80 p-4 md:pointer-events-none md:inset-auto md:right-5 md:top-[var(--notification-desktop-top)] md:block md:h-auto md:w-auto md:bg-transparent md:p-0"
		style="--notification-desktop-top: {desktopTop}px"
	>
		<div
			transition:scale={{ duration: 160, start: 0.96 }}
			class="w-full max-w-sm md:hidden"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="notification-title"
		>
			<div class="relative overflow-hidden rounded-3xl border border-border/80 bg-popover p-5 shadow-2xl shadow-foreground/15 ring-1 ring-black/5">
				<div class="relative flex gap-4">
					<div class={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1", variantClasses.icon)}>
						{#if variant === "success"}
							<CheckCircle2 size={22} />
						{:else if variant === "error"}
							<AlertTriangle size={22} />
						{:else}
							<Info size={22} />
						{/if}
					</div>
					<div class="min-w-0 flex-1 pt-0.5">
						<h2 id="notification-title" class="text-base font-semibold tracking-tight">{resolvedTitle}</h2>
						<p class="mt-1 text-sm leading-6 text-muted-foreground">{message}</p>
						<div class="mt-5 flex gap-2">
							{#if actionHref}
								<a
									href={actionHref}
									class="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
									onclick={onClose}
								>
									{actionLabel}
								</a>
							{/if}
							<button
								type="button"
								class="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium shadow-sm transition hover:bg-secondary"
								onclick={onClose}
							>
								OK
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div transition:fly={{ x: 18, y: -8, duration: 180 }} class="pointer-events-auto hidden w-[min(24rem,calc(100vw-2rem))] md:block" role="status">
			<div
				class="relative overflow-hidden rounded-2xl border border-border/80 bg-popover/95 p-4 shadow-2xl shadow-foreground/10 ring-1 ring-black/5 backdrop-blur-xl"
			>
				<div class={cn("absolute inset-y-0 left-0 w-1 bg-gradient-to-b to-transparent", variantClasses.accent)}></div>
				<div class="flex gap-3 pl-1">
					<div class={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1", variantClasses.icon)}>
						{#if variant === "success"}
							<CheckCircle2 size={19} />
						{:else if variant === "error"}
							<AlertTriangle size={19} />
						{:else}
							<Info size={19} />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold leading-5">{resolvedTitle}</p>
						<p class="mt-1 text-sm leading-5 text-muted-foreground">{message}</p>
						{#if actionHref}
							<a href={actionHref} class="mt-2 inline-flex text-sm font-medium text-primary hover:underline" onclick={onClose}>{actionLabel}</a>
						{/if}
					</div>
					<button
						type="button"
						class="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
						aria-label="Dismiss notification"
						onclick={onClose}
					>
						<X size={16} />
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
