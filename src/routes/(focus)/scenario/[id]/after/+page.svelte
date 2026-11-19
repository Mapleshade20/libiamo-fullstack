<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import { untrack } from "svelte";
import { fly } from "svelte/transition";
import { app } from "#lib/account/app.svelte.ts";
import FocusBar from "#lib/components/shell/FocusBar.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { afterPlace, readInPlace } from "#lib/exchange/exchange.remote.ts";
import { tx } from "#lib/i18n/tx.ts";
import { scenarioHref, scenarioLang } from "#lib/scenario/href.ts";
import { startPiece } from "#lib/session/start.ts";
import type { Setup } from "#lib/session/types.ts";
import { siteOf } from "#lib/writing/sites.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * Out of the place: how it ended, before any correcting. First the thread as the learner left it (what they sent, how
 * the others took it), so the social outcome is felt as its own thing; then the way on: going over what they wrote, in
 * the same two passes as any writing, on the same piece. What was sent stays as it was; the passes are for the next
 * time they say it. "Later" keeps the piece open on the shelf. A translation never comes here: it is written on its own
 * sheet (../translate) and goes from there into the revision.
 */
const id = $derived(page.params.id ?? "");
const lang = $derived(scenarioLang(page.url, app.lang));
const after = $derived(await afterPlace({ scenarioId: id, lang }));
const st = $derived(siteOf(after?.site));
const chat = $derived(after?.place === "discord" || after?.place === "imessage");
// Nothing to look back on yet: the exchange goes on in its place (or was never begun).
$effect(() => {
	if (!after) goto(`/scenario/${id}`, { replace: true });
	else if (after.open) goto(scenarioHref(id, "play", lang), { replace: true });
});

// The thread shows every reply: they are read now (the home page stops announcing them).
$effect(() => {
	if (!after || after.open || !after.latestReplyId) return;
	const seen = { exchangeId: after.exchangeId, messageId: after.latestReplyId };
	untrack(() => void readInPlace(seen));
});

let starting = $state(false);
async function review() {
	if (!after || starting) return;
	starting = true;
	// The server reads the conversation from the place itself.
	const pieceId = await startPiece({
		pieceId: after.pieceId,
		learner: app.prefs.native,
		feedback: app.prefs.feedback as Setup["feedback"],
	}).catch(() => null);
	starting = false;
	if (!pieceId) return toast(tx("startFailed"));
	goto(`/live/${pieceId}`);
}
$effect(() => {
	document.title = `${after?.title ?? ""} · ${tx("homeTitle")}`;
});
</script>

<FocusBar exit={{ label: tx("afterLater"), onclick: () => goto("/") }} />
{#if after && !after.open}
	<main class="after" style:--tone={st.tone} style:--deep={st.deep}>
		<p class="kicker">{after.site} · {after.title}</p>
		<h1>{tx("afterTitle")}</h1>

		<section class="thread" class:chat aria-label={tx("afterThread")}>
			{#each after.thread as m, i}
				<div class="msg" class:mine={m.me} in:fly={{ y: 8, duration: 300, delay: 150 + i * 120 }}>
					<span class="who">{m.me ? tx("afterYou") : m.author}</span>
					<p>{m.text}</p>
				</div>
			{/each}
		</section>

		<section class="next" in:fly={{ y: 10, duration: 350, delay: 250 + after.thread.length * 120 }}>
			<h2>{tx("afterNextTitle")}</h2>
			<p class="set-out">{tx("afterGoals")}</p>
			<ul class="goals">
				{#each after.handoff.exchange.scene.goals as g}
					<li>{g}</li>
				{/each}
			</ul>
			<div class="actions">
				<Button onclick={review} disabled={starting}>{tx("afterReview")}<ArrowRight aria-hidden="true" /></Button>
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
.next .set-out {
	margin: 0 0 2px;
	font-size: 13px;
	color: var(--muted);
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
