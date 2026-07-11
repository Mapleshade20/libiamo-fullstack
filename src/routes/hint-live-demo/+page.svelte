<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Send from "@lucide/svelte/icons/send";
import HintFloatingPanel from "$lib/components/practice-ui/hint/HintFloatingPanel.svelte";

type DemoKind = "reddit" | "discord" | "imessage" | "mail" | "ao3";

let activeKind = $state<DemoKind | null>(null);
let redditLayoutReference = $state<HTMLDivElement | null>(null);
let discordLayoutReference = $state<HTMLDivElement | null>(null);
let imessageLayoutReference = $state<HTMLDivElement | null>(null);
let mailLayoutReference = $state<HTMLDivElement | null>(null);
let ao3LayoutReference = $state<HTMLDivElement | null>(null);
let motionOrigin = $state<HTMLElement | null>(null);
let expressionQuery = $state("");
let expressionPhrases = $state<string[]>([]);
let contentHint = $state("");
let hintError = $state<string | null>(null);
let isGettingHint = $state(false);
let requestId = 0;

function anchorNameFor(kind: DemoKind) {
	return `--libiamo-demo-${kind}-hint-anchor`;
}

function layoutReferenceFor(kind: DemoKind) {
	if (kind === "reddit") return redditLayoutReference;
	if (kind === "discord") return discordLayoutReference;
	if (kind === "imessage") return imessageLayoutReference;
	if (kind === "mail") return mailLayoutReference;
	return ao3LayoutReference;
}

function openHint(kind: DemoKind, trigger: HTMLElement) {
	if (activeKind === kind) {
		closeHint();
		return;
	}
	motionOrigin = trigger;
	activeKind = kind;
	contentHint = "";
	hintError = null;
	expressionQuery = "";
	expressionPhrases = [];
}

function closeHint() {
	requestId++;
	activeKind = null;
	isGettingHint = false;
	contentHint = "";
	hintError = null;
	expressionQuery = "";
	expressionPhrases = [];
}

async function handleContentHint() {
	if (!activeKind || isGettingHint) return;
	const current = ++requestId;
	isGettingHint = true;
	contentHint = "";
	expressionPhrases = [];
	hintError = null;
	await new Promise((resolve) => setTimeout(resolve, 1200));
	if (current !== requestId || !activeKind) return;
	contentHint = "可以补充一个更具体的原因、限制条件或下一步动作，让回复更完整，但不直接替你写完整句子。";
	isGettingHint = false;
}

async function handleExpressionHelp() {
	if (!activeKind || isGettingHint || !expressionQuery.trim()) return;
	const current = ++requestId;
	isGettingHint = true;
	contentHint = "";
	expressionPhrases = [];
	hintError = null;
	await new Promise((resolve) => setTimeout(resolve, 1100));
	if (current !== requestId || !activeKind) return;
	expressionPhrases = ["the main issue", "to be honest", "a possible cause"];
	isGettingHint = false;
}

function handleWindowClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".hint-demo-trigger") && !target.closest(".hint-bubble")) closeHint();
}
</script>

<svelte:window onclick={handleWindowClick} />

<main class="min-h-screen bg-[#f5f0e8] px-3 py-6 text-[#201c18] sm:px-5">
	<div class="mx-auto grid max-w-6xl gap-5">
		<section class="rounded-lg border border-[#ded7cd] bg-white p-3 shadow-sm sm:p-4" data-demo-kind="reddit">
			<div class="mb-3 text-sm font-semibold text-[#6f675f]">Reddit comment editor</div>
			<div bind:this={redditLayoutReference} class="rounded-md border border-[#0079D3] bg-white" data-demo-anchor="reddit">
				<textarea
					class="block h-24 w-full resize-none px-3 py-2 text-sm outline-none"
					value="Je pense que la panne vient..."
					aria-label="Reddit draft"
				></textarea>
				<div class="flex items-center gap-2 border-t border-[#EDEFF1] bg-[#F6F7F8] px-2 py-1.5">
					<span class="text-xs font-bold text-[#878A8C]">GIF</span>
					<span class="text-sm font-bold text-[#878A8C]">Aa</span>
					<div class="flex-1"></div>
					<button
						type="button"
						class="hint-demo-trigger grid h-7 w-7 place-items-center rounded text-[#878A8C] hover:bg-[#EDEFF1] hover:text-[#FF4500]"
						aria-label="Reddit Hint"
						onclick={(e) => { e.stopPropagation(); openHint("reddit", e.currentTarget); }}
					>
						<Lightbulb size={14} />
					</button>
					<button type="button" class="rounded-full bg-[#FF4500] px-3 py-1 text-xs font-bold text-white">Comment</button>
				</div>
			</div>
		</section>

		<section class="rounded-lg bg-[#313338] p-3 text-[#DBDEE1] shadow-sm sm:p-4" data-demo-kind="discord">
			<div class="mb-3 text-sm font-semibold text-[#B5BAC1]">Discord bottom composer</div>
			<div class="flex min-h-64 flex-col justify-end">
				<div bind:this={discordLayoutReference} class="rounded-lg bg-[#383A40] px-4 py-2" data-demo-anchor="discord">
					<div class="flex items-center gap-3">
						<span class="grid h-6 w-6 place-items-center rounded-full bg-[#B5BAC1] text-[#383A40]">+</span>
						<input
							class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#949BA4]"
							value="Maybe we can check..."
							aria-label="Discord draft"
						>
						<button
							type="button"
							class="hint-demo-trigger text-[#B5BAC1] hover:text-white"
							aria-label="Discord Hint"
							onclick={(e) => { e.stopPropagation(); openHint("discord", e.currentTarget); }}
						>
							<Lightbulb size={20} />
						</button>
						<span class="text-[#B5BAC1]">☺</span>
					</div>
				</div>
			</div>
		</section>

		<section class="rounded-[18px] border border-black/10 bg-[#f2f2f7] p-3 shadow-sm sm:p-4" data-demo-kind="imessage">
			<div class="mb-3 text-sm font-semibold text-[#6b6b70]">iMessage input bar</div>
			<div class="flex min-h-64 flex-col justify-end">
				<div bind:this={imessageLayoutReference} class="relative" data-demo-anchor="imessage">
					<textarea
						class="block min-h-11 w-full resize-none rounded-[22px] border border-[#D1D1D6] bg-white px-4 py-2.5 pr-24 text-[15px] outline-none"
						value="That sounds..."
						aria-label="iMessage draft"
					></textarea>
					<div class="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
						<button
							type="button"
							class="hint-demo-trigger flex h-8 w-8 items-center justify-center rounded-full border border-[#D1D1D6] bg-white text-[#8E8E93] hover:text-[#1C1C1E]"
							aria-label="iMessage Hint"
							onclick={(e) => { e.stopPropagation(); openHint("imessage", e.currentTarget); }}
						>
							<Lightbulb size={16} />
						</button>
						<button type="button" class="grid h-8 w-8 place-items-center rounded-full bg-[#0A84FF] text-white"><Send size={15} /></button>
					</div>
				</div>
			</div>
		</section>

		<section class="rounded-xl border border-black/10 bg-[#f5f5f7] p-3 shadow-sm sm:p-4" data-demo-kind="mail">
			<div class="mb-3 text-sm font-semibold text-[#6b6b70]">Apple Mail compose window</div>
			<div class="overflow-hidden rounded-xl border border-black/15 bg-white shadow-[0_18px_48px_rgba(0,0,0,0.16)]">
				<div class="flex items-center gap-2 border-b border-black/10 bg-[#f7f7f9] px-4 py-2">
					<span class="h-3 w-3 rounded-full bg-[#ff5f57]"></span>
					<span class="h-3 w-3 rounded-full bg-[#ffbd2e]"></span>
					<span class="h-3 w-3 rounded-full bg-[#28c840]"></span>
					<span class="ml-3 text-sm font-semibold text-[#3a3a3c]">New Message</span>
					<button type="button" class="ml-auto grid h-7 w-7 place-items-center rounded-md text-[#6e6e73] hover:bg-black/10 hover:text-[#1d1d1f]">
						×
					</button>
				</div>
				<div class="grid gap-0 border-b border-black/10 text-sm">
					<div class="flex gap-3 border-b border-black/10 px-4 py-2"><span class="w-14 text-[#6e6e73]">To:</span><span>Alex Martin</span></div>
					<div class="flex gap-3 px-4 py-2"><span class="w-14 text-[#6e6e73]">Subject:</span><span>Machine repair update</span></div>
				</div>
				<div class="min-h-40 px-4 py-3 text-sm leading-7 text-[#1d1d1f]">Bonjour, je vous écris au sujet de la machine...</div>
				<div bind:this={mailLayoutReference} class="flex items-center gap-2 border-t border-black/10 bg-[#f7f7f9] px-4 py-3" data-demo-anchor="mail">
					<button type="button" class="rounded-md p-2 text-[#3a3a3c] hover:bg-black/5">⌘</button>
					<div class="mail-hint-wrapper">
						<button
							type="button"
							class="hint-demo-trigger grid h-8 w-8 place-items-center rounded-md text-[#3a3a3c] hover:bg-black/5"
							aria-label="Mail Hint"
							onclick={(e) => { e.stopPropagation(); openHint("mail", e.currentTarget); }}
						>
							<Lightbulb size={17} />
						</button>
					</div>
					<button type="button" class="ml-auto inline-flex items-center gap-2 rounded-md bg-[#3478F6] px-4 py-2 text-sm font-semibold text-white">
						<Send size={15} />
						Send
					</button>
				</div>
			</div>
		</section>

		<section class="rounded border border-[#ccc] bg-white p-3 shadow-sm sm:p-4" data-demo-kind="ao3">
			<div class="mb-3 font-[Georgia,serif] text-xl">AO3 comment form</div>
			<div bind:this={ao3LayoutReference} class="border border-[#ddd] bg-[#f3efec] p-4 shadow-inner" data-demo-anchor="ao3">
				<div class="mb-2 flex justify-between gap-3">
					<p class="m-0">Comment as <strong>Learner</strong></p>
					<p class="m-0 text-xs">Plain text ?</p>
				</div>
				<textarea class="box-border h-32 w-full border border-[#ccc] p-2 font-inherit" value="I liked the way..." aria-label="AO3 draft"></textarea>
				<div class="mt-2 flex items-center justify-between">
					<span class="text-xs">3980 characters left</span>
					<div class="flex gap-2">
						<button
							type="button"
							class="hint-demo-trigger rounded border border-[#bbb] bg-[#eee] px-3 py-1 text-sm shadow-inner"
							onclick={(e) => { e.stopPropagation(); openHint("ao3", e.currentTarget); }}
						>
							<Lightbulb size={14} class="inline" />
							Hint
						</button>
						<button type="button" class="rounded border border-[#bbb] bg-[#eee] px-3 py-1 text-sm shadow-inner">Comment</button>
					</div>
				</div>
			</div>
		</section>
	</div>

	{#if activeKind}
		{#key activeKind}
			<HintFloatingPanel
				anchorName={anchorNameFor(activeKind)}
				layoutReference={layoutReferenceFor(activeKind)}
				{motionOrigin}
				bind:expressionQuery
				{expressionPhrases}
				{contentHint}
				{hintError}
				{isGettingHint}
				disabled={false}
				placement={activeKind === "mail" ? "above" : "auto"}
				onExpressionSubmit={handleExpressionHelp}
				onContentHint={handleContentHint}
				onClose={closeHint}
			/>
		{/key}
	{/if}
</main>
