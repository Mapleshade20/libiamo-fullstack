<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Mail from "@lucide/svelte/icons/mail";
import PublicPageSwitcher from "$lib/components/shell/PublicPageSwitcher.svelte";
</script>

<svelte:head> <title>Changelog · Libiamo</title> </svelte:head>

<header class="border-b border-border pb-8">
	<PublicPageSwitcher current="changelog" />
	<h1 class="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Changelog</h1>
	<p class="mt-4 max-w-2xl leading-7 text-foreground/75">Notable improvements to Libiamo, listed from newest to oldest.</p>

	<a
		href="mailto:admin@libiamo.net?subject=Libiamo%20feedback"
		class="group mt-8 flex items-center gap-4 rounded-2xl border border-border bg-gradient-to-br from-muted/70 via-background to-background p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring sm:gap-5 sm:p-6"
	>
		<span
			class="grid size-12 shrink-0 place-items-center rounded-full border border-border bg-background text-foreground transition-colors group-hover:border-foreground/30 group-hover:bg-muted/60"
		>
			<Mail size={20} strokeWidth={1.6} aria-hidden="true" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block font-serif text-xl leading-snug text-foreground">Tell us what to build next</span>
			<span class="mt-0.5 block text-sm text-muted-foreground">admin@libiamo.net</span>
		</span>
		<ArrowRight
			size={18}
			strokeWidth={1.6}
			aria-hidden="true"
			class="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
		/>
	</a>
</header>

<div class="divide-y divide-border">
	<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
		<header>
			<p class="font-serif text-xl text-foreground">v0.4.2</p>
			<time datetime="2026-10-11" class="mt-1 block text-sm text-muted-foreground">October 11, 2026</time>
		</header>
		<div>
			<h2 class="font-serif text-2xl text-foreground">Hall news and more natural replies</h2>
			<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
				<li>Announcements now appear in the Quest Hall inbox, with a collection where you can revisit notices you have read.</li>
				<li>Daily lineups now offer one quest, alongside a preview of custom quests coming soon.</li>
				<li>Languages not yet open for new learners are marked “Opening soon”; existing learners can keep practising in them.</li>
				<li>
					Reddit, AO3 and mail participants now reply on separate schedules. Follow-up messages no longer cancel replies already being written, and
					separate conversation branches stay on topic.
				</li>
				<li>Mail replies arrive as complete emails, and counterparts no longer receive your private task brief.</li>
				<li>Improved recovery from stalled AI requests and fixed messages that could remain stuck waiting for a reply.</li>
			</ul>
		</div>
	</article>

	<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
		<header>
			<p class="font-serif text-xl text-foreground">v0.4.1</p>
			<time datetime="2026-10-03" class="mt-1 block text-sm text-muted-foreground">October 3, 2026</time>
		</header>
		<div>
			<h2 class="font-serif text-2xl text-foreground">Account security</h2>
			<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
				<li>You can now change your password from Profile, which signs your other devices out.</li>
				<li>New passwords must be harder to guess, and sign-up, password reset and email changes include a quick human check.</li>
				<li>
					New accounts need an address from a common email provider or a school, and receive the free trial in three parts over their first 48 hours.
				</li>
				<li>Changing your email now shows where the verification link went and lets you try a different address.</li>
			</ul>
		</div>
	</article>

	<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
		<header>
			<p class="font-serif text-xl text-foreground">v0.4.0</p>
			<time datetime="2026-10-03" class="mt-1 block text-sm text-muted-foreground">October 3, 2026</time>
		</header>
		<div>
			<h2 class="font-serif text-2xl text-foreground">Streaks and group conversations</h2>
			<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
				<li>Added a daily streak: a day counts when you finish a quest and clear your review queue, and saved days cover the occasional miss.</li>
				<li>Every finished task now ends with the same flashcard pass, and new cards become due the next day.</li>
				<li>Added a Mail practice surface, iMessage and mail group conversations, and Discord direct messages.</li>
				<li>Group scenes feel livelier: the right people answer you, others join in on Reddit and AO3, and chats keep going while you are quiet.</li>
				<li>Conversations appear immediately without a loading splash, and moving between the Quest Hall and task details is faster and smoother.</li>
				<li>Libiamo can now be installed as an app on your phone or desktop.</li>
				<li>Refined typography, colours and controls across the app, and made text easier to select and copy.</li>
			</ul>
		</div>
	</article>

	<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
		<header>
			<p class="font-serif text-xl text-foreground">v0.3.2</p>
			<p class="mt-1 text-sm text-muted-foreground">September 15, 2026</p>
		</header>
		<div>
			<h2 class="font-serif text-2xl text-foreground">More public pages</h2>
			<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
				<li>Added Terms of Service and Privacy Policy pages.</li>
				<li>Added user-facing changelog and connected all three pages from the welcome footer and the profile page.</li>
			</ul>
		</div>
	</article>

	<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
		<header>
			<p class="font-serif text-xl text-foreground">v0.3.1</p>
			<time datetime="2026-09-13" class="mt-1 block text-sm text-muted-foreground">September 13, 2026</time>
		</header>
		<div>
			<h2 class="font-serif text-2xl text-foreground">Homepage and social sign-in</h2>
			<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
				<li>Added the public welcome page and improved fatal-error recovery.</li>
				<li>Added Google and GitHub authentication alongside email sign-in.</li>
				<li>Moved the production application origin to libiamo.net.</li>
			</ul>
		</div>
	</article>

	<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
		<header>
			<p class="font-serif text-xl text-foreground">v0.3.0</p>
			<time datetime="2026-09-10" class="mt-1 block text-sm text-muted-foreground">September 10, 2026</time>
		</header>
		<div>
			<h2 class="font-serif text-2xl text-foreground">Quest hall</h2>
			<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
				<li>Redesigned the Quest Hall for daily, weekly, and translation work.</li>
				<li>Unified task and translation navigation around canonical detail routes.</li>
			</ul>
		</div>
	</article>
</div>
