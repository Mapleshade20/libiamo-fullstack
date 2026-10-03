<script lang="ts">
import { BottomSheet } from "$lib/components/ui/bottom-sheet";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { PracticeSession } from "./session.svelte";

let { session, language }: { session: PracticeSession; language: LanguageCode } = $props();
</script>

<BottomSheet
	show={session.confirmingFinish}
	title={t(language, "practice.finishSheet.title")}
	message={t(language, "practice.finishSheet.message")}
	confirmLabel={t(language, "practice.finishSheet.confirm")}
	cancelLabel={t(language, "practice.finishSheet.cancel")}
	confirmDisabled={session.isCompleting}
	onConfirm={() => void session.finish()}
	onCancel={session.cancelFinish}
/>
