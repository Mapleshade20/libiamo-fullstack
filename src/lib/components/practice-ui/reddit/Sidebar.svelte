<script lang="ts">
import Home from "@lucide/svelte/icons/home";
import Layers from "@lucide/svelte/icons/layers";
import LogOut from "@lucide/svelte/icons/log-out";
import Plus from "@lucide/svelte/icons/plus";
import Search from "@lucide/svelte/icons/search";
import Settings from "@lucide/svelte/icons/settings";
import TrendingUp from "@lucide/svelte/icons/trending-up";
import { fade, fly } from "svelte/transition";
import { base } from "$app/paths";
import { FEATURED_GAMES } from "./data";
import { getAvatarColor } from "./utils";

let {
	t = {} as Record<string, string>,
	taskId = "" as string | number,
	returnHref = "",
	subreddit = "AskReddit",
	userName = "",
	avatarUrl = "",
	showMobileMenu = false,
	onCloseMobileMenu = () => {},
	onMockAction = () => {},
}: {
	t?: Record<string, string>;
	taskId?: string | number;
	returnHref?: string;
	subreddit?: string;
	userName?: string;
	avatarUrl?: string;
	showMobileMenu?: boolean;
	onCloseMobileMenu?: () => void;
	onMockAction?: () => void;
} = $props();

const subredditColor = $derived(getAvatarColor(subreddit));
</script>

{#snippet content()}
	<div class="flex h-full flex-col overflow-y-auto bg-white text-sm hide-scrollbar">
		<!-- Main navigation -->
		<nav class="border-b border-[#EDEFF1] p-2 pt-3">
			<button
				type="button"
				class="flex w-full items-center gap-3 rounded-md px-3 py-2 font-medium text-[#1C1C1C] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<Home size={18} class="shrink-0 text-[#878A8C]" />
				{t.home}
			</button>
			<button
				type="button"
				class="flex w-full items-center gap-3 rounded-md px-3 py-2 font-medium text-[#1C1C1C] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<TrendingUp size={18} class="shrink-0 text-[#878A8C]" />
				{t.popular}
			</button>
			<button
				type="button"
				class="flex w-full items-center gap-3 rounded-md px-3 py-2 font-medium text-[#1C1C1C] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<Layers size={18} class="shrink-0 text-[#878A8C]" />
				{t.all}
			</button>
			<button
				type="button"
				class="flex w-full items-center gap-3 rounded-md px-3 py-2 font-medium text-[#1C1C1C] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<Search size={18} class="shrink-0 text-[#878A8C]" />
				{t.explore}
			</button>
		</nav>

		<!-- Games on Reddit -->
		<div class="border-b border-[#EDEFF1] p-2 pt-3">
			<p class="mb-2 px-3 text-[10px] font-bold tracking-wider text-[#878A8C] uppercase">{t.gamesOnReddit}</p>
			{#each FEATURED_GAMES as game}
				<button
					type="button"
					class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 transition-colors hover:bg-[#F6F7F8]"
					onclick={onMockAction}
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white"
						style="background-color: {game.color}"
					>
						{game.abbr}
					</div>
					<div class="min-w-0 text-left">
						<p class="truncate text-xs font-semibold text-[#1C1C1C]">{game.name}</p>
						<p class="truncate text-[10px] text-[#878A8C]">{game.tagline}</p>
					</div>
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

		<!-- Custom Feeds -->
		<div class="border-b border-[#EDEFF1] p-2 pt-3">
			<p class="mb-1 px-3 text-[10px] font-bold tracking-wider text-[#878A8C] uppercase">{t.customFeeds}</p>
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-[#0079D3] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<Plus size={14} />
				{t.createCustomFeed}
			</button>
		</div>

		<!-- Communities -->
		<div class="border-b border-[#EDEFF1] p-2 pt-3">
			<p class="mb-1 px-3 text-[10px] font-bold tracking-wider text-[#878A8C] uppercase">{t.communities}</p>
			<!-- Active subreddit -->
			<button
				type="button"
				class="flex w-full items-center gap-2.5 rounded-md bg-[#F6F7F8] px-3 py-2 transition-colors hover:bg-[#EDEFF1]"
				onclick={onMockAction}
			>
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {subredditColor} text-[10px] font-bold text-white">
					{subreddit.charAt(0).toUpperCase()}
				</div>
				<span class="truncate text-xs font-semibold text-[#1C1C1C]">r/{subreddit}</span>
			</button>
			<button
				type="button"
				class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-[#0079D3] transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<Plus size={14} />
				{t.createCommunity}
			</button>
		</div>

		<!-- Resources -->
		<div class="p-2 pt-3">
			<p class="mb-1 px-3 text-[10px] font-bold tracking-wider text-[#878A8C] uppercase">{t.resources}</p>
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

		<!-- Footer: user profile + return to task -->
		<div class="mt-auto border-t border-[#EDEFF1] p-3">
			<button
				type="button"
				class="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[#F6F7F8]"
				onclick={onMockAction}
			>
				<div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF4500] text-xs font-bold text-white">
					{#if avatarUrl}
						<img src={avatarUrl} alt="avatar" class="h-full w-full object-cover">
					{:else}
						{userName.charAt(0).toUpperCase()}
					{/if}
				</div>
				<div class="min-w-0 text-left">
					<p class="truncate text-xs font-semibold text-[#1C1C1C]">{userName}</p>
				</div>
				<Settings size={14} class="ml-auto shrink-0 text-[#878A8C]" />
			</button>
			<a href={returnHref || `${base}/task/${taskId}`} class="flex items-center gap-1.5 px-2 text-xs font-medium text-[#FF4500] hover:underline">
				<LogOut size={12} />
				{t.returnTask}
			</a>
		</div>
	</div>
{/snippet}

<!-- Mobile overlay -->
{#if showMobileMenu}
	<div
		role="button"
		tabindex="-1"
		class="fixed inset-0 z-[1001] bg-black/50 md:hidden"
		onclick={onCloseMobileMenu}
		onkeydown={(e) => e.key === "Escape" && onCloseMobileMenu()}
		transition:fade={{ duration: 150 }}
	></div>
	<div class="fixed inset-y-0 left-0 z-[1002] w-64 md:hidden" transition:fly={{ x: -256, duration: 220 }}>{@render content()}</div>
{/if}

<!-- Desktop sidebar -->
<div class="hidden w-[220px] shrink-0 border-r border-[#EDEFF1] md:block">{@render content()}</div>

<style>
.hide-scrollbar {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
