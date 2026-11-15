<script lang="ts">
import "#lib/components/auth/auth.css";
import { onMount, type Snippet } from "svelte";
import { signInSetup } from "#lib/account/account.remote.ts";
import { auth, setAuthLang, speak, atx as tx } from "#lib/account/account.svelte.ts";
import { captcha } from "#lib/auth/captcha.svelte.ts";
import Turnstile from "#lib/components/auth/Turnstile.svelte";
import Select from "#lib/components/common/Select.svelte";
import { APP_LANGS, endonym, isAppLang } from "#lib/constants.ts";
import { loadLang } from "#lib/i18n/index.svelte.ts";

/*
 * Signing in, signing up, confirming an address, a new password: the welcome's top bar (the wordmark, and here the
 * page's language, since nothing has chosen it yet) over one narrow column. Someone already signed in has no business
 * on the first two and goes home (hooks.server.ts). The address typed is carried between them for this tab.
 */
let { children }: { children: Snippet } = $props();
captcha.siteKey = (await signInSetup()).captchaSiteKey;
let carried = false;
onMount(() => {
	auth.email ||= sessionStorage.getItem("authEmail") ?? "";
	carried = true;
	// Arriving from inside the app (signed out, the account deleted), <html> still speaks the app's language.
	speak(auth.lang);
	void loadLang(auth.lang);
});
$effect(() => {
	const email = auth.email;
	if (carried) sessionStorage.setItem("authEmail", email);
});
</script>

<header class="top">
	<span class="wordmark">Libiamo</span>
	<div class="lang">
		<Select
			variant="ghost"
			size="sm"
			aria-label={tx("auLangPick")}
			value={auth.lang}
			onValueChange={(v) => isAppLang(v) && setAuthLang(v)}
			items={APP_LANGS.map((l) => ({ value: l, label: endonym(l) }))}
		/>
	</div>
</header>
<main class="auth">
	{@render children()}
	<Turnstile />
</main>

<style>
.top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left));
}
.wordmark {
	font-size: 32px;
	view-transition-name: brand;
}
.auth {
	width: min(400px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(28px, 11vh, 110px) 0 64px;
}
</style>
