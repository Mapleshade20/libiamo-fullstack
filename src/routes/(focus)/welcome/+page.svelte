<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import { onMount } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import { blur, fly } from "svelte/transition";
import { account, auth, speak } from "#lib/account/account.svelte.ts";
import { app } from "#lib/account/app.svelte.ts";
import { applyLang } from "#lib/account/language.ts";
import { finishWelcome } from "#lib/account/onboarding.svelte.ts";
import KeyForm from "#lib/components/auth/KeyForm.svelte";
import ChoiceGroup from "#lib/components/common/ChoiceGroup.svelte";
import LanguageFlag from "#lib/components/common/LanguageFlag.svelte";
import MarkedLine from "#lib/components/common/MarkedLine.svelte";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import Select from "#lib/components/common/Select.svelte";
import Sticker from "#lib/components/stickers/Sticker.svelte";
import { drinkOf } from "#lib/components/streak/glass/drinks.ts";
import Glass from "#lib/components/streak/glass/Glass.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { APP_LANGS, type AppLang, endonym, hasScenarios, isAppLang, LEARNABLE, langName } from "#lib/constants.ts";
import { loadLang, t } from "#lib/i18n/index.svelte.ts";
import { today } from "#lib/time/clock.svelte.ts";
import { goto } from "$app/navigation";

/*
 * The first visit, after signing up: a few questions, one at a time, each with a word marked by hand, then a tour of the
 * home page. The key step asks for the learner's own AI key (there is no trial); the tour runs on its tapes, so it can be
 * added later. It speaks the learner's own language from the second step on (the interface language only exists once
 * they have picked what they learn), and every answer can be changed later in settings.
 */
// The language the sign-in pages spoke (the browser's, or the one picked there) is the first guess at theirs.
let native = $state<AppLang>(auth.lang);
// A provider gives a name; an address gives at least the part before the @.
const fallbackName = account.me.email
	.split("@")[0]
	.replace(/[._-]+/g, " ")
	.replace(/\b\w/g, (c) => c.toUpperCase());
let name = $state(account.me.via === "email" ? "" : (account.me.name ?? ""));
let learning = $state<string[]>([]);
let feedback = $state<"native" | "target">("native");
let goal = $state("3");
let step = $state(0);
let back = $state(false);
const STEPS = 7;
const KEY = 6;
$effect(() => {
	loadLang(native);
	speak(native);
});
const tx = (key: string, vars?: Record<string, string | number>) => t(native, key, vars);
const reduced = new MediaQuery("(prefers-reduced-motion: reduce)", false);
const offered = $derived((LEARNABLE as readonly string[]).filter((l) => l !== native));
const canGo = $derived(step !== 3 || learning.length > 0);
function next() {
	if (!canGo) return;
	back = false;
	if (step < STEPS) step++;
}
function prev() {
	back = true;
	step--;
}
function toggle(l: string) {
	learning = learning.includes(l) ? learning.filter((x) => x !== l) : [...learning, l];
}
async function finish(tour: boolean) {
	app.prefs.name = name.trim() || fallbackName;
	app.prefs.native = native;
	app.prefs.learning = learning.length ? learning : [native === "en" ? "es" : "en"];
	app.prefs.active = app.prefs.learning[0];
	app.prefs.feedback = feedback;
	app.prefs.weeklyGoal = Number(goal);
	await loadLang(app.prefs.active);
	applyLang();
	await finishWelcome(tour);
	goto("/");
}
$effect(() => {
	document.title = "Libiamo";
});
const dur = $derived(reduced.current ? 0 : 1);
// Each sticker plays its press as it lands.
let played = $state(-1);
onMount(() => {
	if (reduced.current) return;
	const timers = [0, 1, 2, 3].map((k) => setTimeout(() => (played = k), 260 + k * 160));
	return () => timers.forEach(clearTimeout);
});
</script>

<header class="top">
	<span class="wordmark">Libiamo</span>
	<ol class="dots" aria-label={tx("welProgress", { i: step + 1, n: STEPS + 1 })}>
		{#each Array.from({ length: STEPS + 1 }) as _, i}
			<li class:on={i === step} class:done={i < step}></li>
		{/each}
	</ol>
</header>

<main class="welcome">
	<div class="stage">
		{#key step}
			<section
				class="step"
				in:fly={{ x: (back ? -24 : 24) * dur, duration: 320 * dur, delay: 120 * dur, opacity: 0 }}
				out:blur={{ duration: 140 * dur, amount: 3 }}
			>
				{#if step === 0}
					<!-- The desk: the app's four stickers, pasted down one after another. -->
					<div class="desk" aria-hidden="true">
						{#each [
							["pen", -6],
							["clink", 4],
							["cards", -3],
							["box", 5],
						] as [name, tilt], k}
							<span class="paste" style:--k={k} class:playing={played === k}
								><Sticker name={name as "pen"} size={44} tilt={tilt as number} playing={played === k} /></span
							>
						{/each}
					</div>
					<h1><MarkedLine text={tx("welHello")} delay={900} /></h1>
					<p class="lede">{tx("welHelloLede")}</p>
				{:else if step === 1}
					<h1><MarkedLine text={tx("welName")} /></h1>
					<p class="lede">{tx("welNameLede")}</p>
					<div class="ctl narrow">
						<input
							class="input"
							bind:value={name}
							placeholder={fallbackName}
							aria-label={tx("welNameLabel")}
							maxlength="40"
							autocomplete="nickname"
							onkeydown={(e) => e.key === "Enter" && next()}
						>
					</div>
				{:else if step === 2}
					<h1><MarkedLine text={tx("welNative")} type="circle" /></h1>
					<p class="lede">{tx("welNativeLede")}</p>
					<div class="ctl narrow">
						<Select
							aria-label={tx("setNative")}
							value={native}
							onValueChange={(v) => {
								if (isAppLang(v)) native = v;
							}}
							items={APP_LANGS.map((l) => ({ value: l, label: endonym(l), description: l === native ? undefined : langName(l, native) }))}
						/>
					</div>
				{:else if step === 3}
					<h1><MarkedLine text={tx("welLearning")} /></h1>
					<p class="lede">{tx("welLearningLede")}</p>
					<!-- biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons, not form fields -->
					<div class="langs" role="group" aria-label={tx("setLearning")}>
						{#each offered as l (l)}
							<button type="button" class="lang" aria-pressed={learning.includes(l)} onclick={() => toggle(l)}>
								<span class="check" aria-hidden="true"><Check class="size-3.5" strokeWidth={3} /></span>
								<LanguageFlag language={l} />
								<span class="nm">{endonym(l)}<small>{hasScenarios(l) ? langName(l, native) : tx("welNoPrompts")}</small></span>
							</button>
						{/each}
					</div>
				{:else if step === 4}
					<h1><MarkedLine text={tx("welTutor")} /></h1>
					<p class="lede">{tx("welTutorLede")}</p>
					<div class="ctl">
						<ChoiceGroup
							name="feedback"
							legend={tx("feedbackLang")}
							bind:value={feedback}
							items={[
								{ value: "native", label: tx("fbNativeIn", { lang: langName(native, native) }), description: tx("fbNativeSub") },
								{ value: "target", label: tx("fbTarget"), description: tx("fbTargetSub") },
							]}
						/>
					</div>
				{:else if step === 5}
					<h1><MarkedLine text={tx("welWeek")} type="circle" /></h1>
					<p class="lede">{tx("welWeekLede")}</p>
					<div class="week">
						<Glass drink={drinkOf(today())} look="full" size={96} stage idle />
						<SegmentedControl
							label={tx("setWeekGoal")}
							bind:value={goal}
							items={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
						/>
					</div>
				{:else if step === KEY}
					<h1><MarkedLine text={tx("welKey")} /></h1>
					<p class="lede">{tx("welKeyLede")}</p>
					<div class="ctl"><KeyForm {tx} onsaved={next} /></div>
				{:else}
					<h1><MarkedLine text={tx("welReady")} type="highlight" /></h1>
					<p class="lede">{tx("welReadyLede")}</p>
				{/if}
			</section>
		{/key}
	</div>
	<div class="actions">
		{#if step > 0}
			<Button variant="ghost" onclick={prev}><ArrowLeft aria-hidden="true" />{tx("welBack")}</Button>
		{/if}
		<span class="grow"></span>
		{#if step < STEPS}
			{#if step === KEY && !account.me.key}
				<Button variant="ghost" onclick={next}>{tx("welKeyLater")}</Button>
			{:else}
				<Button onclick={next} disabled={!canGo}>{tx(step === 0 ? "welStart" : "welNext")}</Button>
			{/if}
		{:else}
			<Button variant="ghost" onclick={() => finish(false)}>{tx("welSkipTour")}</Button>
			<Button onclick={() => finish(true)}>{tx("welTour")}</Button>
		{/if}
	</div>
</main>

<style>
.top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left));
}
.wordmark {
	font-size: 32px;
	view-transition-name: brand;
}
.dots {
	display: flex;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.dots li {
	width: 6px;
	height: 6px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--ink) 18%, transparent);
	transition:
		width 250ms var(--ease-panel),
		background-color 250ms;
}
.dots li.done {
	background: color-mix(in srgb, var(--ink) 45%, transparent);
}
.dots li.on {
	width: 18px;
	background: var(--wine);
}
.welcome {
	width: min(600px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(32px, 12vh, 120px) 0 64px;
	display: flex;
	flex-direction: column;
	min-height: calc(100dvh - 60px);
}
.stage {
	display: grid;
	flex: 1;
}
.step {
	grid-area: 1 / 1;
	min-width: 0;
}
h1 {
	font-size: clamp(30px, 5vw, 42px);
	line-height: 1.2;
	margin-bottom: 14px;
	text-wrap: balance;
}
.lede {
	margin: 0 0 26px;
	color: var(--ink-2);
	font-size: 16px;
	line-height: 1.6;
	max-width: 46ch;
}
.desk {
	display: flex;
	gap: 18px;
	margin-bottom: 28px;
}
.paste {
	animation: paste-in 420ms var(--ease-spring) calc(120ms + var(--k) * 160ms) both;
}
@keyframes paste-in {
	from {
		opacity: 0;
		transform: translateY(-10px) scale(1.25);
	}
}
@media (prefers-reduced-motion: reduce) {
	.paste {
		animation: none;
	}
}
.ctl.narrow {
	max-width: 320px;
}
.input {
	width: 100%;
	height: 40px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--field);
	color: var(--ink);
	font-size: 15px;
}
.input:focus {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 40%, transparent);
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 50%, transparent);
}
.input::placeholder {
	color: var(--muted);
}
.langs {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 8px;
}
.lang {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 52px;
	padding: 8px 12px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--field);
	color: var(--ink);
	text-align: start;
	cursor: pointer;
	transition:
		border-color 150ms var(--ease-panel),
		background-color 150ms var(--ease-panel),
		scale 150ms;
}
.lang:hover {
	border-color: color-mix(in srgb, var(--ink) 30%, transparent);
}
.lang:active {
	scale: 0.97;
}
.lang[aria-pressed="true"] {
	border-color: color-mix(in srgb, var(--ink) 60%, transparent);
	background: var(--field-strong);
}
.lang:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.check {
	display: grid;
	place-items: center;
	width: 18px;
	height: 18px;
	flex: none;
	border-radius: 5px;
	border: 1.5px solid color-mix(in srgb, var(--ink) 35%, transparent);
	color: transparent;
	transition:
		background-color 150ms,
		border-color 150ms,
		color 150ms;
}
.lang[aria-pressed="true"] .check {
	background: var(--ink);
	border-color: var(--ink);
	color: var(--bg);
}
.nm {
	display: flex;
	flex-direction: column;
	font-size: 14.5px;
	font-weight: 500;
	line-height: 1.3;
}
.nm small {
	font-size: 12px;
	font-weight: 400;
	color: var(--muted);
}
.week {
	display: flex;
	align-items: center;
	gap: 18px;
	flex-wrap: wrap;
}
.actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 32px;
}
.grow {
	flex: 1;
}
</style>
