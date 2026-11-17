<script lang="ts">
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Send from "@lucide/svelte/icons/send";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { tx } from "#lib/i18n/tx.ts";
import { siteOf } from "#lib/writing/sites.ts";
import type { FollowUp } from "#lib/writing/types.ts";
import { setPosted } from "#lib/writing/writing.svelte.ts";

/*
 * The shelf's follow-up: one piece, one question. Whether it was posted (answered in place; the card then gives way),
 * or, a few days on, an invitation to write it again from memory. Same footprint as a scenario card, so the shelf keeps
 * its rhythm; a letter-paper face instead of a cover, so it reads as the learner's own, not a prompt.
 */
let { f }: { f: FollowUp } = $props();
const st = $derived(siteOf(f.w.site));
function answer(v: "yes" | "not-yet" | "no") {
	setPosted(f.w.id, v).then(
		() => toast(tx(v === "yes" ? "pcPostedThanks" : "fuNoted")),
		() => toast(tx("error")),
	);
}
</script>

<article class="follow" style:--tone={st.tone} style:--deep={st.deep}>
	<div class="face">
		<span class="ic" aria-hidden="true"
			>{#if f.kind === "posted"}
				<Send class="size-5" />
			{:else}
				<RotateCcw class="size-5" />
			{/if}</span
		>
		<span class="site">{f.w.site}</span>
	</div>
	<div class="body">
		{#if f.kind === "posted"}
			<h3>{tx("fuPostedQ")}</h3>
			<p><a href="/w/{f.w.id}">{f.w.title}</a></p>
			<div class="answers">
				<Button size="sm" onclick={() => answer("yes")}>{tx("fuYes")}</Button>
				<Button size="sm" variant="ghost" onclick={() => answer("not-yet")}>{tx("fuNotYet")}</Button>
				<Button size="sm" variant="ghost" class="text-muted-foreground" onclick={() => answer("no")}>{tx("fuNo")}</Button>
			</div>
		{:else}
			<h3>{tx("fuAgainTitle")}</h3>
			<p>{tx("fuAgainLine", { title: f.w.title })}</p>
			<div class="answers"><Button size="sm" variant="secondary" href="/w/{f.w.id}/again">{tx("fuAgainGo")}</Button></div>
		{/if}
	</div>
</article>

<style>
.follow {
	display: flex;
	flex-direction: column;
	min-height: 272px;
	border: 1px solid var(--edge);
	box-shadow: var(--lift);
	border-radius: 6px;
	background: var(--card-bg);
	overflow: hidden;
}
/* Ruled letter paper in the place's colour, with the action's icon pinned to it. */
.face {
	position: relative;
	height: 118px;
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	padding: 12px 14px;
	background:
		repeating-linear-gradient(transparent 0 21px, color-mix(in srgb, var(--ink) 9%, transparent) 21px 22px),
		color-mix(in srgb, var(--tone) 55%, var(--raised));
}
:global([data-theme="dark"]) .face {
	background: repeating-linear-gradient(transparent 0 21px, rgb(255 255 255 / 0.06) 21px 22px), var(--deep);
}
.ic {
	position: absolute;
	top: 12px;
	right: 14px;
	display: grid;
	place-items: center;
	width: 38px;
	height: 38px;
	border-radius: 50%;
	background: var(--raised);
	color: var(--mark);
	box-shadow: var(--lift);
	rotate: -8deg;
}
.site {
	padding: 2px 6px 0;
	margin-inline-start: -6px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--tone) 55%, var(--raised));
	font-family: var(--font-serif-stack);
	font-size: 20px;
	line-height: 1;
	color: var(--ink-2);
}
.body {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 13px 15px 14px;
}
h3 {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	line-height: 1.35;
}
p {
	margin: 0;
	color: var(--muted);
	font-size: 13px;
	line-height: 1.5;
}
p a {
	color: var(--ink-2);
}
.answers {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: auto;
	padding-top: 8px;
}
@media (max-width: 640px) {
	.follow {
		flex-direction: row;
		min-height: 0;
	}
	.face {
		width: 88px;
		height: auto;
		min-height: 104px;
		flex: none;
		justify-content: center;
		align-items: center;
	}
	.ic {
		position: static;
	}
	.site {
		display: none;
	}
}
</style>
