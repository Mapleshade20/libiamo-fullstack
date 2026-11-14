<script lang="ts">
import Search from "@lucide/svelte/icons/search";
import type { ExchangeController } from "#lib/components/exchange/controller.svelte.ts";
import { normalizeText } from "#lib/components/exchange/message-format.ts";

import { t as translate } from "#lib/i18n/index.svelte.ts";
import type { IMessageText } from "./i18n.ts";
import { getRenderableMessages } from "./presentation.ts";

let {
	exchange,
	title,
	returnHref,
	language,
	t,
}: { exchange: ExchangeController /** The contact or group name. */; title: string; returnHref: string; language: string; t: IMessageText } =
	$props();

const preview = $derived(normalizeText(getRenderableMessages(exchange.messages).at(-1)?.text, t.startConversation));
</script>

<aside class="hidden w-[290px] shrink-0 flex-col border-r border-[#E0D3D8] bg-[#F6E9EE] md:flex" aria-label={t.messages}>
	<div class="border-b border-[#E8DDE2] px-4 py-3">
		<div class="mb-3 flex items-center gap-2">
			<a
				href={returnHref}
				class="block h-3 w-3 rounded-full bg-[#FF5F57] transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
				aria-label={translate(language, "exBack")}
				title={translate(language, "exBack")}
				><span class="sr-only">{translate(language, "exBack")}</span></a
			>
			<span class="h-3 w-3 rounded-full bg-[#FEBC2E]" aria-hidden="true"></span>
			<span class="h-3 w-3 rounded-full bg-[#28C840]" aria-hidden="true"></span>
		</div>
		<div class="flex items-center gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs text-[#8E8E93] shadow-sm" aria-hidden="true">
			<Search size={12} />
			<span>{t.messages}</span>
		</div>
	</div>
	<div class="px-2 py-2">
		<div class="flex w-full items-center gap-3 rounded-xl bg-[#0A84FF] px-3 py-2.5 text-white shadow-sm" aria-current="true">
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-[#1C1C1E]" aria-hidden="true">
				{title.charAt(0).toUpperCase()}
			</div>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-semibold">{title}</p>
				<p class="truncate text-[11px] text-white/80">{preview}</p>
			</div>
			<p class="text-[10px] text-white/80">{t.now}</p>
		</div>
	</div>
</aside>
