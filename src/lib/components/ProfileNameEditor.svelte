<script lang="ts">
import Pencil from "@lucide/svelte/icons/pencil";
import { flushSync } from "svelte";
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import { type LanguageCode, USER_NAME_MAX_LENGTH } from "$lib/constants";
import { t } from "$lib/i18n";
import FormErrorFocus from "./FormErrorFocus.svelte";

let { name, lang }: { name: string; lang: LanguageCode } = $props();
let dialog: HTMLDialogElement;
let input: HTMLInputElement;
let trigger: HTMLButtonElement;
let formElement = $state<HTMLFormElement | null>(null);
let value = $state("");
let saving = $state(false);
let errors = $state<{ name?: string[] }>({});
let failure = $state("");

function open() {
	flushSync(() => {
		value = name;
		errors = {};
		failure = "";
	});
	dialog.showModal();
	input.focus({ preventScroll: true });
	input.select();
}
</script>

<div class="name-display">
	<h2>{name}</h2>
	<button
		bind:this={trigger}
		type="button"
		class="edit-trigger"
		onclick={open}
		aria-label={t(lang, "profile.editName")}
		title={t(lang, "profile.editName")}
		aria-haspopup="dialog"
	>
		<Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
	</button>
</div>

<dialog
	bind:this={dialog}
	class="name-dialog"
	aria-labelledby="name-dialog-title"
	oncancel={(event) => { if (saving) event.preventDefault(); }}
	onclose={() => trigger.focus({ preventScroll: true })}
>
	<form
		bind:this={formElement}
		method="POST"
		action="?/updateProfile"
		oninvalidcapture={handleInvalidField}
		use:enhance={() => {
			saving = true;
			errors = {};
			failure = "";
			return async ({ result, update }) => {
				try {
					if (result.type === "success") {
						await update({ reset: false });
						dialog.close();
					} else if (result.type === "failure") {
						errors = result.data?.errors ?? {};
						failure = typeof result.data?.message === "string" ? result.data.message : (errors.name ? "" : t(lang, "profile.unableSave"));
					} else {
						failure = t(lang, "profile.unableSave");
					}
				} catch {
					failure = t(lang, "profile.unableSave");
				} finally {
					saving = false;
				}
			};
		}}
		aria-busy={saving}
	>
		<FormErrorFocus formRef={formElement} {errors} fieldOrder={["name"]} />
		<h2 id="name-dialog-title">{t(lang, "profile.editName")}</h2>
		<label for="profile-name">{t(lang, "profile.name")}</label>
		<input
			bind:this={input}
			bind:value
			name="name"
			id="profile-name"
			autocomplete="name"
			maxlength={USER_NAME_MAX_LENGTH}
			readonly={saving}
			aria-invalid={Boolean(errors.name)}
			aria-describedby="name-dialog-error"
		>
		<p id="name-dialog-error" class="error" role="status">{errors.name?.[0] ?? failure}</p>
		<div class="actions">
			<button type="button" disabled={saving} onclick={() => dialog.close()}>{t(lang, "common.cancel")}</button>
			<button type="submit" class="save" disabled={saving || value === name}>{t(lang, "profile.saveName")}</button>
		</div>
	</form>
</dialog>

<style>
.name-display {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
}
.name-display h2 {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--font-serif);
	font-size: 1.5rem;
	line-height: 1.3;
}
.edit-trigger {
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	flex: 0 0 44px;
	border-radius: 50%;
	color: #746c64;
	transition:
		background-color 200ms,
		color 200ms;
}
.edit-trigger:hover {
	background: #eeeae4;
	color: #713b46;
}
.name-dialog {
	margin: auto;
	width: min(26rem, calc(100vw - 2rem));
	max-height: calc(100dvh - 2rem);
	padding: 1.75rem;
	border: 1px solid #ded7cd;
	border-radius: 20px;
	background: #faf8f4;
	color: #302c28;
	box-shadow: 0 24px 80px #241b2033;
	opacity: 0;
	transform: translateY(8px) scale(0.98);
	transition:
		opacity 220ms ease,
		transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
		display 220ms allow-discrete,
		overlay 220ms allow-discrete;
}
.name-dialog[open] {
	opacity: 1;
	transform: none;
}
.name-dialog::backdrop {
	background: #28232a33;
	backdrop-filter: blur(4px);
	opacity: 0;
	transition:
		opacity 220ms,
		display 220ms allow-discrete,
		overlay 220ms allow-discrete;
}
.name-dialog[open]::backdrop {
	opacity: 1;
}
@starting-style {
	.name-dialog[open] {
		opacity: 0;
		transform: translateY(8px) scale(0.98);
	}
	.name-dialog[open]::backdrop {
		opacity: 0;
	}
}
.name-dialog h2 {
	margin: 0 0 1.75rem;
	font-family: var(--font-serif);
	font-size: 1.75rem;
	font-weight: 500;
}
.name-dialog label {
	display: block;
	margin-bottom: 0.5rem;
	font-size: 0.8rem;
	font-weight: 600;
	color: #655d55;
}
.name-dialog input {
	width: 100%;
	min-height: 48px;
	padding: 0.65rem 0.85rem;
	border: 1px solid #cfc6bb;
	border-radius: 10px;
	background: #fffdfa;
	font-family: var(--font-sans);
	font-size: 1rem;
}
.error {
	min-height: 2.75rem;
	padding-top: 0.5rem;
	font-size: 0.8rem;
	color: #963e42;
}
.actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.75rem;
}
.actions button {
	min-height: 44px;
	padding: 0.65rem 1rem;
	border-radius: 10px;
	font-size: 0.875rem;
	font-weight: 600;
	transition:
		background-color 200ms,
		opacity 200ms;
}
.actions button:hover {
	background: #eeeae4;
}
.actions .save {
	background: #713b46;
	color: #fffaf7;
}
.actions .save:hover {
	background: #60323c;
}
.actions button:disabled {
	opacity: 0.5;
	cursor: default;
}
button:focus-visible,
input:focus-visible {
	outline: 2px solid #89525e;
	outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
	.name-dialog,
	.name-dialog::backdrop,
	.edit-trigger,
	.actions button {
		transition: none;
	}
}
</style>
