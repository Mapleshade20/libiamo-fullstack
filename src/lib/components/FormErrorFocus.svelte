<script lang="ts">
import { tick } from "svelte";
import { type FieldErrors, focusFirstFormError } from "$lib/form-attention";

interface Props {
	formRef?: HTMLFormElement | null;
	errors?: FieldErrors | null;
	fieldOrder?: string[];
}

let { formRef = null, errors = null, fieldOrder = [] }: Props = $props();

let lastSignature = $state("");

$effect(() => {
	const signature = JSON.stringify(errors ?? {});
	if (!signature || signature === "{}") {
		lastSignature = "";
		return;
	}
	if (signature === lastSignature) return;
	lastSignature = signature;

	tick().then(() => {
		focusFirstFormError(formRef, errors, fieldOrder);
	});
});
</script>
