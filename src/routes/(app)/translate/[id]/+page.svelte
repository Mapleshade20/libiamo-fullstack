<script lang="ts">
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import TranslationPreparation from "$lib/components/translate/TranslationPreparation.svelte";
import type { LanguageCode } from "$lib/i18n";

let { data, form } = $props();
let lang = $derived(data.user.activeLanguage as LanguageCode);
let isComplete = $derived(data.attempt?.workflowPhase === "completed");
</script>

<svelte:head>
	<title>{data.template.title} · Libiamo</title>
	<meta name="description" content="Review this translation task and continue to the draft or evaluation.">
</svelte:head>

<div class="fixed inset-0 z-0 overflow-hidden bg-card">
	{#if isComplete}
		<div class="pointer-events-none absolute -right-24 -top-24 text-green-500/5"><CheckCircle2 size={500} strokeWidth={1} /></div>
	{/if}
</div>

<div class="task-stagger relative z-10 mx-auto w-full max-w-2xl min-w-0">
	<TranslationPreparation template={data.template} attempt={data.attempt} blockedReason={data.blockedReason} {lang} form={form ?? null} />
</div>
