<script lang="ts">
import Home from "@lucide/svelte/icons/home";
import Layers from "@lucide/svelte/icons/layers";
import LogOut from "@lucide/svelte/icons/log-out";
import Plus from "@lucide/svelte/icons/plus";
import Search from "@lucide/svelte/icons/search";
import TrendingUp from "@lucide/svelte/icons/trending-up";
import { fade, fly } from "svelte/transition";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { FEATURED_GAMES } from "./data";
import { getAvatarColor } from "./format";
import type { RedditText } from "./i18n";

let {
	t,
	returnHref,
	language,
	subreddit,
	userName,
	avatarUrl,
	showMobileMenu,
	onCloseMobileMenu,
	onMockAction,
}: {
	t: RedditText;
	returnHref: string;
	language: LanguageCode;
	subreddit: string;
	userName: string;
	avatarUrl: string;
	showMobileMenu: boolean;
	onCloseMobileMenu: () => void;
	onMockAction: () => void;
} = $props();

const navigation = $derived([
	[Home, t.home],
	[TrendingUp, t.popular],
	[Layers, t.all],
	[Search, t.explore],
] as const);
</script>

{#snippet section(title: string)}
	<p class="mb-1 px-3 text-[10px] font-bold tracking-wider text-[#878A8C] uppercase">{title}</p>
{/snippet}

{#snippet content()}
	<div class="flex h-full flex-col overflow-y-auto bg-white text-sm">
		<nav class="border-b border-[#EDEFF1] p-2 pt-3">
			{#each navigation as [ Icon, label ]}
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-md px-3 py-2 font-medium transition-colors hover:bg-[#F6F7F8]"
					onclick={onMockAction}
				>
					<Icon size={18} class="shrink-0 text-[#878A8C]" aria-hidden="true" />
					{label}
				</button>
			{/each}
		</nav>

		<div class="border-b border-[#EDEFF1] p-2 pt-3">
			{@render section(t.gamesOnReddit)}
			{#each FEATURED_GAMES as game}
				<button
					type="button"
					class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 transition-colors hover:bg-[#F6F7F8]"
					onclick={onMockAction}
				>
					<span
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white"
						style:background-color={game.color}
						aria-hidden="true"
					>
						{game.abbr}
					</span>
					<span class="min-w-0 text-left">
						<span class="block truncate text-xs font-semibold">{game.name}</span>
						<span class="block truncate text-[10px] text-[#878A8C]">{game.tagline}</span>
					</span>
				</button>
			{/each}
			<button
				type="button"
				class="mt-1 w-full rounded-md px-3 py-1.5 text-left text-xs font-semibold text-[#0079D3] hover:underline"
				onclick={onMockAction}
			>
				{t.discoverMore}
			</button>
		</div>

		<div class="border-b border-[#EDEFF1] p-2 pt-3">
			{@render section(t.customFeeds)}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-[#0079D3] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<Plus size={14} aria-hidden="true" />
				{t.createCustomFeed}
			</button>
		</div>

		<div class="border-b border-[#EDEFF1] p-2 pt-3">
			{@render section(t.communities)}
			<div class="flex w-full items-center gap-2.5 rounded-md bg-[#F6F7F8] px-3 py-2" aria-current="page">
				<span
					class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white {getAvatarColor(subreddit)}"
					aria-hidden="true"
				>
					{subreddit.charAt(0).toUpperCase()}
				</span>
				<span class="truncate text-xs font-semibold">r/{subreddit}</span>
			</div>
			<button
				type="button"
				class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-[#0079D3] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<Plus size={14} aria-hidden="true" />
				{t.createCommunity}
			</button>
		</div>

		<div class="p-2 pt-3">
			{@render section(t.resources)}
			{#each [t.aboutReddit, t.advertise, t.helpCenter] as label}
				<button
					type="button"
					class="w-full rounded-md px-3 py-1.5 text-left text-xs text-[#878A8C] transition-colors hover:bg-[#F6F7F8] hover:text-[#1C1C1C]"
					onclick={onMockAction}
				>
					{label}
				</button>
			{/each}
		</div>

		<div class="mt-auto border-t border-[#EDEFF1] p-3">
			<div class="mb-2 flex items-center gap-2 px-2 py-1.5">
				<span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF4500] text-xs font-bold text-white">
					{#if avatarUrl}
						<img src={avatarUrl} alt="" class="h-full w-full object-cover">
					{:else}
						{userName.charAt(0).toUpperCase()}
					{/if}
				</span>
				<span class="truncate text-xs font-semibold">{userName}</span>
			</div>
			<a href={returnHref} class="flex min-h-11 items-center gap-1.5 px-2 text-xs font-medium text-[#FF4500] hover:underline">
				<LogOut size={12} aria-hidden="true" />
				{translate(language, "practice.returnToTask")}
			</a>
		</div>
	</div>
{/snippet}

{#if showMobileMenu}
	<button
		type="button"
		class="fixed inset-0 z-[1001] bg-black/50 md:hidden"
		onclick={onCloseMobileMenu}
		aria-label={translate(language, "common.close")}
		transition:fade={{ duration: 150 }}
	></button>
	<div class="fixed inset-y-0 left-0 z-[1002] w-64 md:hidden" transition:fly={{ x: -256, duration: 220 }}>{@render content()}</div>
{/if}

<div class="hidden w-[220px] shrink-0 border-r border-[#EDEFF1] md:block">{@render content()}</div>
