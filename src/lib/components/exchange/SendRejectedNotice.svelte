<script lang="ts">
import { toast } from "#lib/components/shell/toast.svelte.ts";
import { t } from "#lib/i18n/index.svelte.ts";
import type { ExchangeController } from "./controller.svelte.ts";

/** Says why the server refused a message; the place has already put the text back in its composer. */
let { exchange, language }: { exchange: ExchangeController; language: string } = $props();
$effect(() => {
	const r = exchange.rejection;
	if (r) toast(r.message ? `${t(language, "exSendRejected")}: ${r.message}` : t(language, "exSendRejected"));
});
</script>
