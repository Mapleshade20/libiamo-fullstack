<script lang="ts">
import X from "@lucide/svelte/icons/x";
import type { DraftEmail } from "./types";

let {
	draft = $bindable({ to: "", subject: "", body: "" } as DraftEmail),
	subjectDisabled = false,
	t = {} as Record<string, string>,
	onClose = () => {},
	onStartDrag = (_event: PointerEvent) => {},
	onDraftChange = (_draft: DraftEmail) => {},
}: {
	draft?: DraftEmail;
	subjectDisabled?: boolean;
	t?: Record<string, string>;
	onClose?: () => void;
	onStartDrag?: (event: PointerEvent) => void;
	onDraftChange?: (draft: DraftEmail) => void;
} = $props();

function handleSubjectInput(event: Event) {
	draft = { ...draft, subject: (event.currentTarget as HTMLInputElement).value };
	onDraftChange(draft);
}
</script>

<div class="compose-titlebar flex h-11 items-center gap-2 rounded-t-xl bg-[#F2F2F7] px-4" role="presentation" onpointerdown={onStartDrag}>
	<span class="text-sm font-semibold">{t.newMessage}</span>
	<button type="button" class="ml-auto rounded p-1 text-[#6E6E73] hover:bg-black/10 hover:text-[#1D1D1F]" onclick={onClose}><X size={17} /></button>
</div>

<label class="compose-line">
	<span>{t.to}:</span>
	<input value={draft.to} readonly aria-readonly="true" class="readonly-field">
</label>
<label class="compose-line">
	<span>{t.subject}:</span>
	<input value={draft.subject} disabled={subjectDisabled} oninput={handleSubjectInput}>
</label>

<style>
.compose-titlebar {
	cursor: move;
	user-select: none;
}

.compose-line {
	display: flex;
	min-height: 42px;
	align-items: center;
	gap: 10px;
	border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	padding: 0 14px;
	font-size: 0.9rem;
}

.compose-line span {
	width: 64px;
	color: #6e6e73;
}

.compose-line input {
	min-width: 0;
	flex: 1;
	background: transparent;
	outline: none;
}

.readonly-field {
	color: #6e6e73;
	cursor: default;
}

@media (max-width: 640px) {
	.compose-titlebar {
		cursor: default;
	}
}
</style>
