<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import Pencil from "@lucide/svelte/icons/pencil";
import Trash2 from "@lucide/svelte/icons/trash-2";
import X from "@lucide/svelte/icons/x";
import { CARD_TYPE_LABELS } from "$lib/constants";

let { data } = $props();
let cardList = $state(data.cards);
let editingId = $state<number | null>(null);
let editFront = $state("");
let editBack = $state("");

function startEdit(card: { id: number; front: string; back: string }) {
	editingId = card.id;
	editFront = card.front;
	editBack = card.back;
}

function cancelEdit() {
	editingId = null;
}

async function saveEdit(cardId: number) {
	await fetch(`/api/review/${cardId}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ front: editFront, back: editBack }),
	});
	cardList = cardList.map((c) => (c.id === cardId ? { ...c, front: editFront, back: editBack } : c));
	editingId = null;
}

async function onDelete(cardId: number) {
	await fetch(`/api/review/${cardId}`, { method: "DELETE" });
	cardList = cardList.filter((c) => c.id !== cardId);
}
</script>

<div class="mx-auto max-w-2xl">
	<div class="mb-8 flex items-center gap-4">
		<a href="/review" class="text-muted-foreground hover:text-foreground"><ArrowLeft size={20} /></a>
		<h1 class="text-2xl">Manage Cards</h1>
	</div>

	{#if cardList.length === 0}
		<p class="text-muted-foreground">No cards yet.</p>
	{:else}
		<div class="space-y-2">
			{#each cardList as card (card.id)}
				<div class="rounded-lg border border-border bg-card p-4">
					{#if editingId === card.id}
						<div class="space-y-3">
							<input type="text" class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" bind:value={editFront}>
							<textarea class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={3} bind:value={editBack}></textarea>
							<div class="flex justify-end gap-2">
								<button type="button" class="rounded p-1 text-muted-foreground hover:text-foreground" onclick={cancelEdit}><X size={16} /></button>
								<button type="button" class="rounded p-1 text-green-600 hover:text-green-700" onclick={() => saveEdit(card.id)}>
									<Check size={16} />
								</button>
							</div>
						</div>
					{:else}
						<div class="flex items-start gap-4">
							<span class="mt-0.5 shrink-0 rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{CARD_TYPE_LABELS[card.cardType]}
							</span>
							<div class="min-w-0 flex-1">
								<p class="text-sm text-foreground">{card.front}</p>
								<p class="mt-1 text-xs text-muted-foreground line-clamp-2">{card.back}</p>
							</div>
							<div class="flex shrink-0 gap-0.5">
								<button type="button" class="rounded p-1 text-muted-foreground hover:text-foreground" onclick={() => startEdit(card)}>
									<Pencil size={16} />
								</button>
								<button type="button" class="rounded p-1 text-muted-foreground hover:text-red-600" onclick={() => onDelete(card.id)}>
									<Trash2 size={16} />
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
