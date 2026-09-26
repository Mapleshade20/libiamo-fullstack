<script lang="ts">
import FinishSheet from "$lib/components/practice/session/FinishSheet.svelte";
import { createPracticeSession, type PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import { seededContact } from "$lib/practice/mail";
import BubbleList from "./BubbleList.svelte";
import Composer from "./Composer.svelte";
import ConversationHeader from "./ConversationHeader.svelte";
import ConversationList from "./ConversationList.svelte";
import { i18n } from "./i18n";

let props: PracticeSurfaceProps = $props();

const t = $derived(i18n[props.language] ?? i18n.en);
const session = createPracticeSession(() => props, { fallbackAgentName: () => seededContact(props.taskId).name });
</script>

<div class="practice-surface fixed inset-0 z-[999] h-[100dvh] w-full bg-[#F2F2F7] font-inter-stack text-[#1C1C1E] md:bg-[#DDDDE1]">
	<div class="mx-auto flex h-full w-full md:items-center md:justify-center md:p-3 lg:p-4">
		<div
			class="flex h-full w-full overflow-hidden md:h-[calc(100dvh-1.5rem)] md:max-h-[1100px] md:w-[calc(100vw-1.5rem)] md:max-w-[1800px] md:rounded-2xl md:border md:border-black/10 md:bg-white md:shadow-2xl lg:h-[calc(100dvh-2rem)] lg:w-[calc(100vw-2rem)]"
		>
			<ConversationList {session} returnHref={props.returnHref} language={props.language} {t} />
			<section class="relative flex min-w-0 flex-1 flex-col bg-[#F2F2F7] md:bg-white">
				<ConversationHeader {session} returnHref={props.returnHref} language={props.language} {t} />
				<BubbleList {session} language={props.language} {t} />
				<Composer {session} language={props.language} {t} />
			</section>
		</div>
	</div>
	<FinishSheet {session} language={props.language} />
</div>
