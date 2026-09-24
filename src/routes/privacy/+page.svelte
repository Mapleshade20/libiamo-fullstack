<script lang="ts">
import { base } from "$app/paths";
import PublicPageSwitcher from "$lib/components/shell/PublicPageSwitcher.svelte";
import WineGlassIcon from "$lib/components/shell/WineGlassIcon.svelte";
</script>

<svelte:head>
	<title>Privacy Policy · Libiamo</title>
	<meta name="description" content="How Libiamo collects, uses, stores, and shares personal information.">
	<meta name="robots" content="index, follow">
</svelte:head>

<div lang="en" class="min-h-dvh bg-background text-foreground">
	<a
		href="#privacy-content"
		class="fixed left-4 top-3 z-50 -translate-y-20 rounded-md bg-foreground px-4 py-3 text-sm font-semibold text-background transition-transform focus:translate-y-0"
	>
		Skip to content
	</a>

	<header class="border-b border-border bg-background/95">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<a href="{base}/welcome" class="inline-flex min-h-11 items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
				<WineGlassIcon width={32} height={32} />
				<span class="wordmark">Libiamo</span>
			</a>
			<a
				href="{base}/sign-in"
				class="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
			>
				Sign in
			</a>
		</div>
	</header>

	<main id="privacy-content" class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
		<header class="border-b border-border pb-8">
			<PublicPageSwitcher current="privacy" />
			<h1 class="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Privacy Policy</h1>
			<p class="mt-4 text-sm text-muted-foreground">Effective September 14, 2026</p>
		</header>

		<article class="space-y-10 py-10 text-base leading-7 text-foreground/85">
			<section aria-labelledby="privacy-scope">
				<h2 id="privacy-scope" class="font-serif text-2xl text-foreground">1. Scope</h2>
				<p class="mt-3">
					This Policy explains how the Libiamo project processes personal information when you visit the website, create an account, connect a sign-in
					provider, or use its language-learning features.
				</p>
			</section>

			<section aria-labelledby="information-collected">
				<h2 id="information-collected" class="font-serif text-2xl text-foreground">2. Information we process</h2>
				<p class="mt-3">Depending on the features you use, Libiamo processes:</p>
				<ul class="mt-3 list-disc space-y-2 pl-6">
					<li>your name, email address, verification status, account identifiers, sign-in methods, and profile preferences;</li>
					<li>your learning and native languages, self-assigned level, task progress, and usage-quota balance;</li>
					<li>practice messages, translations, feedback questions, evaluations, vocabulary notes, review activity, and contributions;</li>
					<li>encrypted credentials and provider settings when you configure your own OpenAI-compatible AI provider;</li>
					<li>authentication sessions, browser timezone, and limited browser-stored interface or draft state; and</li>
					<li>technical and security information such as IP address, user agent, request time, and error details where recorded by the service.</li>
				</ul>
			</section>

			<section aria-labelledby="information-use">
				<h2 id="information-use" class="font-serif text-2xl text-foreground">3. How we use information</h2>
				<p class="mt-3">Libiamo uses this information to:</p>
				<ul class="mt-3 list-disc space-y-2 pl-6">
					<li>create, authenticate, secure, and support accounts;</li>
					<li>provide conversations, translation evaluation, feedback, notes, and scheduled review;</li>
					<li>remember language, display, and workflow preferences;</li>
					<li>enforce quotas and prevent fraud, abuse, and unauthorized access; and</li>
					<li>diagnose errors and maintain the reliability and security of the service.</li>
				</ul>
				<p class="mt-3">Libiamo does not use personal information for third-party advertising and does not sell personal information.</p>
			</section>

			<section aria-labelledby="ai-processing">
				<h2 id="ai-processing" class="font-serif text-2xl text-foreground">4. AI-assisted processing</h2>
				<p class="mt-3">
					Conversation, feedback, and translation features send the relevant task context and submitted learning content to the AI provider configured
					for the request. The provider returns generated messages, evaluations, or study material to Libiamo.
				</p>
				<p class="mt-3">
					If you provide your own API key, Libiamo encrypts it before storage and sends requests to the base URL and model you select. That provider's
					own terms, retention, and training practices apply. Do not submit sensitive personal information that is unnecessary for language practice.
				</p>
			</section>

			<section aria-labelledby="social-login">
				<h2 id="social-login" class="font-serif text-2xl text-foreground">5. Google and GitHub sign-in</h2>
				<p class="mt-3">
					When you choose Google or GitHub sign-in, the provider may give Libiamo an account identifier, name, email address, email-verification
					status, and other basic profile information included in the sign-in response. Libiamo uses this data only to authenticate you, create or
					link your account, protect account ownership, and display your account profile.
				</p>
				<p class="mt-3">
					Libiamo stores the provider connection and may store OAuth tokens returned by the provider. OAuth-token encryption is enabled. Libiamo does
					not sell this data, use it for advertising, or send OAuth tokens to AI providers. Google or GitHub separately processes information under
					its own privacy policy when you use its sign-in service.
				</p>
			</section>

			<section aria-labelledby="sharing">
				<h2 id="sharing" class="font-serif text-2xl text-foreground">6. When information is shared</h2>
				<p class="mt-3">Information is disclosed only as needed to operate the service, including to:</p>
				<ul class="mt-3 list-disc space-y-2 pl-6">
					<li>Google or GitHub when you choose its authentication service;</li>
					<li>the shared or user-selected AI provider for the learning request you make;</li>
					<li>email, hosting, database, backup, and security providers supporting Libiamo;</li>
					<li>Gravatar, which receives an email-derived MD5 hash when an authenticated profile image is requested;</li>
					<li>Google Fonts when the browser requests site fonts, and unpkg when the emoji picker requests its data set; and</li>
					<li>authorities or other parties when reasonably necessary to comply with law or protect users, the service, or legal rights.</li>
				</ul>
				<p class="mt-3">These providers may receive technical connection information such as your IP address and user agent.</p>
			</section>

			<section aria-labelledby="storage-retention">
				<h2 id="storage-retention" class="font-serif text-2xl text-foreground">7. Storage, transfers, and retention</h2>
				<p class="mt-3">
					Account and learning information is retained while needed to provide and secure the service, comply with legal obligations, resolve
					disputes, or handle a deletion request. Authentication records, provider artifacts, logs, and backups may follow different operational
					schedules.
				</p>
				<p class="mt-3">
					Providers may process information in countries other than your own. Libiamo has not yet published fixed category-by-category retention
					periods or a complete production hosting-region list; this Policy will be updated when those operational details are finalized.
				</p>
			</section>

			<section aria-labelledby="browser-storage">
				<h2 id="browser-storage" class="font-serif text-2xl text-foreground">8. Cookies and browser storage</h2>
				<p class="mt-3">
					Libiamo uses authentication cookies and a browser-timezone cookie to keep you signed in and render dates correctly. Local or session storage
					may retain interface state, quota-notice state, practice drafts, translation workflow snapshots, or cached feedback. No advertising or
					marketing trackers are currently integrated.
				</p>
			</section>

			<section aria-labelledby="privacy-choices">
				<h2 id="privacy-choices" class="font-serif text-2xl text-foreground">9. Your choices and rights</h2>
				<p class="mt-3">
					You can update supported profile information and manage connected sign-in methods from your account. Depending on applicable law, you may
					also request access, correction, deletion, restriction, portability, or objection, and may withdraw consent where processing relies on
					consent.
				</p>
				<p class="mt-3">
					To start a request, use the contact address below. Libiamo may need to verify that you control the relevant account before acting on the
					request.
				</p>
			</section>

			<section aria-labelledby="security">
				<h2 id="security" class="font-serif text-2xl text-foreground">10. Security</h2>
				<p class="mt-3">
					Libiamo uses access controls and encrypts stored OAuth tokens and user-provided AI keys. No online service can guarantee absolute security.
					Protect your sign-in methods and revoke a connected provider if you believe it has been compromised.
				</p>
			</section>

			<section aria-labelledby="children">
				<h2 id="children" class="font-serif text-2xl text-foreground">11. Children</h2>
				<p class="mt-3">
					Libiamo is not directed specifically to children. Do not create or use an account unless you can validly consent to the processing described
					here, or a parent or guardian has provided any permission required by applicable law.
				</p>
			</section>

			<section aria-labelledby="policy-changes">
				<h2 id="policy-changes" class="font-serif text-2xl text-foreground">12. Changes to this Policy</h2>
				<p class="mt-3">
					Material changes will be shown by updating the effective date and, where required, providing additional notice through the service or
					account contact information.
				</p>
			</section>

			<section aria-labelledby="privacy-contact">
				<h2 id="privacy-contact" class="font-serif text-2xl text-foreground">13. Contact</h2>
				<p class="mt-3">
					Contact the Libiamo project maintainers at
					<a
						href="mailto:admin@libiamo.net"
						class="rounded-sm font-medium underline decoration-border underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						>admin@libiamo.net</a
					>. Write from the email address on your account where possible, and do not include passwords, API keys, or other credentials in your
					message.
				</p>
			</section>
		</article>
	</main>

	<footer class="border-t border-border bg-muted/30">
		<div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<p>Libiamo · Language through living conversation</p>
			<nav aria-label="Public information" class="flex flex-wrap gap-x-5">
				<a
					href="{base}/welcome"
					class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Home</a
				>
				<a
					href="{base}/terms"
					class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Terms</a
				>
				<a
					href="{base}/privacy"
					aria-current="page"
					class="inline-flex min-h-11 items-center rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Privacy</a
				>
				<a
					href="{base}/changelog"
					class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Changelog</a
				>
			</nav>
		</div>
	</footer>
</div>
