<script lang="ts">
import { tick } from "svelte";
import PasswordField from "#lib/components/auth/PasswordField.svelte";
import SocialButtons from "#lib/components/auth/SocialButtons.svelte";
import MarkedLine from "#lib/components/common/MarkedLine.svelte";
import { shake } from "#lib/components/common/motion.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { auth, signUp, atx as tx, weakPassword } from "#lib/demo/account.svelte.ts";

/*
 * A new account: an address and a password, nothing else. The languages, the name and the rest are the welcome's, after
 * the address is confirmed (a provider skips straight to it). The main app also asked for the learning language and a
 * name here, and the password twice; the eye replaces typing it again.
 */
let password = $state("");
let emailIn: HTMLInputElement | null = $state(null);
let pwIn: HTMLInputElement | null = $state(null);
let errors = $state<{ email?: string; password?: string }>({});

async function submit(e: SubmitEvent) {
	e.preventDefault();
	const email = auth.email.trim();
	errors = {
		email: !email ? "auEmailMissing" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "auEmailInvalid" : undefined,
		password: !password ? "auPwMissing" : (weakPassword(password, email) ?? undefined),
	};
	const el = errors.email ? emailIn : errors.password ? pwIn : null;
	if (el) {
		await tick();
		el.focus();
		shake(el);
		return;
	}
	signUp(email);
}
$effect(() => {
	document.title = `${tx("auUpGo")} · Libiamo`;
});
</script>

<h1><MarkedLine text={tx("auUpTitle")} /></h1>
<p class="lede">{tx("auUpLede")}</p>
<form novalidate onsubmit={submit}>
	<div class="fld">
		<div class="lbl">
			<span><label for="email">{tx("auEmail")}</label></span>
		</div>
		<input
			id="email"
			class="input"
			type="email"
			dir="auto"
			autocomplete="email"
			inputmode="email"
			autocapitalize="off"
			spellcheck="false"
			bind:this={emailIn}
			bind:value={auth.email}
			aria-invalid={!!errors.email}
			aria-describedby={errors.email ? "email-err" : undefined}
			oninput={() => (errors.email = undefined)}
		>
		{#if errors.email}
			<p class="err" id="email-err">{tx(errors.email)}</p>
		{/if}
	</div>
	<div class="fld">
		<label class="lbl" for="password">{tx("auPassword")}</label>
		<PasswordField
			id="password"
			autocomplete="new-password"
			bind:value={password}
			bind:input={pwIn}
			invalid={!!errors.password}
			describedby="pw-help"
			show={tx("auShowPw")}
			hide={tx("auHidePw")}
			oninput={() => (errors.password = undefined)}
		/>
		{#if errors.password}
			<p class="err" id="pw-help">{tx(errors.password)}</p>
		{:else}
			<p class="help" id="pw-help">{tx("auPwHelp")}</p>
		{/if}
	</div>
	<Button type="submit" class="go">{tx("auUpGo")}</Button>
</form>
<p class="or">{tx("auOr")}</p>
<SocialButtons {tx} />
<p class="foot">{tx("auUpHave")} <a href="/sign-in">{tx("auUpHaveLink")}</a></p>
