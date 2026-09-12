<script lang="ts">
import Pencil from "@lucide/svelte/icons/pencil";
import { flushSync } from "svelte";
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import { type LanguageCode, USER_NAME_MAX_LENGTH } from "$lib/constants";
import { t } from "$lib/i18n";
import FormErrorFocus from "./FormErrorFocus.svelte";
import ModalDialog from "./ModalDialog.svelte";

let { name, lang }: { name: string; lang: LanguageCode } = $props();
let input: HTMLInputElement;
let formElement = $state<HTMLFormElement | null>(null);
let dialogOpen = $state(false);
let value = $state("");
let saving = $state(false);
let errors = $state<{ name?: string[] }>({});
let failure = $state("");

function open() {
	// Flushing first mounts the dialog with the current name already in place, so
	// the field can be focused and selected in the same tick it appears.
	flushSync(() => {
		value = name;
		errors = {};
		failure = "";
		dialogOpen = true;
	});
	input.focus({ preventScroll: true });
	input.select();
}
</script>

<div class="name-display">
	<h2>{name}</h2>
	<button
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

<ModalDialog bind:open={dialogOpen} busy={saving} labelledby="name-dialog-title">
	<form
		bind:this={formElement}
		class="name-form"
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
						dialogOpen = false;
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
			<button type="button" disabled={saving} onclick={() => (dialogOpen = false)}>{t(lang, "common.cancel")}</button>
			<button type="submit" class="save" disabled={saving || value === name}>{t(lang, "profile.saveName")}</button>
		</div>
	</form>
</ModalDialog>

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
.name-form h2 {
	margin: 0 0 1.75rem;
	font-family: var(--font-serif);
	font-size: 1.75rem;
	font-weight: 500;
}
.name-form label {
	display: block;
	margin-bottom: 0.5rem;
	font-size: 0.8rem;
	font-weight: 600;
	color: #655d55;
}
.name-form input {
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
	.edit-trigger,
	.actions button {
		transition: none;
	}
}
</style>
