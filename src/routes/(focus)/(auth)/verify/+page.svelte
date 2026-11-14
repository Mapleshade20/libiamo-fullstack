<script lang="ts">
import MailCheck from "@lucide/svelte/icons/mail-check";
import MailClock from "@lucide/svelte/icons/mail-clock";
import { onMount } from "svelte";
import { account, auth, enter, hydrate, resendVerification, atx as tx } from "#lib/account/account.svelte.ts";
import MarkedLine from "#lib/components/common/MarkedLine.svelte";
import Notice from "#lib/components/common/Notice.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { toast } from "#lib/demo/app.svelte.ts";
import { page } from "$app/state";

/*
 * After signing up: the address the link went to, a way to send it again (after a minute) or to use another address.
 * The link signs in and comes back here (`done`), going on to set up; if it was opened in another tab, this one follows
 * when it is looked at again. A link that no longer works comes back with `error`, with a new one a press away.
 */
const email = $derived(auth.email || account.me.email);
let expired = $state(page.url.searchParams.has("error"));
const again = page.url.searchParams.has("again");
let wait = $state(60);
let sentAgain = $state(false);
onMount(() => {
	const id = setInterval(() => wait > 0 && wait--, 1000);
	if (page.url.searchParams.has("done") && !expired && account.signedIn) {
		toast(tx("auVerDone"));
		enter();
	}
	// Confirmed in another tab: on with it here too.
	const look = async () => {
		if (document.visibilityState !== "visible" || expired) return;
		await hydrate();
		if (account.signedIn && account.me.verified) enter();
	};
	document.addEventListener("visibilitychange", look);
	return () => {
		clearInterval(id);
		document.removeEventListener("visibilitychange", look);
	};
});
async function resend() {
	wait = 60;
	sentAgain = true;
	expired = false;
	await resendVerification(email);
}
$effect(() => {
	document.title = `${tx("auVerTitleShort")} · Libiamo`;
});
</script>

{#if expired}
	<span class="tile warn" aria-hidden="true"><MailClock class="size-6" strokeWidth={1.6} /></span>
	<h1><MarkedLine text={tx("auExpTitle")} /></h1>
	<p class="lede">{tx("auVerExpLede")}</p>
	<Button class="go" onclick={resend}>{tx("auVerResend")}</Button>
{:else}
	<span class="tile" aria-hidden="true"><MailCheck class="size-6" strokeWidth={1.6} /></span>
	<h1><MarkedLine text={tx("auVerTitle")} type="circle" /></h1>
	<p class="lede">{tx("auVerLede")}</p>
	{#if again}
		<Notice tone="info" role="status" class="mb-5">{tx("auVerAgain")}</Notice>
	{/if}
	<div class="addr">
		<b>{email}</b>
		<a class="text-link" href="/sign-up" onclick={() => (auth.email = "")}>{tx("auVerOther")}</a>
	</div>
	<p class="help spam" role="status">{sentAgain && wait > 55 ? tx("auVerSent") : tx("auVerSpam")}</p>
	<Button variant="secondary" disabled={wait > 0} onclick={resend}>
		{wait > 0 ? tx("auVerResendIn", { s: wait }) : tx("auVerResend")}
	</Button>
{/if}
<p class="foot"><a href="/sign-in">{tx("auBack")}</a></p>

<style>
.addr {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 4px 14px;
	padding: 12px 14px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--ink) 4%, transparent);
	font-size: 15px;
	overflow-wrap: anywhere;
}
.addr a {
	font-size: 13.5px;
	font-weight: 400;
}
.spam {
	margin: 14px 0 12px;
}
</style>
