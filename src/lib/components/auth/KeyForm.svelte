<script lang="ts">
import ExternalLink from "@lucide/svelte/icons/external-link";
import { shake } from "$lib/components/common/motion";
import Reveal from "$lib/components/common/Reveal.svelte";
import Select from "$lib/components/common/Select.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { account, RECOMMENDED_KEY, setKey } from "$lib/demo/account.svelte";

/*
 * The learner's own AI key, which every call runs on (there is no trial). Four providers, the base URL following the
 * provider, and setups known to work, one press to fill provider and model; the first, Claude Haiku through
 * OpenRouter, is the one we recommend and the one a new key starts from. Once saved, the key shows as the setup it
 * runs, with a way to replace it: the line folds away as the form opens in its place (and back on saving or
 * cancelling), never a cut. Used by the settings page and the welcome.
 */
let { tx, onsaved }: { tx: (k: string, v?: Record<string, string | number>) => string; onsaved?: () => void } = $props();

const PROVIDERS = [
	{ value: "openrouter", label: "OpenRouter", keys: "https://openrouter.ai/keys" },
	{ value: "deepseek", label: "DeepSeek", keys: "https://platform.deepseek.com/api_keys" },
	{ value: "openai", label: "OpenAI", keys: "https://platform.openai.com/api-keys" },
	{ value: "glm", label: "Zhipu AI / GLM", keys: "https://open.bigmodel.cn/usercenter/apikeys" },
];
const PRESETS = [
	{ name: "Claude Haiku", ...RECOMMENDED_KEY },
	{ name: "GPT Luna", provider: "openrouter", model: "~openai/gpt-luna-latest" },
	{ name: "DeepSeek Flash", provider: "deepseek", model: "deepseek-flash" },
	{ name: "GPT Luna", provider: "openai", model: "gpt-6-luna" },
];
const providerOf = (v: string) => PROVIDERS.find((p) => p.value === v);
const setupName = (k: { provider: string; model: string }) => PRESETS.find((p) => p.provider === k.provider && p.model === k.model)?.name ?? k.model;

let replacing = $state(false);
const formOpen = $derived(!account.me.key || replacing);
function replace() {
	replacing = true;
	// Once it has started to open: the field is where the eye goes next.
	setTimeout(() => keyInput?.focus({ preventScroll: true }), 120);
}
let currentEl: HTMLElement | undefined = $state();
// Closing the form hands focus back to the button that opened it, not to a field that just went inert.
const back = () => setTimeout(() => currentEl?.querySelector("button")?.focus({ preventScroll: true }), 0);
function cancel() {
	replacing = false;
	key = "";
	back();
}
let provider = $state(account.me.key?.provider ?? RECOMMENDED_KEY.provider);
let model = $state(account.me.key?.model ?? RECOMMENDED_KEY.model);
let key = $state("");
let keyInput: HTMLInputElement | undefined = $state();
function usePreset(p: (typeof PRESETS)[number]) {
	provider = p.provider;
	model = p.model;
	keyInput?.focus();
}
// The demo never keeps the key itself: the main app encrypts it on the server.
function save(e: SubmitEvent) {
	e.preventDefault();
	if (!key.trim()) {
		shake(keyInput);
		keyInput?.focus();
		return;
	}
	key = "";
	const had = !!account.me.key;
	setKey({ provider, model: model.trim() || RECOMMENDED_KEY.model });
	replacing = false;
	if (had) back();
	onsaved?.();
}
</script>

<Reveal open={!formOpen} visible>
	<div class="current" bind:this={currentEl}>
		{#if account.me.key}
			<span
				>{tx("setKeyCurrent", {
					setup: setupName(account.me.key),
					provider: providerOf(account.me.key.provider)?.label ?? account.me.key.provider,
				})}</span
			>
		{/if}
		<Button variant="secondary" size="sm" onclick={replace}>{tx("setKeyReplace")}</Button>
	</div>
</Reveal>
<Reveal open={formOpen} visible>
	<form class="form-grid" autocomplete="off" onsubmit={save}>
		<!-- biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons, not form fields -->
		<div class="full presets" role="group" aria-label={tx("setPresets")}>
			<span class="presets-l">{tx("setPresets")}</span>
			{#each PRESETS as p, i (p.provider + p.model)}
				<button type="button" class="preset" aria-pressed={provider === p.provider && model === p.model} onclick={() => usePreset(p)}>
					{p.name}<small>{providerOf(p.provider)?.label}{i === 0 ? ` · ${tx("setRecommended")}` : ""}</small>
				</button>
			{/each}
		</div>
		<!-- biome-ignore lint/a11y/noLabelWithoutControl: Select renders a native select inside the label -->
		<label>{tx("setProvider")}<Select aria-label={tx("setProvider")} bind:value={provider} items={PROVIDERS} /></label>
		<label>{tx("setModel")}<input class="input" bind:value={model} spellcheck="false"></label>
		<div class="full key-field">
			<div class="key-l">
				<label for="api-key">{tx("setApiKey")}</label
				><a href={providerOf(provider)?.keys} target="_blank" rel="noopener noreferrer"
					>{tx("setGetKey", { provider: providerOf(provider)?.label ?? "" })}<ExternalLink class="size-3" aria-hidden="true" /></a
				>
			</div>
			<input id="api-key" class="input" type="password" bind:this={keyInput} bind:value={key} placeholder={tx("setApiKeyPh")} spellcheck="false">
		</div>
		<div class="full end">
			{#if account.me.key}
				<Button variant="ghost" onclick={cancel}>{tx("setCancel")}</Button>
			{/if}
			<Button type="submit" variant="secondary">{tx("setSaveKey")}</Button>
		</div>
	</form>
</Reveal>

<style>
.current {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px 12px;
	font-size: 14.5px;
}
.input {
	width: 100%;
	height: 40px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--field);
	color: var(--ink);
	font-size: 14.5px;
	font-weight: 400;
	transition:
		border-color 150ms,
		box-shadow 150ms;
}
.input:hover {
	border-color: color-mix(in srgb, var(--ink) 25%, transparent);
}
.input:focus {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 40%, transparent);
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 50%, transparent);
}
.form-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}
.form-grid .full {
	grid-column: 1 / -1;
}
.form-grid .end {
	display: flex;
	justify-content: flex-end;
	gap: 6px;
}
/* Setups known to work: a press fills the provider and the model. */
.presets {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}
.presets-l {
	flex-basis: 100%;
	font-size: 13px;
	color: var(--ink-2);
}
.preset {
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
	padding: 5px 10px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--card-bg);
	color: var(--ink);
	font-size: 13.5px;
	font-weight: 500;
	cursor: pointer;
	transition:
		background-color 150ms,
		border-color 150ms,
		color 150ms,
		scale 100ms;
}
.preset small {
	font-size: 12px;
	font-weight: 400;
	color: var(--muted);
}
.preset:hover {
	background: var(--card-hover);
}
.preset:active {
	scale: 0.97;
}
.preset:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.preset[aria-pressed="true"] {
	background: var(--ink);
	border-color: var(--ink);
	color: var(--bg);
}
.preset[aria-pressed="true"] small {
	color: color-mix(in srgb, var(--bg) 70%, transparent);
}
.key-field {
	display: grid;
	gap: 6px;
}
.key-l {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 13px;
	color: var(--ink-2);
}
.key-l a {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--muted);
	text-decoration: none;
}
.key-l a:hover {
	color: var(--ink);
	text-decoration: underline;
	text-underline-offset: 3px;
}
.form-grid label {
	display: grid;
	gap: 6px;
	font-size: 13px;
	color: var(--ink-2);
}
@media (max-width: 640px) {
	.form-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
