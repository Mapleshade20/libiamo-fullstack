<script lang="ts">
import Pencil from "@lucide/svelte/icons/pencil";
import { flushSync } from "svelte";
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import { type LanguageCode, USER_NAME_MAX_LENGTH } from "$lib/constants";
import { t } from "$lib/i18n";
import FormErrorFocus from "../common/FormErrorFocus.svelte";
import ModalDialog from "../common/ModalDialog.svelte";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

let { name, lang }: { name: string; lang: LanguageCode } = $props();
let input = $state<HTMLInputElement | null>(null);
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
	input?.focus({ preventScroll: true });
	input?.select();
}
</script>

<div class="flex min-w-0 items-center gap-1">
	<h2 class="min-w-0 truncate text-2xl leading-snug">{name}</h2>
	<Button
		variant="ghost"
		size="icon"
		class="shrink-0 rounded-full text-muted-foreground"
		onclick={open}
		aria-label={t(lang, "profile.editName")}
		title={t(lang, "profile.editName")}
		aria-haspopup="dialog"
	>
		<Pencil strokeWidth={1.5} aria-hidden="true" />
	</Button>
</div>

<ModalDialog bind:open={dialogOpen} busy={saving} labelledby="name-dialog-title">
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
		<h2 id="name-dialog-title" class="mb-6">{t(lang, "profile.editName")}</h2>
		<label for="profile-name" class="mb-1.5 block text-sm font-medium">{t(lang, "profile.name")}</label>
		<Input
			bind:ref={input}
			bind:value
			name="name"
			id="profile-name"
			autocomplete="name"
			maxlength={USER_NAME_MAX_LENGTH}
			readonly={saving}
			aria-invalid={Boolean(errors.name)}
			aria-describedby="name-dialog-error"
		/>
		<p id="name-dialog-error" data-field-error={errors.name ? "name" : undefined} class="min-h-11 pt-1.5 text-sm text-destructive" role="status">
			{errors.name?.[0] ?? failure}
		</p>
		<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<Button variant="secondary" disabled={saving} onclick={() => (dialogOpen = false)}>{t(lang, "common.cancel")}</Button>
			<Button type="submit" disabled={saving || value === name}>{t(lang, "profile.saveName")}</Button>
		</div>
	</form>
</ModalDialog>
