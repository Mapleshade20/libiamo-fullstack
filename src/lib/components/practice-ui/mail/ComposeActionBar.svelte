<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import Paperclip from "@lucide/svelte/icons/paperclip";
import Send from "@lucide/svelte/icons/send";
import type { DraftEmail } from "./types";

let {
	draft = { to: "", subject: "", body: "" } as DraftEmail,
	sessionId = null as number | null,
	isSubmitting = false,
	isCompleted = false,
	isInitializing = false,
	limitReached = false,
	t = {} as Record<string, string>,
	onMockAction = () => {},
	onSend = () => {},
}: {
	draft?: DraftEmail;
	sessionId?: number | null;
	isSubmitting?: boolean;
	isCompleted?: boolean;
	isInitializing?: boolean;
	limitReached?: boolean;
	t?: Record<string, string>;
	onMockAction?: () => void;
	onSend?: () => void;
} = $props();

const sendDisabled = $derived(!draft.to.trim() || !draft.body.trim() || isSubmitting || isCompleted || isInitializing || !sessionId || limitReached);
</script>

<div class="flex items-center gap-2 border-t border-black/10 bg-[#F7F7F9] px-4 py-3">
	<button type="button" class="icon-button" onclick={onMockAction}><Paperclip size={17} /></button>
	<button
		type="button"
		class="ml-auto inline-flex items-center gap-2 rounded-md bg-[#3478F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A64FF] disabled:cursor-not-allowed disabled:opacity-50"
		disabled={sendDisabled}
		onclick={onSend}
	>
		{#if isSubmitting}
			<LoaderCircle size={15} class="animate-spin" />
			{t.sending}
		{:else}
			<Send size={15} />
			{t.send}
		{/if}
	</button>
</div>
