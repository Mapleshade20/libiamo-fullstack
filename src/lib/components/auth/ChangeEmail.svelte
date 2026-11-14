<script lang="ts">
import "./auth.css";
import { tick } from "svelte";
import { dev } from "$app/environment";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";
import { shake } from "$lib/components/common/motion";
import Button from "$lib/components/ui/button/button.svelte";
import { account, confirmEmailChange, hasPassword, requestEmailChange } from "$lib/demo/account.svelte";
import { toast, tx } from "$lib/demo/app.svelte";
import PasswordField from "./PasswordField.svelte";

/*
 * A new sign-in address (the main app's /change-email, guarded by a sign-in under ten minutes old): the password says it
 * is really them (a provider's account, with none, signs in again instead), then the new address gets a link and only
 * opening it makes the change. Until then the old address signs in, and settings shows the change waiting.
 */
let { open = $bindable(false) }: { open?: boolean } = $props();
let email = $state("");
let password = $state("");
let sent = $state(false);
let emailIn: HTMLInputElement | null = $state(null);
let pwIn: HTMLInputElement | null = $state(null);
let errors = $state<{ email?: string; password?: string }>({});
$effect(() => {
	if (!open) return;
	email = "";
	password = "";
	errors = {};
	sent = false;
});
const valid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
async function submit(e: SubmitEvent) {
	e.preventDefault();
	const v = email.trim();
	errors = {
		email: !v ? "auEmailMissing" : !valid(v) ? "auEmailInvalid" : v.toLowerCase() === account.me.email.toLowerCase() ? "acSameEmail" : undefined,
		password: hasPassword() && !password ? "auPwMissing" : undefined,
	};
	const el = errors.email ? emailIn : errors.password ? pwIn : null;
	if (el) {
		await tick();
		el.focus();
		shake(el);
		return;
	}
	requestEmailChange(v);
	sent = true;
}
function openLink() {
	confirmEmailChange();
	open = false;
	toast(tx("acEmailChanged"));
}
</script>

<ModalDialog bind:open labelledby="ce-h">
	<div class="auth in-dialog">
		{#if sent}
			<h2 id="ce-h" class="mb-3">{tx("acCheckNew")}</h2>
			<p class="lede">{tx("acCheckNewLede")}</p>
			<p class="addr">{account.me.pendingEmail}</p>
			<div class="acts">
				{#if dev}
					<Button variant="ghost" size="sm" class="me-auto text-muted-foreground" onclick={openLink}>{tx("devOpenLink")}</Button>
				{/if}
				<Button onclick={() => (open = false)}>{tx("acOk")}</Button>
			</div>
		{:else}
			<h2 id="ce-h" class="mb-3">{tx("setChangeEmail")}</h2>
			<p class="lede">{tx("acEmailLede", { email: account.me.email })}</p>
			<form novalidate onsubmit={submit}>
				<div class="fld">
					<div class="lbl">
						<span><label for="ce-email">{tx("acNewEmail")}</label></span>
					</div>
					<input
						id="ce-email"
						class="input"
						type="email"
						dir="auto"
						autocomplete="email"
						inputmode="email"
						autocapitalize="off"
						spellcheck="false"
						bind:this={emailIn}
						bind:value={email}
						aria-invalid={!!errors.email}
						aria-describedby={errors.email ? "ce-email-err" : undefined}
						oninput={() => (errors.email = undefined)}
						data-initial-focus
					>
					{#if errors.email}
						<p class="err" id="ce-email-err">{tx(errors.email)}</p>
					{/if}
				</div>
				{#if hasPassword()}
					<div class="fld">
						<label class="lbl" for="ce-pw">{tx("acYourPw")}</label>
						<PasswordField
							id="ce-pw"
							autocomplete="current-password"
							bind:value={password}
							bind:input={pwIn}
							invalid={!!errors.password}
							describedby={errors.password ? "ce-pw-err" : undefined}
							show={tx("auShowPw")}
							hide={tx("auHidePw")}
							oninput={() => (errors.password = undefined)}
						/>
						{#if errors.password}
							<p class="err" id="ce-pw-err">{tx(errors.password)}</p>
						{/if}
					</div>
				{/if}
				<div class="acts">
					<Button variant="secondary" onclick={() => (open = false)}>{tx("setCancel")}</Button>
					<Button type="submit">{tx("acSendLink")}</Button>
				</div>
			</form>
		{/if}
	</div>
</ModalDialog>

<style>
.in-dialog {
	min-width: min(400px, 100%);
}
.in-dialog .lede {
	margin-bottom: 20px;
	font-size: 15px;
}
.addr {
	margin: 0 0 4px;
	padding: 10px 14px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--ink) 4%, transparent);
	font-weight: 600;
	overflow-wrap: anywhere;
}
.acts {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 22px;
}
</style>
