<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Mail from "@lucide/svelte/icons/mail";
import X from "@lucide/svelte/icons/x";
import { onMount, type Snippet, tick } from "svelte";
import { flip } from "svelte/animate";
import { slide } from "svelte/transition";
import ChangeEmail from "$lib/components/auth/ChangeEmail.svelte";
import ChangePassword from "$lib/components/auth/ChangePassword.svelte";
import KeyForm from "$lib/components/auth/KeyForm.svelte";
import { BACKDROPS, backdropChoice, ofDay, PATTERNS, SERIES } from "$lib/components/backdrop/backdrops";
import { setBackdrop } from "$lib/components/backdrop/state.svelte";
import ChoiceGroup from "$lib/components/common/ChoiceGroup.svelte";
import InfoTip from "$lib/components/common/InfoTip.svelte";
import LanguageFlag from "$lib/components/common/LanguageFlag.svelte";
import Reveal from "$lib/components/common/Reveal.svelte";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import Select from "$lib/components/common/Select.svelte";
import SocialProviderIcon from "$lib/components/common/SocialProviderIcon.svelte";
import Switch from "$lib/components/common/Switch.svelte";
import { tip } from "$lib/components/common/tip";
import Button from "$lib/components/ui/button/button.svelte";
import { APP_LANGS, hasScenarios, LEARNABLE } from "$lib/constants";
import { account, cancelEmailChange, hasPassword } from "$lib/demo/account.svelte";
import { app, demoOpens, endonym, nameOf, setTheme, switchLanguage, THEMES, type Theme, toast, tx } from "$lib/demo/app.svelte";
import { loadLang } from "$lib/i18n/index.svelte";

/* Settings: how the app works for the learner (languages, the tutor, the look, the week, AI, privacy, how they sign
   in). Who they are (picture, name, their history) is the profile's. Each section is a card of rows: a label, its
   help behind an ⓘ, and its control at the row's end; a list or a form takes the row's full width under its label.
   Every change applies at once and says so quietly; only what is typed (the key) waits for a button. */
const saved = () => toast(tx("setSaved"));

const others = $derived((LEARNABLE as readonly string[]).filter((l) => l !== app.prefs.native && !app.prefs.learning.includes(l)));
function setNative(v: string) {
	app.prefs.native = v as (typeof APP_LANGS)[number];
	app.prefs.learning = app.prefs.learning.filter((l) => l !== v);
	if (!app.prefs.learning.length) app.prefs.learning = [v === "en" ? "es" : "en"];
	if (!app.prefs.learning.includes(app.prefs.active)) app.prefs.active = app.prefs.learning[0];
	app.save();
	loadLang(v);
	saved();
}
let adding = $state("");
function addLanguage(v: string) {
	if (!v) return;
	app.prefs.learning.push(v);
	app.save();
	toast(tx("setAdded", { lang: endonym(v) }));
	tick().then(() => (adding = ""));
}
function dropLanguage(l: string) {
	if (app.prefs.learning.length < 2) return;
	const wasActive = l === app.prefs.active;
	app.prefs.learning = app.prefs.learning.filter((x) => x !== l);
	if (wasActive) switchLanguage(app.prefs.learning[0]);
	else app.save();
}

// How they sign in: the address and the password change in dialogs (lib/components/auth).
let emailOpen = $state(false);
let pwOpen = $state(false);
// Appearance: the backdrop is kept on this device (the main app keeps it on the account).
let backdrop = $state(backdropChoice().backdrop as string);
let pattern = $state(backdropChoice().pattern as string);
const pictures = $derived(backdrop === "painting" && app.dark ? null : SERIES[backdrop as keyof typeof SERIES]?.());
const backdropHelp = $derived(
	app.dark && backdrop === "painting"
		? tx("paintingLightOnly")
		: pictures?.length
			? tx("bgToday", { credit: ofDay(pictures, new Date()).credit })
			: "",
);

const fmt = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat(app.lang, o).format(d);

onMount(() => {
	document.title = `${tx("navSettings")} · ${tx("homeTitle")}`;
	if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
});
</script>

<!-- help: always shown, kept for what the learner must know at that moment (a date, a consent); info: behind an ⓘ. -->
{#snippet row(name: string, help: string, control: Snippet, block = false, info = "")}
	<div class="row-set" class:block>
		<div class="label">
			<div class="name">
				{name}
				{#if info}
					<InfoTip text={info} label={name} />
				{/if}
			</div>
			{#if help}
				<p class="help">{help}</p>
			{/if}
		</div>
		<div class="ctl">{@render control()}</div>
	</div>
{/snippet}

<main class="sheet">
	<h1>{tx("navSettings")}</h1>

	<section id="languages" aria-labelledby="set-lang">
		<h2 id="set-lang">{tx("setLanguages")}</h2>
		<div class="card">
			{#snippet nativeCtl()}
				<div class="w-60">
					<Select
						aria-label={tx("setNative")}
						value={app.prefs.native}
						onValueChange={setNative}
						items={APP_LANGS.map((l) => ({ value: l, label: endonym(l), description: l === app.lang ? undefined : nameOf(l) }))}
					/>
				</div>
			{/snippet}
			{@render row(tx("setNative"), "", nativeCtl)}
			{#snippet learningCtl()}
				<div class="langs">
					{#each app.prefs.learning as l (l)}
						<div class="lang" animate:flip={{ duration: 250 }} out:slide={{ duration: 200 }}>
							<LanguageFlag language={l} />
							<span class="nm"
								>{endonym(l)}
								{#if !hasScenarios(l)}
									<span class="sub">{tx("wsNoScenarios")}</span>
								{/if}</span
							>
							{#if l === app.prefs.active}
								<span class="status"><Check class="size-4" aria-hidden="true" />{tx("setActive")}</span>
							{:else}
								<Button variant="secondary" size="sm" onclick={() => switchLanguage(l)}>{tx("setUse")}</Button>
							{/if}
							<span use:tip={tx("setRemove", { lang: endonym(l) })}>
								<Button
									variant="ghost"
									size="icon-sm"
									class="text-muted-foreground"
									disabled={app.prefs.learning.length < 2}
									onclick={() => dropLanguage(l)}
									><X aria-hidden="true" /></Button
								>
							</span>
						</div>
					{/each}
					<Select
						aria-label={tx("setAdd")}
						placeholder={tx("setAdd")}
						bind:value={adding}
						onValueChange={addLanguage}
						items={others.map((l) => ({ value: l, label: endonym(l), description: hasScenarios(l) ? undefined : tx("wsNoScenarios") }))}
					/>
				</div>
			{/snippet}
			{@render row(tx("setLearning"), "", learningCtl, true)}
		</div>
	</section>

	<section aria-labelledby="set-practice">
		<h2 id="set-practice">{tx("setPractice")}</h2>
		<div class="card">
			{#snippet tutorCtl()}
				<ChoiceGroup
					name="feedback"
					legend={tx("feedbackLang")}
					hideLegend
					flat
					columns={1}
					value={app.prefs.feedback}
					onValueChange={(v) => {
						app.prefs.feedback = v as "native" | "target";
						app.save();
						saved();
					}}
					items={[
						{ value: "native", label: tx("fbNativeIn", { lang: nameOf(app.prefs.native) }) },
						{ value: "target", label: tx("fbTarget") },
					]}
				/>
			{/snippet}
			{@render row(tx("feedbackLang"), "", tutorCtl, true, tx("welTutorLede"))}
			{#snippet goalCtl()}
				<SegmentedControl
					label={tx("setWeekGoal")}
					value={String(app.prefs.weeklyGoal)}
					onValueChange={(v) => {
						app.prefs.weeklyGoal = Number(v);
						app.save();
						saved();
					}}
					items={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))}
				/>
			{/snippet}
			{@render row(tx("setWeekGoal"), "", goalCtl, false, tx("weekRule"))}
		</div>
	</section>

	<section aria-labelledby="set-look">
		<h2 id="set-look">{tx("appearance")}</h2>
		<div class="card">
			{#snippet themeCtl()}
				<SegmentedControl
					label={tx("setTheme")}
					value={app.theme}
					onValueChange={(v) => {
						setTheme(v as Theme);
						saved();
					}}
					items={THEMES.map((v) => ({ value: v, label: tx(`themeOpt_${v}`) }))}
				/>
			{/snippet}
			{@render row(tx("setTheme"), "", themeCtl)}
			{#snippet backdropCtl()}
				<SegmentedControl
					label={tx("backdropLabel")}
					bind:value={backdrop}
					onValueChange={(v) => {
						setBackdrop("backdrop", v);
						saved();
					}}
					items={BACKDROPS.map((v: string) => ({
						value: v,
						label: tx(({ none: "bgNone", pattern: "bgPattern", image: "bgImage", painting: "bgPainting" } as Record<string, string>)[v]),
						disabled: v === "painting" && app.dark,
					}))}
				/>
			{/snippet}
			{@render row(tx("backdropLabel"), backdropHelp, backdropCtl)}
			{#snippet patternCtl()}
				<SegmentedControl
					label={tx("patternLabel")}
					bind:value={pattern}
					onValueChange={(v) => {
						setBackdrop("pattern", v);
						saved();
					}}
					items={Object.keys(PATTERNS).map((v) => ({ value: v, label: tx(`pat_${v}`) }))}
				/>
			{/snippet}
			<Reveal open={backdrop === "pattern"}> {@render row(tx("patternLabel"), "", patternCtl)} </Reveal>
		</div>
	</section>

	<section aria-labelledby="set-ai">
		<h2 id="set-ai">{tx("setAi")}</h2>
		<div class="card">
			{#snippet keyCtl()}
				<KeyForm {tx} onsaved={() => toast(tx("setKeySaved"))} />
			{/snippet}
			{@render row(tx("setKey"), tx("setKeyHelp"), keyCtl, true)}
			{#snippet improveCtl()}
				<Switch
					aria-label={tx("setHelpImprove")}
					checked={app.prefs.helpImprove}
					onchange={(e: Event) => {
						app.prefs.helpImprove = (e.currentTarget as HTMLInputElement).checked;
						app.save();
						saved();
					}}
				/>
			{/snippet}
			{@render row(tx("setHelpImprove"), "", improveCtl, false, tx("setHelpImproveHelp"))}
		</div>
	</section>

	<section aria-labelledby="set-account">
		<h2 id="set-account">{tx("setSignIn")}</h2>
		<div class="card">
			<div class="method">
				<span class="mi"><Mail class="size-[18px]" aria-hidden="true" /></span>
				<div class="main">
					<div class="t">{tx(hasPassword() ? "setEmailPw" : "acEmailOnly")}</div>
					<div class="s">{account.me.email}</div>
					{#if account.me.pendingEmail}
						<div class="s pending">
							{tx("acPending", { email: account.me.pendingEmail })}
							<button type="button" class="link" onclick={cancelEmailChange}>{tx("acCancelChange")}</button>
						</div>
					{/if}
				</div>
				<div class="btns">
					<Button variant="secondary" size="sm" aria-haspopup="dialog" onclick={() => (emailOpen = true)}>{tx("setChangeEmail")}</Button>
					<Button variant="secondary" size="sm" aria-haspopup="dialog" onclick={() => (pwOpen = true)}
						>{tx(hasPassword() ? "setChangePw" : "acSetPw")}</Button
					>
				</div>
			</div>
			<div class="method">
				<span class="mi"><SocialProviderIcon provider="google" class="size-[18px]" /></span>
				<div class="main">
					<div class="t">Google</div>
					<div class="s">{tx("setConnectedSince", { date: fmt({ year: "numeric", month: "short" }, new Date(2026, 6, 4)) })}</div>
				</div>
				<Button variant="secondary" size="sm" class="text-destructive" onclick={demoOpens}>{tx("setDisconnect")}</Button>
			</div>
			<div class="method">
				<span class="mi"><SocialProviderIcon provider="github" class="size-[18px]" /></span>
				<div class="main">
					<div class="t">GitHub</div>
					<div class="s">{tx("setNotConnected")}</div>
				</div>
				<Button variant="secondary" size="sm" onclick={demoOpens}>{tx("setConnect")}</Button>
			</div>
		</div>
	</section>

	<ChangeEmail bind:open={emailOpen} />
	<ChangePassword bind:open={pwOpen} />

	<nav class="links" aria-label={tx("setLinks")}>
		{#each ["setLinkHome", "setLinkChangelog", "setLinkPrivacy", "setLinkTerms"] as k (k)}
			<a
				href="/settings"
				onclick={(e) => {
					e.preventDefault();
					demoOpens();
				}}
				>{tx(k)}</a
			>
		{/each}
	</nav>
</main>

<style>
section {
	margin-top: 34px;
}
section > h2 {
	display: flex;
	align-items: center;
	font-size: 21px;
	margin-bottom: 10px;
}
/* A section's rows on one sheet of paper, divided by hairlines. */
.card {
	padding: 0 18px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	box-shadow: var(--paper-lift);
}
.row-set {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px 24px;
	min-height: 60px;
	padding: 10px 0;
}
.row-set + .row-set,
.card :global(.reveal .row-set),
.card :global(.reveal + .row-set) {
	border-top: 1px solid var(--line-soft);
}
.row-set.block {
	display: grid;
	justify-content: stretch;
	gap: 10px;
	padding: 14px 0 16px;
}
.label {
	flex: 1 1 14rem;
	min-width: 0;
	max-width: 30rem;
}
.name {
	font-size: 14.5px;
	font-weight: 500;
}
/* What the learner needs to choose well stays in sight, small, under the name. */
.help {
	margin: 2px 0 0;
	color: var(--muted);
	font-size: 13px;
	line-height: 1.45;
}
.status {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--muted);
	font-size: 13px;
	white-space: nowrap;
}
.ctl {
	min-width: 0;
}
.langs {
	display: grid;
	gap: 6px;
}
.lang {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 48px;
	padding: 4px 6px 4px 12px;
	border-radius: 6px;
	background: var(--well);
}
.lang .nm {
	flex: 1;
	min-width: 0;
	font-size: 14.5px;
}
.lang .sub {
	display: block;
	color: var(--muted);
	font-size: 12.5px;
}
.method {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	min-height: 64px;
	padding: 10px 0;
}
/* The address's two buttons stay together: beside it, or both on the next line under it. */
.btns {
	display: flex;
	gap: 8px;
}
@media (max-width: 560px) {
	.btns {
		flex-basis: 100%;
		padding-inline-start: 48px;
	}
}
.method + .method {
	border-top: 1px solid var(--line-soft);
}
.mi {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	flex: none;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	color: var(--ink);
}
.method .main {
	flex: 1 1 160px;
	min-width: 0;
}
.t {
	font-size: 14.5px;
	font-weight: 500;
}
.s {
	font-size: 13px;
	color: var(--muted);
	overflow-wrap: anywhere;
}
/* A new address waiting for its link, under the one that still signs in. */
.s.pending {
	color: var(--warn);
}
.s .link {
	border: 0;
	padding: 0;
	background: none;
	color: var(--ink);
	font: inherit;
	text-decoration: underline;
	text-decoration-color: color-mix(in srgb, var(--ink) 30%, transparent);
	text-underline-offset: 3px;
	cursor: pointer;
}
.s .link:hover {
	text-decoration-color: var(--ink);
}
.links {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 18px;
	margin-top: 36px;
}
.links a {
	color: var(--muted);
	font-size: 13px;
	text-decoration: none;
}
.links a:hover {
	color: var(--ink);
}
@media (max-width: 640px) {
	.card {
		padding: 0 14px;
	}
}
</style>
