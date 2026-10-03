<script lang="ts">
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { PracticeSession } from "./session.svelte";

/** Says why the server refused a message; the surface has already put the text back in the composer. */
let { session, language }: { session: PracticeSession; language: LanguageCode } = $props();
</script>

<ActionNotification
	notification={session.rejection
		? { variant: "error", title: t(language, "practice.sendRejected"), message: session.rejection.message, key: session.rejection.key }
		: null}
/>
