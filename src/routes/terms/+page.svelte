<script lang="ts">
import { base } from "$app/paths";
import PublicPageSwitcher from "$lib/components/shell/PublicPageSwitcher.svelte";
import WineGlassIcon from "$lib/components/shell/WineGlassIcon.svelte";
</script>

<svelte:head>
	<title>Terms of Service · Libiamo</title>
	<meta name="description" content="Terms governing access to and use of Libiamo.">
	<meta name="robots" content="index, follow">
</svelte:head>

<div lang="en" class="min-h-dvh bg-background text-foreground">
	<a
		href="#terms-content"
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

	<main id="terms-content" class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
		<header class="border-b border-border pb-8">
			<PublicPageSwitcher current="terms" />
			<h1 class="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Terms of Service</h1>
			<p class="mt-4 text-sm text-muted-foreground">Effective September 14, 2026</p>
		</header>

		<article class="space-y-10 py-10 text-base leading-7 text-foreground/85">
			<section aria-labelledby="agreement">
				<h2 id="agreement" class="font-serif text-2xl text-foreground">1. Agreement</h2>
				<p class="mt-3">
					These Terms govern your access to and use of Libiamo. By creating an account or using the service, you agree to these Terms. If you do not
					agree, do not use the service.
				</p>
			</section>

			<section aria-labelledby="service">
				<h2 id="service" class="font-serif text-2xl text-foreground">2. The service</h2>
				<p class="mt-3">
					Libiamo is a language-learning application offering simulated conversations, translation practice, automated feedback, vocabulary notes, and
					spaced review. Practice interfaces may resemble familiar communication services, but Libiamo does not post your practice content to those
					services.
				</p>
			</section>

			<section aria-labelledby="accounts">
				<h2 id="accounts" class="font-serif text-2xl text-foreground">3. Accounts and eligibility</h2>
				<p class="mt-3">
					You must be legally able to agree to these Terms. You are responsible for the accuracy of your account information, safeguarding your
					sign-in methods, and activity performed through your account. Notify the project maintainers if you believe your account has been
					compromised.
				</p>
			</section>

			<section aria-labelledby="ai-features">
				<h2 id="ai-features" class="font-serif text-2xl text-foreground">4. AI-assisted features</h2>
				<p class="mt-3">
					Some features send task context and your submitted content to an AI provider to generate conversations, feedback, or learning material. AI
					output may be inaccurate, incomplete, or inappropriate, so you should evaluate it rather than rely on it as professional advice.
				</p>
				<p class="mt-3">
					If you configure your own provider credentials, you direct Libiamo to use that provider and remain responsible for its terms, account,
					charges, and data-handling practices.
				</p>
			</section>

			<section aria-labelledby="content">
				<h2 id="content" class="font-serif text-2xl text-foreground">5. Your content</h2>
				<p class="mt-3">
					You retain ownership of content you submit. You grant Libiamo a non-exclusive permission to host, process, reproduce, and display that
					content only as needed to operate and secure the service and provide the features you request. You must have the rights needed to submit
					your content.
				</p>
			</section>

			<section aria-labelledby="acceptable-use">
				<h2 id="acceptable-use" class="font-serif text-2xl text-foreground">6. Acceptable use</h2>
				<p class="mt-3">You may not use Libiamo to:</p>
				<ul class="mt-3 list-disc space-y-2 pl-6">
					<li>break the law or violate another person's rights;</li>
					<li>submit content you do not have permission to use;</li>
					<li>harass, exploit, deceive, or harm another person;</li>
					<li>probe, bypass, disrupt, or overload the service or its security controls;</li>
					<li>access another person's account or credentials without authorization; or</li>
					<li>use automated means in a way that interferes with normal operation.</li>
				</ul>
			</section>

			<section aria-labelledby="third-parties">
				<h2 id="third-parties" class="font-serif text-2xl text-foreground">7. Third-party services</h2>
				<p class="mt-3">
					Libiamo may depend on third-party authentication, infrastructure, email, avatar, and AI services. Their own terms and privacy practices
					govern your direct relationship with them. Availability of an integration does not make Libiamo responsible for that provider's service.
				</p>
			</section>

			<section aria-labelledby="availability">
				<h2 id="availability" class="font-serif text-2xl text-foreground">8. Availability and changes</h2>
				<p class="mt-3">
					The service may change, experience interruptions, impose usage limits, or discontinue features. We may suspend access when reasonably
					necessary to protect users, the service, or third parties, or to address unlawful or abusive use.
				</p>
			</section>

			<section aria-labelledby="warranties">
				<h2 id="warranties" class="font-serif text-2xl text-foreground">9. Warranties and liability</h2>
				<p class="mt-3">
					Libiamo is provided on an “as available” basis. To the extent permitted by applicable law, no guarantee is made that the service will always
					be available, secure, error-free, or suitable for a particular learning outcome. Nothing in these Terms limits rights or liabilities that
					cannot lawfully be limited.
				</p>
			</section>

			<section aria-labelledby="ending-use">
				<h2 id="ending-use" class="font-serif text-2xl text-foreground">10. Ending use</h2>
				<p class="mt-3">
					You may stop using Libiamo at any time. Account suspension or termination does not remove obligations that, by their nature, continue after
					use ends, including responsibility for earlier violations and protection of intellectual-property rights.
				</p>
			</section>

			<section aria-labelledby="term-changes">
				<h2 id="term-changes" class="font-serif text-2xl text-foreground">11. Changes to these Terms</h2>
				<p class="mt-3">
					When these Terms materially change, the updated page will show a new effective date. Where required, Libiamo will provide additional notice
					before the new Terms apply.
				</p>
			</section>

			<section aria-labelledby="contact">
				<h2 id="contact" class="font-serif text-2xl text-foreground">12. Contact</h2>
				<p class="mt-3">
					Questions about these Terms may be sent to
					<a
						href="mailto:admin@libiamo.net"
						class="rounded-sm font-medium underline decoration-border underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
						>admin@libiamo.net</a
					>. Do not include passwords, API keys, or other credentials in your message.
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
					aria-current="page"
					class="inline-flex min-h-11 items-center rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Terms</a
				>
				<a
					href="{base}/privacy"
					class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
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
