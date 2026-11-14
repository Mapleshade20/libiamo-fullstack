<script lang="ts">
import "./auth.css";
import { tick } from "svelte";
import { dev } from "$app/environment";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";
import { shake } from "$lib/components/common/motion";
import Button from "$lib/components/ui/button/button.svelte";
import { account, auth, hasPassword, passwordSet, signOut, weakPassword } from "$lib/demo/account.svelte";
import { toast, tx } from "$lib/demo/app.svelte";
import PasswordField from "./PasswordField.svelte";

/*
 * A new password: the current one, the new one (the eye, no second copy), and whether to sign out everywhere else,
 * on by default after a change someone may be making because of a leak. A provider's account has no current password:
 * it gets a mailed link that sets the first one, as the main app does. A forgotten current password goes the reset way.
 */
let { open = $bindable(false) }: { open?: boolean } = $props();
let current = $state("");
let next = $state("");
let others = $state(true);
let sent = $state(false);
let curIn: HTMLInputElement | null = $state(null);
let nextIn: HTMLInputElement | null = $state(null);
let errors = $state<{ current?: string; next?: string }>({});
$effect(() => {
	if (!open) return;
	current = next = "";
	errors = {};
	sent = false;
	others = true;
});
async function submit(e: SubmitEvent) {
	e.preventDefault();
	errors = {
		current: current ? undefined : "auPwMissing",
		next: !next ? "auPwMissing" : next === current ? "acSamePw" : (weakPassword(next, account.me.email) ?? undefined),
	};
	const el = errors.current ? curIn : errors.next ? nextIn : null;
	if (el) {
		await tick();
		el.focus();
		shake(el);
		return;
	}
	open = false;
	toast(tx(others ? "acPwChangedOthers" : "acPwChanged"));
}
function forgot() {
	// The reset is for someone signed out: this device signs out, and the reset page starts from the address.
	open = false;
	auth.email = account.me.email;
	signOut("/forgot-password");
}
</script>

<ModalDialog bind:open labelledby="cp-h">
	<div class="auth in-dialog">
		{#if !hasPassword()}
			<h2 id="cp-h" class="mb-3">{tx("acSetPw")}</h2>
			{#if sent}
				<p class="lede">{tx("acSetPwSent", { email: account.me.email })}</p>
				<div class="acts">
					{#if dev}
						<Button
							variant="ghost"
							size="sm"
							class="me-auto text-muted-foreground"
							onclick={() => {
								passwordSet();
								open = false;
								toast(tx("acPwSetDone"));
							}}
							>{tx("devOpenLink")}</Button
						>
					{/if}
					<Button onclick={() => (open = false)}>{tx("acOk")}</Button>
				</div>
			{:else}
				<p class="lede">{tx("acSetPwLede", { email: account.me.email })}</p>
				<div class="acts">
					<Button variant="secondary" onclick={() => (open = false)}>{tx("setCancel")}</Button>
					<Button onclick={() => (sent = true)} data-initial-focus>{tx("acSendLink")}</Button>
				</div>
			{/if}
		{:else}
			<h2 id="cp-h" class="mb-5">{tx("setChangePw")}</h2>
			<form novalidate onsubmit={submit}>
				<input type="email" autocomplete="username" value={account.me.email} hidden>
				<div class="fld">
					<div class="lbl">
						<label for="cp-cur">{tx("acCurrentPw")}</label
						><a
							href="/forgot-password"
							onclick={(e) => {
								e.preventDefault();
								forgot();
							}}
							>{tx("auForgot")}</a
						>
					</div>
					<PasswordField
						id="cp-cur"
						autocomplete="current-password"
						bind:value={current}
						bind:input={curIn}
						invalid={!!errors.current}
						describedby={errors.current ? "cp-cur-err" : undefined}
						show={tx("auShowPw")}
						hide={tx("auHidePw")}
						oninput={() => (errors.current = undefined)}
					/>
					{#if errors.current}
						<p class="err" id="cp-cur-err">{tx(errors.current)}</p>
					{/if}
				</div>
				<div class="fld">
					<label class="lbl" for="cp-new">{tx("auRsNew")}</label>
					<PasswordField
						id="cp-new"
						autocomplete="new-password"
						bind:value={next}
						bind:input={nextIn}
						invalid={!!errors.next}
						describedby="cp-new-help"
						show={tx("auShowPw")}
						hide={tx("auHidePw")}
						oninput={() => (errors.next = undefined)}
					/>
					{#if errors.next}
						<p class="err" id="cp-new-help">{tx(errors.next)}</p>
					{:else}
						<p class="help" id="cp-new-help">{tx("auPwHelp")}</p>
					{/if}
				</div>
				<label class="others"><input type="checkbox" bind:checked={others}>{tx("acSignOutOthers")}</label>
				<div class="acts">
					<Button variant="secondary" onclick={() => (open = false)}>{tx("setCancel")}</Button>
					<Button type="submit">{tx("auRsGo")}</Button>
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
	margin-bottom: 4px;
	font-size: 15px;
}
.others {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 14px;
	cursor: pointer;
}
.others input {
	width: 16px;
	height: 16px;
	accent-color: var(--ink);
}
.others input:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.acts {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 22px;
}
</style>
