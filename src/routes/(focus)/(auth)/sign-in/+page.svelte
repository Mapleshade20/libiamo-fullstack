<script lang="ts">
import { tick } from "svelte";
import PasswordField from "#lib/components/auth/PasswordField.svelte";
import SocialButtons from "#lib/components/auth/SocialButtons.svelte";
import MarkedLine from "#lib/components/common/MarkedLine.svelte";
import { shake } from "#lib/components/common/motion.ts";
import Notice from "#lib/components/common/Notice.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { account, auth, signIn, atx as tx } from "#lib/demo/account.svelte.ts";
import { dev } from "$app/env";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * Signing in: the address and password, or a provider. A wrong pair gets one message that never says which of the two
 * was wrong; an address not confirmed yet goes back to the inbox page, with the link sent again.
 */
let password = $state("");
let emailIn: HTMLInputElement | null = $state(null);
let pwIn: HTMLInputElement | null = $state(null);
let errors = $state<{ email?: string; password?: string; form?: string }>({});
const reset = page.url.searchParams.has("reset");

async function submit(e: SubmitEvent) {
	e.preventDefault();
	errors = {};
	if (!auth.email.trim()) errors.email = "auEmailMissing";
	else if (!password) errors.password = "auPwMissing";
	if (errors.email || errors.password) {
		await tick();
		const el = errors.email ? emailIn : pwIn;
		el?.focus();
		shake(el);
		return;
	}
	const r = signIn(auth.email, password);
	if (r === "wrong") {
		errors.form = "auInWrong";
		await tick();
		shake(document.querySelector(".auth form"));
	} else if (r === "unverified") goto("/verify?again=1");
}
$effect(() => {
	document.title = `${tx("auInGo")} · Libiamo`;
});
</script>

<h1><MarkedLine text={tx("auInTitle")} /></h1>
<p class="lede">{tx("auInLede")}</p>
{#if reset && !errors.form}
	<Notice tone="success" role="status" class="mb-5">{tx("auInReset")}</Notice>
{/if}
{#if errors.form}
	<Notice tone="danger" role="alert" class="mb-5">{tx(errors.form)}</Notice>
{/if}
<form novalidate onsubmit={submit}>
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
			bind:this={emailIn}
			bind:value={auth.email}
			aria-invalid={!!errors.email}
			aria-describedby={errors.email ? "email-err" : undefined}
			oninput={() => (errors = { ...errors, email: undefined, form: undefined })}
		>
		{#if errors.email}
			<p class="err" id="email-err">{tx(errors.email)}</p>
		{/if}
	</div>
	<div class="fld">
		<div class="lbl"><label for="password">{tx("auPassword")}</label><a href="/forgot-password">{tx("auForgot")}</a></div>
		<PasswordField
			id="password"
			autocomplete="current-password"
			bind:value={password}
			bind:input={pwIn}
			invalid={!!errors.password}
			describedby={errors.password ? "pw-err" : undefined}
			show={tx("auShowPw")}
			hide={tx("auHidePw")}
			oninput={() => (errors = { ...errors, password: undefined, form: undefined })}
		/>
		{#if errors.password}
			<p class="err" id="pw-err">{tx(errors.password)}</p>
		{/if}
	</div>
	<Button type="submit" class="go">{tx("auInGo")}</Button>
</form>
<p class="or">{tx("auOr")}</p>
<SocialButtons {tx} />
<p class="foot">{tx("auInNew")} <a href="/sign-up">{tx("auInNewLink")}</a></p>
{#if dev}
	<!-- Debug only: this browser's account (any password signs in). -->
	<p class="devbar">
		<Button
			variant="ghost"
			size="sm"
			class="text-muted-foreground"
			onclick={() => {
				auth.email = account.me.email;
				password = "demo-password";
			}}
			>{tx("devFillAccount")}</Button
		>
	</p>
{/if}
