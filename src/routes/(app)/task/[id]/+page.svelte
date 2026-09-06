<script lang="ts">
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import TaskPreparation from "$lib/components/task/TaskPreparation.svelte";

let { data } = $props();
let task = $derived(data.task);
let isFinished = $derived(task.sessionStatus === "completed" || task.sessionStatus === "evaluated");
</script>

<svelte:head>
	<title>{task.title} · Libiamo</title>
	<meta name="description" content="Prepare for this language practice scenario, review objectives, and begin the session.">
</svelte:head>

<div class="fixed inset-0 z-0 overflow-hidden bg-card">
	{#if isFinished}
		<div class="pointer-events-none absolute -right-24 -top-24 text-green-500/5"><CheckCircle2 size={500} strokeWidth={1} /></div>
	{/if}
</div>

<div class="task-stagger relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-2xl min-w-0 flex-col">
	<TaskPreparation {task} nativeLanguage={data.nativeLanguage} />
</div>
