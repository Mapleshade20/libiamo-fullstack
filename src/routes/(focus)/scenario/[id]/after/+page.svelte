<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import { fly } from "svelte/transition";
import FocusBar from "#lib/components/shell/FocusBar.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { app, read, tx } from "#lib/demo/app.svelte.ts";
import { HANDOFF_KEY, myWriting, recordWriting, siteOf } from "#lib/demo/data.ts";
import { dev } from "#lib/demo/dev.svelte.ts";
import { exchangeOf, SIMS, scenarioById, simTurns, situationOf, situationText } from "#lib/demo/scenarios.ts";
import { SEP } from "#lib/session/types.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * Out of the place: how it ended, before any correcting. First the thread as the learner left it (what they sent, how
 * the others took it), so the social outcome is felt as its own thing; then the way on: going over what they wrote, in
 * the same two passes as any writing. What was sent stays as it was; the passes are for the next time they say it.
 * "Later" keeps the piece open on the shelf. A translation never comes here: it is written on its own sheet
 * (../translate) and goes from there into the revision.
 */
const scenario = $derived(scenarioById(page.params.id ?? ""));
const sim = $derived(scenario ? SIMS[scenario.id] : undefined);
const st = $derived(siteOf(scenario?.site));
const chat = $derived(scenario?.site === "Discord" || scenario?.site === "iMessage");

// The scenario's piece when it was set aside before (on the shelf, in My writing): coming back works on that one.
const kept = $derived(scenario ? myWriting().find((w) => w.scenarioId === scenario.id && w.open) : undefined);
function handoff() {
	if (!scenario || !sim) return null;
	const s = situationOf(scenario);
	// A scenario in a place goes in as the exchange it was (src/scenario/exchange.ts); the learner's turns are the text.
	const exchange = exchangeOf(scenario, sim, app.prefs.name || "me");
	const thread = simTurns(sim)
		.map((m) => `${m.me ? "maple" : m.author}: ${m.text}`)
		.join("\n");
	const plan = read<string>(`scenarioPlan:${scenario.id}`, "");
	return {
		text: exchange
			? exchange.transcript
					.filter((m) => m.learner)
					.map((m) => m.text)
					.join(`\n\n${SEP}\n\n`)
			: sim.mine.join("\n\n"),
		exchange,
		background: [scenario.brief[app.lang] ?? scenario.brief.en, plan && `My plan: ${plan}`].filter(Boolean).join("\n\n"),
		source: `${s ? situationText(s) : ""}\n\nThe conversation:\n${thread}`,
		scenario: { id: scenario.id, title: scenario.title[app.lang], site: scenario.site },
		...$state.snapshot(dev),
		learner: app.prefs.native,
		feedback: app.prefs.feedback,
		lang: app.lang,
		pieceId: kept?.id,
	};
}
function review() {
	const h = handoff();
	if (!h) return;
	sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(h));
	goto("/live");
}
function later() {
	const h = handoff();
	if (!h || !scenario) return;
	recordWriting({
		id: kept?.id ?? `q-${scenario.id}-${Date.now()}`,
		title: scenario.title[app.lang],
		site: scenario.site,
		lang: app.lang,
		open: true,
		scenarioId: scenario.id,
		handoff: h,
	});
	goto("/");
}
$effect(() => {
	document.title = `${scenario?.title[app.lang] ?? ""} · ${tx("homeTitle")}`;
});
</script>

<FocusBar exit={{ label: tx("afterLater"), onclick: later }} />
{#if scenario && sim}
	<main class="after" style:--tone={st.tone} style:--deep={st.deep}>
		<p class="kicker">{scenario.site} · {scenario.title[app.lang]}</p>
		<h1>{tx("afterTitle")}</h1>

		<section class="thread" class:chat aria-label={tx("afterThread")}>
			{#each simTurns(sim) as m, i}
				<div class="msg" class:mine={m.me} in:fly={{ y: 8, duration: 300, delay: 150 + i * 120 }}>
					<span class="who">{m.me ? tx("afterYou") : m.author}</span>
					<p>{m.text}</p>
				</div>
			{/each}
		</section>

		<section class="next" in:fly={{ y: 10, duration: 350, delay: 250 + simTurns(sim).length * 120 }}>
			<h2>{tx("afterNextTitle")}</h2>
			<p class="set-out">{tx("afterGoals")}</p>
			<ul class="goals">
				{#each sim.goals as g}
					<li>{g}</li>
				{/each}
			</ul>
			<div class="actions">
				<Button onclick={review}>{tx("afterReview")}<ArrowRight aria-hidden="true" /></Button>
			</div>
		</section>
	</main>
{/if}

<style>
.after {
	width: min(680px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(20px, 7vh, 64px) 0 96px;
}
.kicker {
	margin: 0;
	font-size: 13px;
	color: var(--muted);
}
h1 {
	font-size: clamp(28px, 4vw, 36px);
	margin: 6px 0 22px;
}
.thread {
	display: grid;
	gap: 10px;
	padding: 18px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--tone) 30%, var(--raised));
	border: 1px solid var(--edge);
}
:global([data-theme="dark"]) .thread {
	background: color-mix(in srgb, var(--deep) 40%, var(--raised));
}
.msg {
	max-width: 88%;
	padding: 10px 14px;
	border-radius: 6px;
	background: var(--raised);
	box-shadow: var(--lift);
}
.msg p {
	margin: 2px 0 0;
	white-space: pre-wrap;
	font-size: 15px;
	line-height: 1.55;
}
.who {
	font-size: 12.5px;
	font-weight: 600;
	color: var(--ink-2);
}
/* What the learner sent sits on the right, as their own messages do in any place. */
.mine {
	justify-self: end;
	background: color-mix(in srgb, var(--ink) 6%, var(--raised));
}
.chat .msg {
	padding: 8px 12px;
}
.next {
	margin-top: 32px;
}
.next h2 {
	display: flex;
	align-items: center;
	margin-bottom: 10px;
}
.next p {
	margin: 0 0 10px;
	color: var(--ink-2);
}
.set-out {
	margin: 0 0 2px !important;
	font-size: 13px;
	color: var(--muted) !important;
}
.goals {
	list-style: disc;
	margin: 0 0 20px;
	padding-inline-start: 18px;
	color: var(--muted);
	font-size: 14px;
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
</style>
