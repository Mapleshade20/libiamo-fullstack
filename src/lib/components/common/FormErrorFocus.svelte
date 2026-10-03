<script lang="ts">
import { tick } from "svelte";
import { type FieldErrors, focusFirstFormError } from "$lib/client/form-attention";

interface Props {
	formRef?: HTMLFormElement | null;
	errors?: FieldErrors | null;
	fieldOrder?: string[];
}

let { formRef = null, errors = null, fieldOrder = [] }: Props = $props();

$effect(() => {
	const currentErrors = errors;
	const currentForm = formRef;
	const order = fieldOrder;
	let cancelled = false;
	void tick().then(() => {
		if (!cancelled) focusFirstFormError(currentForm, currentErrors, order);
	});
	return () => {
		cancelled = true;
	};
});
</script>
