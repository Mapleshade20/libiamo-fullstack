<script lang="ts">
import type { Component } from "svelte";
import { account } from "#lib/account/account.svelte.ts";
import type { ExchangeApi } from "#lib/components/exchange/actions.ts";
import ConversationReadReceipt from "#lib/components/exchange/ConversationReadReceipt.svelte";
import type { SurfaceProps } from "#lib/components/exchange/controller.svelte.ts";
import AO3UI from "#lib/components/exchange/places/ao3/AO3UI.svelte";
import DiscordUI from "#lib/components/exchange/places/discord/DiscordUI.svelte";
import MailUI from "#lib/components/exchange/places/email/MailUI.svelte";
import IMessageUI from "#lib/components/exchange/places/imessage/IMessageUI.svelte";
import RedditUI from "#lib/components/exchange/places/reddit/RedditUI.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import type { ExchangePlace } from "#lib/constants.ts";
import { app, forget, read, tx } from "#lib/demo/app.svelte.ts";
import { enterPlace, finishPlace, hintInPlace, placeOf, readInPlace, sendToPlace } from "#lib/exchange/exchange.remote.ts";
import { loadLang } from "#lib/i18n/index.svelte.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * The scenario's place itself: its AO3, Reddit, mail, Discord or iMessage, with the cast answering from the server.
 * Going in opens the piece and its exchange (the plan typed on the scenario page goes with it); the page polls while
 * the cast is composing, and ending it leads to the after page.
 */
const SURFACES: Record<ExchangePlace, Component<SurfaceProps>> = {
	ao3: AO3UI,
	reddit: RedditUI,
	email: MailUI,
	discord: DiscordUI,
	imessage: IMessageUI,
};

const id = $derived(page.params.id ?? "");
const where = $derived({ scenarioId: id, lang: app.lang });
// Read without awaiting: the page polls this query while the cast composes, and an awaited refresh is an async batch
// that a click landing at the same moment rebases (sveltejs/svelte#18895 leaves the place's effects unrun).
const place = $derived(placeOf(where));
const view = $derived(place.current);
// The place speaks the language learnt, whatever the interface's.
$effect(() => {
	if (view) void loadLang(view.language);
});
const exchangeId = () => view?.persisted?.id ?? null;
const planKey = $derived(`scenarioPlan:${id}`);

const api: ExchangeApi = {
	async start() {
		await enterPlace({ ...where, plan: read<string>(planKey, "") });
		forget(planKey);
	},
	async send(fields) {
		const ex = exchangeId();
		return ex === null ? { status: "failed" } : sendToPlace({ exchangeId: ex, fields });
	},
	async finish() {
		const ex = exchangeId();
		if (ex !== null) await finishPlace(ex);
	},
	async refresh() {
		await place.refresh();
	},
	async hint(input) {
		const ex = exchangeId();
		if (ex === null) return {};
		return hintInPlace({ exchangeId: ex, ...input });
	},
	async read(messageId) {
		const ex = exchangeId();
		if (ex === null) return;
		const r = await readInPlace({ exchangeId: ex, messageId });
		if (r.worldScheduled) await place.refresh();
	},
};
const Surface = $derived(view ? SURFACES[view.place] : null);
// An exchange already over is read on the after page.
$effect(() => {
	if (view?.persisted && view.persisted.status !== "in_progress") goto(`/scenario/${id}/after`, { replaceState: true });
});
$effect(() => {
	document.title = `${view?.title ?? ""} · ${tx("homeTitle")}`;
});
</script>

{#if view && Surface}
	<ConversationReadReceipt exchangeId={view.persisted?.id ?? null} messageId={view.latestReplyId} read={api.read} />
	{#key view.scenarioId}
		<Surface
			scenarioId={view.scenarioId}
			userName={account.me.name}
			avatarUrl={app.prefs.avatar ?? ""}
			language={view.language}
			persisted={view.persisted}
			openingState={view.openingState}
			maxTurns={view.maxTurns}
			returnHref="/scenario/{view.scenarioId}"
			afterHref="/scenario/{view.scenarioId}/after"
			{api}
		/>
	{/key}
{:else if !place.loading}
	<main class="grid min-h-dvh place-items-center">
		<EmptyState art="clink" title={tx("qMissing")} action={{ label: tx("shelfAll"), href: "/library" }} />
	</main>
{/if}
