<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import BookA from "@lucide/svelte/icons/book-a";
import Pilcrow from "@lucide/svelte/icons/pilcrow";
import X from "@lucide/svelte/icons/x";
import type { TransitionConfig } from "svelte/transition";
import { Skeleton } from "$lib/components/ui/skeleton";
import { getHintLabels } from "./i18n";

type HintFloatingPlacement = "auto" | "above" | "below";
type HintFloatingSide = "above" | "below";

let {
	anchorName,
	layoutReference,
	motionOrigin,
	language = "en",
	expressionQuery = $bindable(""),
	expressionPhrases = [],
	contentHint = "",
	hintError = null,
	isGettingHint = false,
	disabled = false,
	placement = "auto",
	onExpressionSubmit,
	onContentHint,
	onClose,
}: {
	anchorName: string;
	layoutReference: HTMLElement | null;
	motionOrigin: HTMLElement | null;
	language?: string;
	expressionQuery?: string;
	expressionPhrases?: string[];
	contentHint?: string;
	hintError?: string | null;
	isGettingHint?: boolean;
	disabled?: boolean;
	placement?: HintFloatingPlacement;
	onExpressionSubmit: () => void;
	onContentHint: () => void;
	onClose: () => void;
} = $props();

let panelEl = $state<HTMLDivElement | null>(null);
let resultContentEl = $state<HTMLDivElement | null>(null);
let contentHintContentEl = $state<HTMLDivElement | null>(null);
let expressionInputEl = $state<HTMLInputElement | null>(null);
let resultHeight = $state(0);
let contentHintHeight = $state(0);
let expressionFocused = $state(false);
let contentMode = $state(false);
let submittedExpressionQuery = $state("");
let expressionResultCleared = $state(false);
const labels = $derived(getHintLabels(language));
const hasExpressionQuery = $derived(Boolean(expressionQuery.trim()));
const expressionExpanded = $derived(expressionFocused);
const showContentHintButton = $derived(!contentMode && !expressionFocused && !hasExpressionQuery);
const visibleExpressionPhrases = $derived(
	!contentMode && !expressionResultCleared && submittedExpressionQuery !== "" && expressionQuery.trim() === submittedExpressionQuery
		? expressionPhrases
		: [],
);
const expressionLoading = $derived(
	!contentMode && isGettingHint && !expressionResultCleared && submittedExpressionQuery !== "" && expressionQuery.trim() === submittedExpressionQuery,
);
const hasExpressionResult = $derived(expressionLoading || (!contentMode && Boolean(hintError)) || visibleExpressionPhrases.length > 0);
const hasContentHintResult = $derived(contentMode && (isGettingHint || Boolean(hintError) || Boolean(contentHint)));
const prefersAbove = $derived(placement === "above");
const allowsBlockFlip = $derived(placement === "auto");

function transitionCss(t: number, side: HintFloatingSide, originX: number, originY: number) {
	const eased = 1 - (1 - t) ** 3;
	const closed = 1 - eased;
	const y = closed * (side === "below" ? -10 : 10);
	const scaleX = 0.72 + eased * 0.28;
	const scaleY = 0.6 + eased * 0.4;
	const insetInline = closed * 17;
	const insetNear = closed * 6;
	const insetFar = closed * 34;
	const insetTop = side === "below" ? insetNear : insetFar;
	const insetBottom = side === "below" ? insetFar : insetNear;
	const radius = 14 + closed * 5;

	return `
		opacity: ${Math.min(1, eased * 1.15)};
		transform-origin: ${originX}px ${originY}px;
		transform: translateY(${y}px) scale(${scaleX}, ${scaleY});
		clip-path: inset(${insetTop}% ${insetInline}% ${insetBottom}% ${insetInline}% round ${radius}px);
		will-change: opacity, transform, clip-path;
	`;
}

function getTransitionGeometry(node: Element) {
	const panelRect = node.getBoundingClientRect();
	const originRect = motionOrigin?.getBoundingClientRect() ?? layoutReference?.getBoundingClientRect();
	const originCenterX = originRect ? originRect.left + originRect.width / 2 : panelRect.left + panelRect.width / 2;
	const originCenterY = originRect ? originRect.top + originRect.height / 2 : panelRect.top + panelRect.height / 2;

	return {
		panelRect,
		side: panelRect.top >= originCenterY ? ("below" as const) : ("above" as const),
		originX: originCenterX - panelRect.left,
		originY: originCenterY - panelRect.top,
	};
}

function panelIntro(node: Element): TransitionConfig {
	const transitionGeometry = getTransitionGeometry(node);

	return {
		duration: 300,
		css: (t) => transitionCss(t, transitionGeometry.side, transitionGeometry.originX, transitionGeometry.originY),
	};
}

function panelOutro(node: Element): TransitionConfig {
	const transitionGeometry = getTransitionGeometry(node);
	const { panelRect } = transitionGeometry;

	return {
		duration: 180,
		css: (t) => `
			position: fixed;
			position-area: none;
			position-anchor: none;
			inset: auto;
			top: ${panelRect.top}px;
			right: auto;
			bottom: auto;
			left: ${panelRect.left}px;
			width: ${panelRect.width}px;
			max-height: ${panelRect.height}px;
			margin: 0;
			${transitionCss(t, transitionGeometry.side, transitionGeometry.originX, transitionGeometry.originY)}
		`,
	};
}

function updateResultHeight() {
	resultHeight = hasExpressionResult ? (resultContentEl?.offsetHeight ?? 0) : 0;
}

function updateContentHintHeight() {
	contentHintHeight = hasContentHintResult ? (contentHintContentEl?.offsetHeight ?? 0) : 0;
}

function handleExpressionKeydown(e: KeyboardEvent) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		submitExpression();
	}
}

function submitExpression() {
	if (!expressionQuery.trim() || isGettingHint || disabled) return;
	contentMode = false;
	submittedExpressionQuery = expressionQuery.trim();
	expressionResultCleared = false;
	onExpressionSubmit();
	expressionInputEl?.blur();
}

function handlePrimaryAction(event: MouseEvent) {
	event.stopPropagation();
	if (contentMode) {
		leaveContentMode();
		return;
	}

	submitExpression();
}

function requestContentHint(event?: MouseEvent) {
	event?.stopPropagation();
	if (contentMode || isGettingHint || disabled) return;
	contentMode = true;
	onContentHint();
}

function leaveContentMode() {
	contentMode = false;
}

function clearExpression(event?: MouseEvent) {
	event?.stopPropagation();
	expressionResultCleared = true;
	expressionQuery = "";
	expressionInputEl?.blur();
}

function handleExpressionInput(event: Event) {
	expressionQuery = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : expressionQuery;
	if (submittedExpressionQuery !== "" && expressionQuery.trim() !== submittedExpressionQuery) {
		expressionResultCleared = true;
	}
}

function handleWindowPointerdownCapture(event: PointerEvent) {
	if (document.activeElement !== expressionInputEl) return;

	const target = event.target;
	if (!(target instanceof Node)) return;
	if (target === expressionInputEl) return;

	expressionInputEl?.blur();
}

function handleWindowKeydownCapture(event: KeyboardEvent) {
	if (event.key !== "Escape") return;

	if (document.activeElement === expressionInputEl) {
		event.preventDefault();
		event.stopImmediatePropagation();
		expressionInputEl?.blur();
		return;
	}

	onClose();
}

$effect(() => {
	hasExpressionResult;
	contentMode;
	isGettingHint;
	hintError;
	contentHint;
	visibleExpressionPhrases.length;
	requestAnimationFrame(updateResultHeight);
	requestAnimationFrame(updateContentHintHeight);
});

$effect(() => {
	const observedElements = [panelEl, resultContentEl, contentHintContentEl].filter((element): element is HTMLDivElement => element !== null);
	if (observedElements.length === 0 || typeof ResizeObserver === "undefined") return;

	const observer = new ResizeObserver(() => {
		updateResultHeight();
		updateContentHintHeight();
	});
	for (const element of observedElements) observer.observe(element);
	updateResultHeight();
	updateContentHintHeight();

	return () => observer.disconnect();
});

$effect(() => {
	if (!layoutReference) return;
	const previousAnchorName = layoutReference.style.getPropertyValue("anchor-name");
	layoutReference.style.setProperty("anchor-name", anchorName);

	return () => {
		if (previousAnchorName) {
			layoutReference.style.setProperty("anchor-name", previousAnchorName);
		} else {
			layoutReference.style.removeProperty("anchor-name");
		}
	};
});
</script>

<svelte:window onkeydowncapture={handleWindowKeydownCapture} onpointerdowncapture={handleWindowPointerdownCapture} />

<div
	bind:this={panelEl}
	role="dialog"
	aria-label={labels.panel}
	tabindex="-1"
	class="hint-bubble fixed z-[80] overflow-hidden rounded-[14px] border border-white/70 bg-[#f7f1ea]/90 shadow-[0_18px_46px_rgba(54,42,25,0.16),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-2xl"
	style:--hint-anchor={anchorName}
	style:--hint-position-area={prefersAbove ? "block-start center" : "block-end center"}
	style:--hint-position-fallbacks={allowsBlockFlip ? "flip-block" : "none"}
	onclick={(event) => event.stopPropagation()}
	onkeydown={(event) => event.stopPropagation()}
	in:panelIntro
	out:panelOutro
>
	<div class="relative min-h-10 max-h-[calc(100vh-24px)] overflow-y-auto">
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(143,163,177,0.13),transparent_42%),radial-gradient(circle_at_92%_14%,rgba(255,153,102,0.1),transparent_40%)]"
		></div>
		<div class="relative flex items-center px-2 py-1.5">
			<button
				type="button"
				class="relative mr-2 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#333333] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-[background-color,transform,opacity] duration-200 hover:scale-[1.02] hover:bg-[#242424] disabled:scale-100 disabled:bg-[#969696] disabled:opacity-35"
				onclick={handlePrimaryAction}
				disabled={contentMode ? false : !expressionQuery.trim() || isGettingHint || disabled}
				title={contentMode ? labels.back : labels.submit}
				aria-label={contentMode ? labels.back : labels.submit}
			>
				<span
					class="absolute transition-[opacity,transform] duration-300 ease-out"
					style:opacity={contentMode ? 0 : 1}
					style:transform={contentMode ? "rotate(-90deg) scale(0.75)" : "rotate(0deg) scale(1)"}
				>
					<ArrowUp size={16} />
				</span>
				<span
					class="absolute transition-[opacity,transform] duration-300 ease-out"
					style:opacity={contentMode ? 1 : 0}
					style:transform={contentMode ? "rotate(0deg) scale(1)" : "rotate(90deg) scale(0.75)"}
				>
					<ArrowLeft size={16} />
				</span>
			</button>

			<div
				class="flex min-w-0 flex-1 items-center overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 ease-out"
				class:max-w-0={contentMode}
				class:max-w-[calc(100%-0px)]={!contentMode}
				class:mr-0={contentMode}
				class:mr-2={!contentMode}
				class:opacity-0={contentMode}
				class:opacity-100={!contentMode}
				class:-translate-x-2={contentMode}
			>
				<div
					class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-[#fbfaf7]/90 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition-[flex-basis,box-shadow,background-color] duration-300 ease-out"
					class:bg-[#fffdf9]={expressionExpanded}
					class:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.86)]={expressionExpanded}
				>
					<input
						bind:this={expressionInputEl}
						value={expressionQuery}
						class="min-w-0 flex-1 bg-transparent text-xs text-[#2f2a25] outline-none placeholder:text-[#8c8782]"
						placeholder={labels.expressionPlaceholder}
						onfocus={() => { expressionFocused = true; }}
						onblur={() => { expressionFocused = false; }}
						oninput={handleExpressionInput}
						onkeydown={handleExpressionKeydown}
						{disabled}
					>
					{#if hasExpressionQuery}
						<button
							type="button"
							class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#cfd0d2] text-white/70 transition-[background-color,transform] duration-200 hover:scale-105 hover:bg-[#c4c5c8] disabled:opacity-40"
							onclick={clearExpression}
							{disabled}
							title={labels.clear}
							aria-label={labels.clear}
						>
							<X size={11} strokeWidth={3.1} />
						</button>
					{:else}
						<span class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#8c7b6c]" aria-hidden="true"> <BookA size={17} /> </span>
					{/if}
				</div>
			</div>

			<div
				class="grid shrink-0 overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out"
				class:max-w-0={!showContentHintButton && !contentMode}
				class:max-w-[170px]={showContentHintButton}
				class:max-w-full={contentMode}
				class:flex-1={contentMode}
				class:opacity-0={!showContentHintButton && !contentMode}
				class:opacity-100={showContentHintButton || contentMode}
				class:translate-x-2={!showContentHintButton && !contentMode}
			>
				<button
					type="button"
					class="flex min-h-9 w-full items-center gap-2 rounded-[10px] bg-[#fbfaf7]/90 px-3 text-left text-xs text-[#6f675f] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition-[background-color,color,transform,box-shadow] duration-200 hover:bg-[#fffdf9] hover:text-[#2f2a25] disabled:opacity-100"
					class:whitespace-nowrap={!contentMode}
					onclick={requestContentHint}
					disabled={isGettingHint || disabled || contentMode}
				>
					<Pilcrow size={17} strokeWidth={1.9} class="shrink-0 text-[#8c7b6c]" />
					{#if contentMode}
						<div
							class="min-w-0 flex-1 overflow-hidden transition-[height,opacity] duration-200 ease-out"
							style:height={`${contentHintHeight}px`}
							style:opacity={hasContentHintResult ? 1 : 0}
						>
							<div bind:this={contentHintContentEl}>
								{#if isGettingHint}
									<div class="flex h-6 items-center"><Skeleton class="h-2.5 w-full bg-[#d8d3cd]/80" /></div>
								{:else if hintError}
									<span class="block min-w-0 whitespace-normal leading-6 text-red-600">{hintError}</span>
								{:else}
									<span class="block min-w-0 whitespace-normal leading-6 text-[#2f2a25]">{contentHint}</span>
								{/if}
							</div>
						</div>
					{:else}
						<span class="font-bold">{labels.contentIdea}</span>
					{/if}
				</button>
			</div>
		</div>

		{#if !contentMode}
			<div
				class="relative overflow-hidden transition-[height,opacity] duration-200 ease-out"
				style:height={`${resultHeight}px`}
				style:opacity={hasExpressionResult ? 1 : 0}
			>
				<div bind:this={resultContentEl} class="relative px-4 pb-2 pt-0.5">
					{#if expressionLoading}
						<div class="grid gap-1.5 py-1">
							<Skeleton class="h-2.5 w-3/4 bg-[#d8d3cd]/80" />
							<Skeleton class="h-2.5 w-1/2 bg-[#d8d3cd]/70" />
						</div>
					{:else if hintError}
						<p class="text-xs leading-6 text-red-600">{hintError}</p>
					{:else if visibleExpressionPhrases.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each visibleExpressionPhrases as phrase}
								<span class="rounded-md border border-[#efe7dc] bg-white/65 px-2.5 py-1 text-xs text-[#2f2a25] shadow-sm">{phrase}</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
.hint-bubble {
	inset: auto;
	position-anchor: var(--hint-anchor);
	position-area: var(--hint-position-area);
	position-try-fallbacks: var(--hint-position-fallbacks);
	justify-self: anchor-center;
	margin-block: 8px;
	width: min(anchor-size(width), calc(100vw - 24px));
	max-width: calc(100vw - 24px);
	max-height: calc(100vh - 24px);
}

@supports not (position-anchor: --fallback-anchor) {
	.hint-bubble {
		top: 12px;
		left: 12px;
		width: calc(100vw - 24px);
	}
}
</style>
