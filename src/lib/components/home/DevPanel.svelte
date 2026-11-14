<script lang="ts">
import { backdropState } from "#lib/components/backdrop/state.svelte.ts";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { markAllUnread } from "#lib/demo/announcements.ts";
import { tx } from "#lib/demo/app.svelte.ts";
import { dev, saveDev } from "#lib/demo/dev.svelte.ts";
import { onboarding, replayWelcome } from "#lib/demo/onboarding.svelte.ts";
import { goto } from "$app/navigation";

/* Debug only (not part of the product): test drafts, which models the demo calls, and ways to see what would otherwise
   take days or minutes. The learner's own choices are on the settings page. */
let { onfixture }: { onfixture: (f: { text: string; background?: string }) => void } = $props();
type Fixture = { id: string; title: string; text: string; background: string };
let fixtures = $state<Fixture[]>([]);
fetch("/api/fixtures")
	.then((r) => r.json())
	.then(
		(f) => (fixtures = f),
		() => {},
	);
$effect(() => saveDev());
function step(d: number) {
	dev.imageOffset = d === 0 ? 0 : dev.imageOffset + d;
	saveDev();
	backdropState.version++;
}
</script>

<details class="dev">
	<summary>{tx("devTitle")}</summary>
	<div class="dev-body">
		<div>
			<span class="label">{tx("useFixture")}</span>
			<div class="pills">
				{#each fixtures as f (f.id)}
					<button type="button" class="pill" onclick={() => onfixture(f)}>{f.title || f.id}</button>
				{/each}
			</div>
		</div>
		<div>
			<span class="label">{tx("model")}</span>
			<SegmentedControl
				label={tx("model")}
				size="sm"
				bind:value={dev.model}
				items={[
					{ value: "deepseek", label: "deepseek" },
					{ value: "haiku", label: "haiku" },
				]}
			/>
		</div>
		<div>
			<span class="label">{tx("grader")}</span>
			<SegmentedControl
				label={tx("grader")}
				size="sm"
				bind:value={dev.grader}
				items={[
					{ value: "haiku", label: tx("graderHaiku") },
					{ value: "deepseek", label: tx("graderDeepseek") },
				]}
			/>
		</div>
		<div>
			<span class="label">{tx("cache")}</span>
			<SegmentedControl
				label={tx("cache")}
				size="sm"
				bind:value={dev.cache}
				items={[
					{ value: "on", label: tx("cacheOn") },
					{ value: "off", label: tx("cacheOff") },
				]}
			/>
		</div>
		<div>
			<span class="label">{tx("devImage")}</span>
			<div class="flex items-center gap-2">
				<Button variant="secondary" size="sm" aria-label={tx("devImagePrev")} onclick={() => step(-1)}>‹</Button>
				<Button variant="secondary" size="sm" onclick={() => step(0)}>{tx("devImageToday")}</Button>
				<Button variant="secondary" size="sm" aria-label={tx("devImageNext")} onclick={() => step(1)}>›</Button>
				<span class="label m-0">{tx("devImageOffset", { n: dev.imageOffset })}</span>
			</div>
		</div>
		<div>
			<span class="label">{tx("devReview")}</span>
			<SegmentedControl
				label={tx("devReview")}
				size="sm"
				value={String(dev.reviewEvery)}
				onValueChange={(v) => (dev.reviewEvery = Number(v))}
				items={[
					{ value: "30", label: "30 s" },
					{ value: "5", label: "5 s" },
				]}
			/>
		</div>
		<div>
			<span class="label">{tx("devLimits")}</span>
			<SegmentedControl
				label={tx("devLimits")}
				size="sm"
				bind:value={dev.limit}
				items={[
					{ value: "none", label: tx("devLimitNone") },
					{ value: "nokey", label: tx("devLimitNoKey") },
					{ value: "refused", label: tx("devLimitRefused") },
					{ value: "fail", label: tx("devLimitFail") },
				]}
			/>
		</div>
		<div>
			<span class="label">{tx("devAnnouncements")}</span><Button variant="secondary" size="sm" onclick={markAllUnread}>{tx("devUnread")}</Button>
		</div>
		<div>
			<span class="label">{tx("devWelcome")}</span>
			<div class="flex gap-2">
				<Button
					variant="secondary"
					size="sm"
					onclick={() => {
						replayWelcome();
						goto("/welcome");
					}}
					>{tx("devWelcomeGo")}</Button
				>
				<Button variant="secondary" size="sm" onclick={() => (onboarding.tour = true)}>{tx("devTourGo")}</Button>
			</div>
		</div>
	</div>
</details>

<style>
/* At the foot of the model calls' corner (debug/calls.css). Open, it stands over them. */
.dev {
	position: fixed;
	left: calc(var(--side, 0px) + 14px);
	bottom: 14px;
	z-index: 20;
	display: flex;
	flex-direction: column-reverse;
	align-items: flex-start;
	max-width: min(460px, calc(100vw - 28px));
	font-size: 13px;
}
.dev > summary {
	list-style: none;
	display: inline-flex;
	align-items: center;
	height: 32px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--raised);
	color: var(--muted);
	cursor: pointer;
	box-shadow: var(--shadow);
	transition: opacity 0.2s ease;
}
.dev[open] {
	z-index: 85;
}
.dev > summary::-webkit-details-marker {
	display: none;
}
.dev[open] > summary {
	color: var(--ink);
}
.dev-body {
	margin-bottom: 8px;
	padding: 14px;
	border-radius: 6px;
	background: var(--raised);
	box-shadow: var(--pop);
	display: grid;
	gap: 12px;
	max-height: 70vh;
	overflow: auto;
}
.label {
	display: block;
	font-size: 13px;
	color: var(--muted);
	margin: 0 0 5px;
}
.pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.pill {
	border: 1px solid var(--line);
	border-radius: 6px;
	padding: 3px 10px;
	background: transparent;
	cursor: pointer;
	font-size: 12.5px;
	color: var(--ink-2);
	transition: background-color 150ms;
}
.pill:hover {
	background: var(--hover);
}
@media (max-width: 640px) {
	.dev {
		bottom: 10px;
		right: 10px;
	}
}
</style>
