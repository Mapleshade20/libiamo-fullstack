<script lang="ts">
import { onMount } from "svelte";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import Button from "$lib/components/ui/button/button.svelte";
import { app, tx } from "$lib/demo/app.svelte";
import { siteOf } from "$lib/demo/data";
import { SIMS, scenarioById } from "$lib/demo/scenarios";

/*
 * Stands in for the simulation. In the main app this is the place itself (its AO3, Reddit, Discord, iMessage or mail
 * surface, with the cast answering); the demo designs what comes before and after it, so here the place only passes:
 * a few seconds, or a skip, and the learner has been there.
 */
const scenario = $derived(scenarioById(page.params.id ?? ""));
const sim = $derived(scenario ? SIMS[scenario.id] : undefined);
const st = $derived(siteOf(scenario?.site));
const LENGTH = 6000;
const leave = () => goto(`/scenario/${page.params.id}/after`, { replaceState: true });
onMount(() => {
	const t = setTimeout(leave, LENGTH);
	return () => clearTimeout(t);
});
</script>

<main class="play" style:--tone={st.tone} style:--deep={st.deep} style:--length="{LENGTH}ms">
	<div class="window">
		<div class="chrome">
			<span class="site">{scenario?.site}</span>
			<span class="grow"></span>
			<Button variant="ghost" size="sm" onclick={leave}>{tx("playSkip")}</Button>
		</div>
		<div class="inside">
			<p class="caption">{tx("playCaption", { site: scenario?.site ?? "" })}</p>
			<p class="title">{scenario?.title[app.lang] ?? ""}</p>
			<div class="cast" aria-hidden="true">
				{#each sim?.cast ?? [] as c, i}
					<span class="person" style:--i={i}
						><span class="avatar">{c.name.replace(/^u\//, "").slice(0, 1).toUpperCase()}</span><span class="dots"><i></i><i></i><i></i></span></span
					>
				{/each}
			</div>
			<div class="track" role="progressbar" aria-label={tx("playCaption", { site: scenario?.site ?? "" })}><i></i></div>
		</div>
	</div>
</main>

<style>
.play {
	min-height: 100dvh;
	display: grid;
	place-items: center;
	padding: 24px;
	background: color-mix(in srgb, var(--tone) 35%, var(--bg));
}
:global([data-theme="dark"]) .play {
	background: color-mix(in srgb, var(--deep) 45%, var(--bg));
}
.window {
	width: min(640px, 100%);
	border-radius: 6px;
	background: var(--raised);
	box-shadow: var(--pop);
	overflow: hidden;
	animation: rise 400ms var(--ease-panel);
}
@keyframes rise {
	from {
		opacity: 0;
		transform: translateY(10px) scale(0.98);
	}
}
.chrome {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px 8px 18px;
	border-bottom: 1px solid var(--line-soft);
	background: color-mix(in srgb, var(--tone) 40%, var(--raised));
}
:global([data-theme="dark"]) .chrome {
	background: var(--deep);
}
.site {
	font: 500 18px var(--font-serif-stack);
}
.grow {
	flex: 1;
}
.inside {
	padding: 36px 28px 30px;
	text-align: center;
}
.caption {
	margin: 0;
	font-size: 13px;
	color: var(--muted);
}
.title {
	margin: 6px 0 22px;
	font: 500 22px / 1.3 var(--font-serif-stack);
}
.cast {
	display: flex;
	justify-content: center;
	gap: 22px;
	margin-bottom: 28px;
}
.person {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	animation: rise 400ms var(--ease-panel) calc(200ms + var(--i) * 140ms) both;
}
.avatar {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--tone) 70%, var(--raised));
	font-weight: 600;
	color: #3d3d3a;
}
.dots {
	display: inline-flex;
	gap: 3px;
}
.dots i {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--muted);
	animation: breathe 1.2s ease-in-out infinite;
}
.dots i:nth-child(2) {
	animation-delay: 0.15s;
}
.dots i:nth-child(3) {
	animation-delay: 0.3s;
}
@keyframes breathe {
	50% {
		opacity: 0.25;
	}
}
.track {
	height: 3px;
	border-radius: 3px;
	background: var(--line-soft);
	overflow: hidden;
}
.track i {
	display: block;
	height: 100%;
	background: var(--wine);
	transform-origin: left;
	animation: fill var(--length) linear both;
}
@keyframes fill {
	from {
		transform: scaleX(0);
	}
}
</style>
