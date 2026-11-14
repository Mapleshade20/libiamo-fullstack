<script lang="ts">
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { t } from "#lib/i18n/index.svelte.ts";
import type { ExchangeController } from "./controller.svelte.ts";

/* Ending the exchange asks once: what comes next is how it went, then the passes over what was written. */
let { exchange, language }: { exchange: ExchangeController; language: string } = $props();
</script>

<ModalDialog bind:open={() => exchange.confirmingFinish, (v) => !v && exchange.cancelFinish()} labelledby="ex-finish-h" busy={exchange.isCompleting}>
	<div class="finish" lang={language}>
		<h2 id="ex-finish-h">{t(language, "exFinishTitle")}</h2>
		<p>{t(language, "exFinishMessage")}</p>
		<div class="acts">
			<Button variant="secondary" onclick={exchange.cancelFinish} data-initial-focus>{t(language, "exFinishCancel")}</Button>
			<Button onclick={() => void exchange.finish()} disabled={exchange.isCompleting}>{t(language, "exFinishConfirm")}</Button>
		</div>
	</div>
</ModalDialog>

<style>
.finish h2 {
	margin-bottom: 8px;
}
.finish p {
	color: var(--ink-2);
	font-size: 15px;
	line-height: 1.55;
}
.acts {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 20px;
}
</style>
