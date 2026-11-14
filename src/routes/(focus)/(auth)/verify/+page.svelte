<script lang="ts">
import MailCheck from "@lucide/svelte/icons/mail-check";
import MailClock from "@lucide/svelte/icons/mail-clock";
import { onMount } from "svelte";
import { dev } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import MarkedLine from "$lib/components/common/MarkedLine.svelte";
import Notice from "$lib/components/common/Notice.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { account, auth, confirmEmail, enter, atx as tx } from "$lib/demo/account.svelte";
import { toast } from "$lib/demo/app.svelte";

/*
 * After signing up: the address the link went to, a way to send it again (after a minute) or to use another address.
 * Opening the link signs in and goes on to set up; if it was opened in another tab, this one follows. An expired link
 * lands here too, with a new one a press away.
 */
const email = $derived(auth.email || account.me.email);
let expired = $state(page.url.searchParams.has("expired"));
const again = page.url.searchParams.has("again");
let wait = $state(60);
let sentAgain = $state(false);
onMount(() => {
	const id = setInterval(() => wait > 0 && wait--, 1000);
	return () => clearInterval(id);
});
function resend() {
	wait = 60;
	sentAgain = true;
	expired = false;
}
// Confirmed in another tab: on with it here too.
$effect(() => {
	if (account.signedIn && account.me.verified && !page.url.searchParams.has("expired")) enter();
});
function open() {
	toast(tx("auVerDone"));
	confirmEmail();
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
{#if dev}
	<!-- Debug only: what the mail's link would do. -->
	<p class="devbar">
		<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={open}>{tx("devOpenLink")}</Button>
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground"
			onclick={() => goto("/verify?expired", { replaceState: true }).then(() => (expired = true))}
			>{tx("devExpiredLink")}</Button
		>
	</p>
{/if}

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
