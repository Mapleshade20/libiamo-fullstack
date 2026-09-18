<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Lightbulb from "@lucide/svelte/icons/lightbulb";

let {
	value = $bindable(""),
	placeholder,
	disabled = false,
	hintOpen = false,
	loadingHint = false,
	sendLabel,
	hintLabel,
	onHint,
	onSend,
}: {
	value?: string;
	placeholder: string;
	disabled?: boolean;
	hintOpen?: boolean;
	loadingHint?: boolean;
	sendLabel: string;
	hintLabel: string;
	onHint: (event: MouseEvent) => void;
	onSend: () => void;
} = $props();
</script>
<div class="relative">
	<textarea
		bind:value
		maxlength="2000"
		rows="1"
		class="block min-h-11 max-h-40 w-full resize-none rounded-[22px] border border-[#D1D1D6] bg-white px-4 py-2.5 pr-24 text-[15px] leading-5 outline-none placeholder:text-[#8E8E93] focus:border-[#0A84FF]"
		{placeholder}
		{disabled}
	></textarea>
	<div class="absolute top-1/2 right-4 z-10 flex -translate-y-1/2 items-center gap-2">
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded-full border border-[#D1D1D6] bg-white"
			aria-label={hintLabel}
			onclick={onHint}
			{disabled}
		>
			<Lightbulb size={16} class={loadingHint ? "animate-pulse text-[#FF9F0A]" : ""} />
		</button><button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A84FF] text-white"
			aria-label={sendLabel}
			onclick={onSend}
			disabled={disabled || !value.trim()}
		>
			<ArrowUp size={16} />
		</button>
	</div>
</div>
