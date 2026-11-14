<script lang="ts">
import MailClock from "@lucide/svelte/icons/mail-clock";
import { tick } from "svelte";
import { dev } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import PasswordField from "$lib/components/auth/PasswordField.svelte";
import MarkedLine from "$lib/components/common/MarkedLine.svelte";
import { shake } from "$lib/components/common/motion";
import Notice from "$lib/components/common/Notice.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { auth, atx as tx, weakPassword } from "$lib/demo/account.svelte";

/*
 * A forgotten password: the address, then the same answer whether or not it has an account. The mail's link comes back
 * here with a token: a new password, then signing in with it. A link that has expired says so and offers a new one.
 */
const token = $derived(page.url.searchParams.get("token"));
let sent = $state(false);
let password = $state("");
let field: HTMLInputElement | null = $state(null);
let error = $state<string | undefined>();

async function refuse(key: string) {
	error = key;
	await tick();
	field?.focus();
	shake(field);
}
function request(e: SubmitEvent) {
	e.preventDefault();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(auth.email.trim())) return refuse(auth.email.trim() ? "auEmailInvalid" : "auEmailMissing");
	sent = true;
}
function save(e: SubmitEvent) {
	e.preventDefault();
	const weak = password ? weakPassword(password, auth.email) : "auPwMissing";
	if (weak) return refuse(weak);
	goto("/sign-in?reset", { replaceState: true });
}
function again() {
	sent = false;
	goto("/forgot-password", { replaceState: true });
}
$effect(() => {
	document.title = `${tx(token ? "auRsTitleShort" : "auFgTitleShort")} · Libiamo`;
});
</script>

{#if token === "expired"}
	<span class="tile warn" aria-hidden="true"><MailClock class="size-6" strokeWidth={1.6} /></span>
	<h1><MarkedLine text={tx("auExpTitle")} /></h1>
	<p class="lede">{tx("auRsExpLede")}</p>
	<Button class="go" onclick={again}>{tx("auRsAgain")}</Button>
{:else if token}
	<h1><MarkedLine text={tx("auRsTitle")} /></h1>
	<p class="lede">{tx("auRsLede")}</p>
	<form novalidate onsubmit={save}>
		<!-- For password managers: which account the new password belongs to. -->
		<input type="email" autocomplete="username" value={auth.email} hidden>
		<div class="fld">
			<label class="lbl" for="password">{tx("auRsNew")}</label>
			<PasswordField
				id="password"
				autocomplete="new-password"
				bind:value={password}
				bind:input={field}
				invalid={!!error}
				describedby="pw-help"
				show={tx("auShowPw")}
				hide={tx("auHidePw")}
				oninput={() => (error = undefined)}
			/>
			{#if error}
				<p class="err" id="pw-help">{tx(error)}</p>
			{:else}
				<p class="help" id="pw-help">{tx("auPwHelp")}</p>
			{/if}
		</div>
		<Button type="submit" class="go">{tx("auRsGo")}</Button>
	</form>
{:else if sent}
	<h1><MarkedLine text={tx("auVerTitle")} type="circle" /></h1>
	<p class="lede">{tx("auFgSentLede", { email: auth.email.trim() })}</p>
	<Notice tone="info">{tx("auVerSpam")}</Notice>
{:else}
	<h1><MarkedLine text={tx("auFgTitle")} /></h1>
	<p class="lede">{tx("auFgLede")}</p>
	<form novalidate onsubmit={request}>
		<div class="fld">
			<label class="lbl" for="email">{tx("auEmail")}</label>
			<input
				id="email"
				class="input"
				type="email"
				dir="auto"
				autocomplete="username"
				inputmode="email"
				autocapitalize="off"
				spellcheck="false"
				bind:this={field}
				bind:value={auth.email}
				aria-invalid={!!error}
				aria-describedby={error ? "email-err" : undefined}
				oninput={() => (error = undefined)}
			>
			{#if error}
				<p class="err" id="email-err">{tx(error)}</p>
			{/if}
		</div>
		<Button type="submit" class="go">{tx("auFgGo")}</Button>
	</form>
{/if}
<p class="foot"><a href="/sign-in">{tx("auBack")}</a></p>
{#if dev && (sent || token)}
	<!-- Debug only: what the mail's link would do. -->
	<p class="devbar">
		<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={() => goto("/forgot-password?token=demo", { replaceState: true })}
			>{tx("devOpenLink")}</Button
		>
		<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={() => goto("/forgot-password?token=expired", { replaceState: true })}
			>{tx("devExpiredLink")}</Button
		>
	</p>
{/if}
