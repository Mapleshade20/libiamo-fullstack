<script lang="ts">
import "./auth.css";
import { tick } from "svelte";
import { account, deleteAccount } from "#lib/account/account.svelte.ts";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import { shake } from "#lib/components/common/motion.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { toast, tx } from "#lib/demo/app.svelte.ts";

/*
 * Deleting the account, in two deliberate steps: what goes with it and a press to go on, then the address typed by hand
 * (pasting and dropping are refused, autofill is off), which alone arms the button. Everything the learner has goes.
 */
let { open = $bindable(false) }: { open?: boolean } = $props();
let step = $state<1 | 2>(1);
let typed = $state("");
let pending = $state(false);
let input: HTMLInputElement | null = $state(null);
$effect(() => {
	if (!open) return;
	step = 1;
	typed = "";
});
const matches = $derived(typed.trim().toLowerCase() === account.me.email.toLowerCase());
async function next() {
	step = 2;
	await tick();
	input?.focus();
}
const refuse = (e: Event) => {
	e.preventDefault();
	shake(input);
};
async function submit(e: SubmitEvent) {
	e.preventDefault();
	if (!matches) return shake(input);
	pending = true;
	try {
		await deleteAccount(typed);
		toast(tx("acDeleted"));
	} catch {
		pending = false;
		toast(tx("auSomethingWrong"));
	}
}
</script>

<ModalDialog bind:open labelledby="da-h" busy={pending}>
	<div class="auth in-dialog">
		<h2 id="da-h" class="mb-3">{tx("acDeleteTitle")}</h2>
		<p class="lede">{tx("acDeleteLede")}</p>
		{#if step === 1}
			<div class="acts">
				<Button variant="secondary" onclick={() => (open = false)} data-initial-focus>{tx("setCancel")}</Button>
				<Button variant="secondary" class="text-destructive" onclick={next}>{tx("acDeleteNext")}</Button>
			</div>
		{:else}
			<form novalidate onsubmit={submit}>
				<div class="fld">
					<label class="lbl" for="da-email">{tx("acDeleteType", { email: account.me.email })}</label>
					<input
						id="da-email"
						class="input"
						type="text"
						dir="auto"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						data-1p-ignore
						data-lpignore="true"
						bind:this={input}
						bind:value={typed}
						onpaste={refuse}
						ondrop={refuse}
					>
				</div>
				<div class="acts">
					<Button variant="secondary" onclick={() => (open = false)} disabled={pending}>{tx("setCancel")}</Button>
					<Button type="submit" variant="destructive-solid" disabled={!matches || pending}>{tx("acDeleteGo")}</Button>
				</div>
			</form>
		{/if}
	</div>
</ModalDialog>

<style>
.in-dialog {
	min-width: min(400px, 100%);
	max-width: 440px;
}
.in-dialog .lede {
	margin-bottom: 20px;
	font-size: 15px;
}
.acts {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 22px;
}
</style>
