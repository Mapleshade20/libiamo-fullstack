<script lang="ts">
import CalendarDays from "@lucide/svelte/icons/calendar-days";
import Shield from "@lucide/svelte/icons/shield";
import Users from "@lucide/svelte/icons/users";
import { COMMUNITY_RULES, RELATED_SUBREDDITS } from "./data";
import { getAvatarColor, seededInt } from "./utils";

let {
	subreddit = "AskReddit",
	t = {} as Record<string, string>,
}: {
	subreddit?: string;
	t?: Record<string, string>;
} = $props();

const subredditColor = $derived(getAvatarColor(subreddit));
const memberCount = $derived(seededInt(subreddit, 10000, 4900000));
const onlineCount = $derived(seededInt(`${subreddit}_online`, 80, 12000));
// Deterministic creation year (between 2012 and 2021)
const createdYear = $derived(2012 + seededInt(`${subreddit}_year`, 0, 9));
// Pick 3 related subreddits from pool, avoiding the current one
const relatedSubs = $derived(
	RELATED_SUBREDDITS.filter((s) => s.toLowerCase() !== subreddit.toLowerCase())
		.slice(seededInt(subreddit, 0, 5), seededInt(subreddit, 3, 8))
		.slice(0, 3),
);

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}
</script>

<aside class="hidden w-[312px] shrink-0 flex-col gap-3 overflow-y-auto p-4 lg:flex hide-scrollbar">
	<!-- Community info card -->
	<div class="overflow-hidden rounded-md border border-[#CFDBD5] bg-white">
		<!-- Banner -->
		<div class="h-16 w-full {subredditColor} opacity-80"></div>
		<!-- Icon + join -->
		<div class="relative px-3 pb-3">
			<div
				class="absolute -top-5 left-3 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white {subredditColor} text-lg font-black text-white"
			>
				{subreddit.charAt(0).toUpperCase()}
			</div>
			<div class="flex items-start justify-between pt-9">
				<div>
					<p class="text-sm font-bold text-[#1C1C1C]">r/{subreddit}</p>
				</div>
				<button type="button" class="rounded-full bg-[#FF4500] px-4 py-1 text-xs font-bold text-white hover:bg-[#CC3700] transition-colors">
					{t.joinButton}
				</button>
			</div>

			<!-- Stats -->
			<div class="mt-3 grid grid-cols-2 gap-2 border-t border-[#EDEFF1] pt-3">
				<div class="flex flex-col items-center rounded-md bg-[#F6F7F8] p-2">
					<div class="mb-1 flex items-center gap-1 text-[#878A8C]"><Users size={12} /></div>
					<p class="text-sm font-bold text-[#1C1C1C]">{formatCount(memberCount)}</p>
					<p class="text-[10px] text-[#878A8C]">{t.membersLabel}</p>
				</div>
				<div class="flex flex-col items-center rounded-md bg-[#F6F7F8] p-2">
					<div class="mb-1 flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full bg-[#46D160]"></span></div>
					<p class="text-sm font-bold text-[#1C1C1C]">{formatCount(onlineCount)}</p>
					<p class="text-[10px] text-[#878A8C]">{t.online}</p>
				</div>
			</div>

			<!-- Created date -->
			<div class="mt-2 flex items-center gap-1.5 text-xs text-[#878A8C]">
				<CalendarDays size={12} />
				<span>Created {createdYear}</span>
			</div>
		</div>
	</div>

	<!-- Community rules -->
	<div class="overflow-hidden rounded-md border border-[#CFDBD5] bg-white">
		<div class="flex items-center gap-2 border-b border-[#EDEFF1] px-3 py-2.5">
			<Shield size={14} class="shrink-0 text-[#FF4500]" />
			<p class="text-sm font-bold text-[#1C1C1C]">{t.communityRules}</p>
		</div>
		<div class="divide-y divide-[#EDEFF1]">
			{#each COMMUNITY_RULES as rule, i}
				<div class="flex items-start gap-2.5 px-3 py-2">
					<span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#EDEFF1] text-[10px] font-bold text-[#878A8C]"
						>{i + 1}</span
					>
					<p class="text-xs leading-5 text-[#3C3C3C]">{rule}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- Related communities -->
	{#if relatedSubs.length > 0}
		<div class="overflow-hidden rounded-md border border-[#CFDBD5] bg-white">
			<p class="border-b border-[#EDEFF1] px-3 py-2.5 text-sm font-bold text-[#1C1C1C]">{t.relatedCommunities}</p>
			<div class="divide-y divide-[#EDEFF1]">
				{#each relatedSubs as sub}
					<div class="flex items-center justify-between px-3 py-2">
						<div class="flex items-center gap-2">
							<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {getAvatarColor(sub)} text-[10px] font-bold text-white">
								{sub.charAt(0).toUpperCase()}
							</div>
							<div>
								<p class="text-xs font-semibold text-[#0079D3]">r/{sub}</p>
								<p class="text-[10px] text-[#878A8C]">{formatCount(seededInt(sub, 5000, 3000000))} {t.membersLabel}</p>
							</div>
						</div>
						<button
							type="button"
							class="rounded-full border border-[#FF4500] px-3 py-0.5 text-[10px] font-bold text-[#FF4500] hover:bg-[#FFF2EE] transition-colors"
						>
							{t.joinButton}
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</aside>

<style>
.hide-scrollbar {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
