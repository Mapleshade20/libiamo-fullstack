<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Check from "@lucide/svelte/icons/check";
import Clock3 from "@lucide/svelte/icons/clock-3";
import Languages from "@lucide/svelte/icons/languages";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessagesSquare from "@lucide/svelte/icons/messages-square";
import Repeat2 from "@lucide/svelte/icons/repeat-2";
import Sparkles from "@lucide/svelte/icons/sparkles";
import { onMount } from "svelte";
import { afterNavigate } from "$app/navigation";
import { base } from "$app/paths";
import WineGlassIcon from "$lib/components/WineGlassIcon.svelte";
import { UI_VARIANT_LABELS } from "$lib/constants";
import { WELCOME_DISCORD_CASE, WELCOME_REDDIT_CASE, WELCOME_TRANSLATION_CASE } from "$lib/welcome/product-evidence";
import "./styles/shell.css";
import "./styles/hero.css";
import "./styles/sections.css";
import "./styles/responsive.css";

let { children, data } = $props();

const sentenceSets = [
	[
		{ code: "en", name: "English", text: "Speak in your own voice." },
		{ code: "fr", name: "Français", text: "Parle avec ta propre voix." },
		{ code: "es", name: "Español", text: "Habla con tu propia voz." },
		{ code: "ja", name: "日本語", text: "あなたらしい言葉で話そう。" },
	],
	[
		{ code: "en", name: "English", text: "Say it with care." },
		{ code: "fr", name: "Français", text: "Dis-le avec tact." },
		{ code: "es", name: "Español", text: "Dilo con cuidado." },
		{ code: "ja", name: "日本語", text: "思いやりを込めて伝えよう。" },
	],
	[
		{ code: "en", name: "English", text: "Keep the conversation going." },
		{ code: "fr", name: "Français", text: "Fais durer la conversation." },
		{ code: "es", name: "Español", text: "Haz que la conversación continúe." },
		{ code: "ja", name: "日本語", text: "会話を続けよう。" },
	],
	[
		{ code: "en", name: "English", text: "Find the right words." },
		{ code: "fr", name: "Français", text: "Trouve les mots justes." },
		{ code: "es", name: "Español", text: "Encuentra las palabras justas." },
		{ code: "ja", name: "日本語", text: "ぴったりの言葉を見つけよう。" },
	],
] as const;
const lyricReservations = sentenceSets.flat();

function firstItem<T>(items: readonly T[], label: string): T {
	const item = items[0];
	if (item === undefined) throw new Error(`Welcome demo content is missing: ${label}`);
	return item;
}

const discordCase = WELCOME_DISCORD_CASE;
const redditCase = WELCOME_REDDIT_CASE;
const translationCase = WELCOME_TRANSLATION_CASE;
const reviewNote = translationCase.reviewNote;
const translationRatings = translationCase.ratings;
const discordSeedMessage = discordCase.seedMessage;
const redditSeedMessage = redditCase.seedMessage;
const reviewExample = firstItem(reviewNote.examples, "review example");

const practiceCards = [
	{
		kind: "discord",
		label: "Discord conversation",
		title: discordCase.title,
		number: "01 / 03",
		platform: UI_VARIANT_LABELS[discordCase.ui],
		scope: `${discordCase.maxTurns} turns maximum`,
		surfaceLabel: "# weekend-plans",
		messageLabel: "You · now",
		message: discordSeedMessage,
		statusTitle: "Waiting for Sam",
		status: "New replies remain visibly unread if you leave the page and return through Quest Hall.",
	},
	{
		kind: "reddit",
		label: "Reddit post",
		title: redditCase.title,
		number: "02 / 03",
		platform: UI_VARIANT_LABELS[redditCase.ui],
		scope: `${redditCase.maxTurns} turns maximum`,
		surfaceLabel: "r/Advice",
		messageLabel: "Original post · You",
		message: redditSeedMessage,
		statusTitle: "Thread-aware replies",
		status: "Reply to the post or target an individual comment; responses stay attached to their branch.",
	},
	{
		kind: "translation",
		label: "Translation workflow",
		title: translationCase.title,
		number: "03 / 03",
		platform: translationCase.platform,
		scope: translationCase.scope,
		source: translationCase.source,
		draft: translationCase.firstDraft,
		statusTitle: `Evaluation · ${translationRatings.overall}`,
		status: "Correction cards lead into a second draft, then transfer practice for useful expressions.",
	},
] as const;

type PracticeCard = (typeof practiceCards)[number];

const practiceCardTransitionMs = 480;
const welcomeScrollClass = "welcome-scroll-active";

let activeSentenceIndex = $state(0);
let activeLanguageIndex = $state(0);
let typewriterText = $state<string>(sentenceSets[0][0].text);
let typewriterPhase = $state<"idle" | "typing" | "holding" | "deleting">("idle");
let reducedMotion = $state(false);
let headerRevealed = $state(false);
let activePracticeIndex = $state(0);
let practiceCardAnimating = $state(false);
let practiceCardTimer: number | undefined;
let activeSentenceSet = $derived(sentenceSets[activeSentenceIndex]);
let lyricTranslation = $derived(activeSentenceSet[activeLanguageIndex]);
let nextLyricTranslation = $derived(activeSentenceSet[(activeLanguageIndex + 1) % activeSentenceSet.length]);
let activePractice = $derived(practiceCards[activePracticeIndex]);
let nextPractice = $derived(practiceCards[(activePracticeIndex + 1) % practiceCards.length]);
let followingPractice = $derived(practiceCards[(activePracticeIndex + 2) % practiceCards.length]);

afterNavigate(() => {
	document.documentElement.classList.add(welcomeScrollClass);
});

function cycleLyricLanguage() {
	activeLanguageIndex = (activeLanguageIndex + 1) % activeSentenceSet.length;
	typewriterText = reducedMotion ? sentenceSets[activeSentenceIndex][activeLanguageIndex].text : "";
	typewriterPhase = reducedMotion ? "idle" : "typing";
}

function advancePracticeCard() {
	activePracticeIndex = (activePracticeIndex + 1) % practiceCards.length;
}

function cyclePracticeCard() {
	if (practiceCardAnimating) return;

	if (reducedMotion) {
		advancePracticeCard();
		return;
	}

	practiceCardAnimating = true;
	practiceCardTimer = window.setTimeout(() => {
		advancePracticeCard();
		practiceCardAnimating = false;
		practiceCardTimer = undefined;
	}, practiceCardTransitionMs);
}

// The header stays out of the way over the first screen, then fades in once the hero is behind the reader.
// The two thresholds keep it from flickering while scrolling around the reveal point.
function syncHeaderReveal() {
	const scrolled = window.scrollY;
	if (headerRevealed) {
		headerRevealed = scrolled > window.innerHeight * 0.5;
		return;
	}
	headerRevealed = scrolled > window.innerHeight * 0.66;
}

function handlePracticeCardKeydown(event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	cyclePracticeCard();
}

onMount(() => {
	const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	let nextSentenceIndex = Math.floor(Math.random() * sentenceSets.length);

	try {
		const storageKey = "libiamo.welcome.last-sentence";
		const previousSentenceIndex = Number(window.sessionStorage.getItem(storageKey));
		if (Number.isInteger(previousSentenceIndex) && previousSentenceIndex >= 0 && previousSentenceIndex < sentenceSets.length) {
			const offset = 1 + Math.floor(Math.random() * (sentenceSets.length - 1));
			nextSentenceIndex = (previousSentenceIndex + offset) % sentenceSets.length;
		}
		window.sessionStorage.setItem(storageKey, String(nextSentenceIndex));
	} catch {
		// The phrase still rotates when session storage is unavailable.
	}

	activeSentenceIndex = nextSentenceIndex;
	activeLanguageIndex = 0;
	reducedMotion = motionQuery.matches;
	typewriterText = reducedMotion ? sentenceSets[nextSentenceIndex][0].text : "";
	typewriterPhase = reducedMotion ? "idle" : "typing";

	let headerFrame: number | undefined;
	const handleScroll = () => {
		if (headerFrame !== undefined) return;
		headerFrame = window.requestAnimationFrame(() => {
			headerFrame = undefined;
			syncHeaderReveal();
		});
	};
	syncHeaderReveal();
	window.addEventListener("scroll", handleScroll, { passive: true });
	window.addEventListener("resize", handleScroll, { passive: true });

	const handleMotionChange = (event: MediaQueryListEvent) => {
		reducedMotion = event.matches;
		typewriterText = event.matches ? lyricTranslation.text : "";
		typewriterPhase = event.matches ? "idle" : "typing";
		if (event.matches && practiceCardAnimating) {
			if (practiceCardTimer !== undefined) window.clearTimeout(practiceCardTimer);
			advancePracticeCard();
			practiceCardAnimating = false;
			practiceCardTimer = undefined;
		}
	};
	motionQuery.addEventListener("change", handleMotionChange);
	return () => {
		document.documentElement.classList.remove(welcomeScrollClass);
		motionQuery.removeEventListener("change", handleMotionChange);
		window.removeEventListener("scroll", handleScroll);
		window.removeEventListener("resize", handleScroll);
		if (headerFrame !== undefined) window.cancelAnimationFrame(headerFrame);
		if (practiceCardTimer !== undefined) window.clearTimeout(practiceCardTimer);
	};
});

$effect(() => {
	if (typewriterPhase === "idle") return;

	const targetCharacters = Array.from(lyricTranslation.text);
	const visibleCharacters = Array.from(typewriterText);
	const delay = typewriterPhase === "holding" ? 1800 : typewriterPhase === "deleting" ? 28 : lyricTranslation.code === "ja" ? 90 : 54;
	const timer = window.setTimeout(() => {
		if (typewriterPhase === "typing") {
			if (visibleCharacters.length < targetCharacters.length) {
				typewriterText = targetCharacters.slice(0, visibleCharacters.length + 1).join("");
			} else {
				typewriterPhase = "holding";
			}
			return;
		}

		if (typewriterPhase === "holding") {
			typewriterPhase = "deleting";
			return;
		}

		if (visibleCharacters.length > 0) {
			typewriterText = visibleCharacters.slice(0, -1).join("");
		} else {
			activeLanguageIndex = (activeLanguageIndex + 1) % activeSentenceSet.length;
			typewriterPhase = "typing";
		}
	}, delay);

	return () => window.clearTimeout(timer);
});
</script>

{#snippet practiceCardContent(card: PracticeCard)}
	<div class="brief-heading">
		<div>
			<p class="practice-card-label">{card.label}</p>
			<h2>{card.title}</h2>
		</div>
		<span class="brief-number">{card.number}</span>
	</div>

	<div class="brief-stage">
		<div class="brief-context">
			<span>
				{#if card.kind === "translation"}
					<Languages size={15} aria-hidden="true" />
				{:else}
					<MessageCircle size={15} aria-hidden="true" />
				{/if}
				{card.platform}
			</span>
			<span><Repeat2 size={15} aria-hidden="true" /> {card.scope}</span>
		</div>

		{#if card.kind === "translation"}
			<div class="translation-preview">
				<section class="translation-source">
					<p class="preview-label">Source · 中文</p>
					<p lang="zh">{card.source}</p>
				</section>
				<section class="translation-draft">
					<p class="preview-label">First draft · English</p>
					<p lang="en">{card.draft}</p>
				</section>
			</div>
		{:else}
			<div class="surface-preview {card.kind}-preview">
				<p class="preview-label">{card.surfaceLabel}</p>
				<div class="surface-message">
					{#if card.kind === "discord"}
						<span class="surface-avatar" aria-hidden="true">Y</span>
					{:else}
						<span class="vote-rail" aria-hidden="true">↑<small>1</small></span>
					{/if}
					<div>
						<p class="surface-author">{card.messageLabel}</p>
						<p class="surface-copy">{card.message}</p>
					</div>
				</div>
			</div>
		{/if}

		<div class="brief-feedback">
			<span class:feedback-mark-pending={card.kind !== "translation"} class="feedback-mark">
				{#if card.kind === "translation"}
					<Check size={16} strokeWidth={2.4} aria-hidden="true" />
				{:else}
					<Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
				{/if}
			</span>
			<div>
				<strong>{card.statusTitle}</strong>
				<p>{card.status}</p>
			</div>
		</div>
	</div>
{/snippet}

<svelte:head>
	<!-- The rotating lyric is the only Japanese script in the product, so Yomogi loads here rather than site-wide. -->
	<link href="https://fonts.googleapis.com/css2?family=Yomogi&display=swap" rel="stylesheet">
</svelte:head>

<a class="skip-link" href="#main-content" lang="en">Skip to content</a>

<div class="landing-shell" lang="en">
	<header class:site-header-revealed={headerRevealed} class="site-header">
		<div class="header-inner">
			<a class="brand" href={`${base}/welcome`} aria-label="Libiamo home">
				<WineGlassIcon width={34} height={34} />
				<span class="wordmark">Libiamo</span>
			</a>

			<nav class="section-nav" aria-label="Homepage sections">
				<a href="#practice">Practice</a>
				<a href="#feedback">Feedback</a>
				<a href="#remember">Remember</a>
			</nav>

			<div class="account-links">
				{#if data.viewer}
					<a class="header-cta" href={`${base}/`}>Quest Hall</a>
				{:else}
					<a class="sign-in-link" href={`${base}/sign-in`}>Sign in</a>
					<a class="header-cta" href={`${base}/sign-up`}>Start learning</a>
				{/if}
			</div>
		</div>
	</header>

	<main id="main-content">
		{@render children()}
		<section class="hero" aria-labelledby="hero-title">
			<div class="hero-copy">
				<h1 id="hero-title">Libiamo</h1>
				<blockquote class="hero-lyric">
					<button
						class="lyric-button"
						type="button"
						onclick={cycleLyricLanguage}
						aria-label={`${lyricTranslation.text} ${lyricTranslation.name}. Change to ${nextLyricTranslation.name}.`}
					>
						{#each lyricReservations as translation}
							<span class:lyric-japanese={translation.code === "ja"} class="lyric-reserve" lang={translation.code} aria-hidden="true">
								{translation.text}
							</span>
						{/each}
						<span class:lyric-japanese={lyricTranslation.code === "ja"} class="lyric-sentence" lang={lyricTranslation.code} aria-hidden="true">
							{typewriterText}<span class="typewriter-caret" aria-hidden="true"></span>
						</span>
					</button>
				</blockquote>
				<p class="hero-intro">
					Choose a daily, weekly, or translation quest. Prepare with objectives and background material, respond in the interface where the situation
					belongs, then carry useful feedback into scheduled review.
				</p>
				<div class="hero-actions">
					<a class="primary-cta" href={data.viewer ? `${base}/` : `${base}/sign-up`}>
						{data.viewer ? "Open Quest Hall" : "Begin a conversation"} <ArrowRight size={18} aria-hidden="true" />
					</a>
					<a class="text-cta" href="#practice">See how it works <span aria-hidden="true">↓</span></a>
				</div>
			</div>
			<figure class="hero-artifact">
				<div class:practice-stack-cycling={practiceCardAnimating} class="practice-stack">
					<div class="practice-card practice-card-back" aria-hidden="true">{@render practiceCardContent(followingPractice)}</div>
					<div class="practice-card practice-card-underlay" aria-hidden="true">{@render practiceCardContent(nextPractice)}</div>
					<div
						class:practice-brief-cycling={practiceCardAnimating}
						class="practice-card practice-brief"
						role="button"
						tabindex="0"
						onclick={cyclePracticeCard}
						onkeydown={handlePracticeCardKeydown}
						aria-label={`${activePractice.label}: ${activePractice.title}. Show next card: ${nextPractice.label}.`}
					>
						{@render practiceCardContent(activePractice)}
					</div>
				</div>
				<figcaption>Discord weekend planning, a Reddit advice thread, and one complete Chinese-to-English translation.</figcaption>
			</figure>
		</section>

		<section class="manifesto" aria-labelledby="manifesto-title">
			<p class="section-index">The learning path · 01</p>
			<div class="manifesto-grid">
				<h2 id="manifesto-title">A prompt alone is not practice. <em>The setting changes the answer.</em></h2>
				<div class="manifesto-copy">
					<p>
						A Discord exchange, an email, and a public comment thread ask for different language choices. Libiamo gives each quest objectives,
						background material, and the interface where that conversation belongs.
					</p>
					<p>After the exchange, feedback stays attached to the message that prompted it, and useful expressions can move into Review.</p>
				</div>
			</div>
		</section>

		<section id="practice" class="feature feature-practice" aria-labelledby="practice-title">
			<div class="feature-copy">
				<p class="section-kicker"><span>01</span> Practice in context</p>
				<h2 id="practice-title">Open the quest where the conversation happens.</h2>
				<p>
					Quest Hall recommends daily and weekly scenarios for your active language and level. Conversation quests then open in one of five working
					interfaces; translation quests follow their own draft-and-revision workflow.
				</p>
				<ul class="feature-points">
					<li><Check size={17} aria-hidden="true" /> Objectives, background material, and useful expressions before practice</li>
					<li><Check size={17} aria-hidden="true" /> Discord, iMessage, Apple Mail, AO3, and Reddit interfaces</li>
					<li><Check size={17} aria-hidden="true" /> Daily, weekly, and translation catalogs in Quest Hall</li>
				</ul>
			</div>

			<div class="scenario-stage" aria-label="Working Libiamo practice cases">
				<article class="scenario-card scenario-mail">
					<header><MessagesSquare size={17} aria-hidden="true" /><span>Discord</span><small>Medium urgency</small></header>
					<p class="scenario-label">Sam · weekend planning</p>
					<h3>{discordCase.title}</h3>
					<p>{discordSeedMessage}</p>
				</article>

				<article class="scenario-card scenario-chat">
					<header><MessageCircle size={17} aria-hidden="true" /><span>Reddit</span><small>High urgency</small></header>
					<div class="mini-chat">
						<span class="mini-avatar">OP</span>
						<p><strong>Advice thread</strong> {redditSeedMessage}</p>
					</div>
					<div class="mini-reply">Reply to the post or to a specific comment in its branch.</div>
				</article>

				<article class="scenario-card scenario-forum">
					<header><Languages size={17} aria-hidden="true" /><span>Translator</span><small>Chinese → English</small></header>
					<p class="scenario-label">{translationCase.title}</p>
					<p lang="zh">{translationCase.source}</p>
				</article>
			</div>
		</section>

		<section id="feedback" class="feature feature-feedback" aria-labelledby="feedback-title">
			<div class="feedback-stage" aria-label="Annotated translation evaluation of Rousseau’s Man is born free">
				<div class="margin-note margin-note-one" aria-hidden="true">subject</div>
				<div class="margin-note margin-note-two" aria-hidden="true">idiom</div>
				<article class="editorial-review">
					<header>
						<div>
							<p>{translationCase.attribution}</p>
							<h3>Evaluation overview</h3>
						</div>
						<Sparkles size={22} aria-hidden="true" />
					</header>
					<div class="review-block">
						<p class="review-label">Learner’s first draft</p>
						<p class="review-text" lang="en">
							“
							{#each translationCase.firstDraftParts as part}
								{#if part.type === "mark"}
									<mark class="feedback-annotation feedback-annotation-draft"
										>{part.content}<sup aria-label="annotation {part.annotation}">{part.annotation}</sup></mark
									>
								{:else}
									{part.content}
								{/if}
							{/each}
							”
						</p>
					</div>
					<div class="review-rule" aria-hidden="true"></div>
					<div class="review-block">
						<p class="review-label">Reference revision</p>
						<p class="review-text suggestion" lang="en">
							“
							{#each translationCase.referenceParts as part}
								{#if part.type === "mark"}
									<mark class="feedback-annotation feedback-annotation-reference"
										>{part.content}<sup aria-label="annotation {part.annotation}">{part.annotation}</sup></mark
									>
								{:else}
									{part.content}
								{/if}
							{/each}
							”
						</p>
					</div>
					<ol class="feedback-annotation-list" aria-label="Feedback annotations">
						{#each translationCase.annotations as annotation}
							<li>
								<span>{annotation.id}</span>
								<p><strong>{annotation.label}</strong> {annotation.note}</p>
							</li>
						{/each}
					</ol>
					<footer>
						<span><Check size={15} aria-hidden="true" /> Accuracy · {translationRatings.accuracy}</span>
						<span><Check size={15} aria-hidden="true" /> Naturalness · {translationRatings.naturalness}</span>
					</footer>
				</article>
			</div>

			<div class="feature-copy">
				<p class="section-kicker"><span>02</span> Inspect the response</p>
				<h2 id="feedback-title">Feedback stays attached to the work.</h2>
				<p>
					Conversation review comments on the learner’s exact messages, grades the quest objectives, and closes with a summary. Translation review
					keeps the source, first draft, correction cards, and second draft together.
				</p>
				<ul class="feature-points">
					<li><Check size={17} aria-hidden="true" /> Message-level annotations, objective grades, and a summary</li>
					<li><Check size={17} aria-hidden="true" /> First draft, correction cards, and a verified second draft</li>
					<li><Check size={17} aria-hidden="true" /> Follow-up questions on selected feedback</li>
				</ul>
			</div>
		</section>

		<section id="remember" class="feature feature-remember" aria-labelledby="remember-title">
			<div class="feature-copy">
				<p class="section-kicker"><span>03</span> Return in review</p>
				<h2 id="remember-title">A correction becomes something you can recall.</h2>
				<p>
					Saved expressions and feedback become Notes with definitions in both languages and four bilingual examples. Review presents one example at a
					time, then schedules the next encounter from Again, Hard, Good, or Easy.
				</p>
				<div class="loop-line" aria-label="Libiamo learning loop">
					<span>Practice</span><ArrowRight size={16} aria-hidden="true" /><span>Understand</span><ArrowRight size={16} aria-hidden="true" />
					<span>Remember</span>
				</div>
			</div>

			<div class="review-stage">
				<div class="review-card-back" aria-hidden="true"></div>
				<article class="study-card">
					<header>
						<span><Languages size={17} aria-hidden="true" /> From translation feedback</span>
						<Repeat2 size={18} aria-hidden="true" />
					</header>
					<p class="study-kicker">English · expression</p>
					<h3>{reviewNote.vocab}</h3>
					<p class="definition"><span lang="zh">{reviewNote.nativeDefinition}</span><br>{reviewNote.targetDefinition}</p>
					<div class="example">
						<span>“</span>
						<p><span lang="zh">{reviewExample.nativeText}</span><br>{reviewExample.targetText}</p>
					</div>
					<footer>
						<span><Clock3 size={15} aria-hidden="true" /> Scheduled review</span>
						<span class="mastery">{reviewNote.examples.length} examples</span>
					</footer>
				</article>
			</div>
		</section>

		<section class="closing" aria-labelledby="closing-title">
			<div class="closing-mark" aria-hidden="true"><WineGlassIcon width={88} height={88} /></div>
			<h2 id="closing-title">Raise your next sentence.</h2>
			<p>Now supporting English, Spanish, French and Japanese</p>
			<a class="primary-cta" href={data.viewer ? `${base}/` : `${base}/sign-up`}>
				{data.viewer ? "Return to Quest Hall" : "Start learning"} <ArrowRight size={18} aria-hidden="true" />
			</a>
		</section>
	</main>

	<footer class="site-footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<a class="brand" href={`${base}/welcome`} aria-label="Libiamo home">
					<WineGlassIcon width={30} height={30} />
					<span class="wordmark">Libiamo</span>
				</a>
				<p>Conversation quests, translation practice, and scheduled review.</p>
			</div>
			<div class="footer-links">
				<a href={`${base}/terms`}>Terms</a>
				<a href={`${base}/privacy`}>Privacy</a>
				<a href={`${base}/changelog`}>Changelog</a>
			</div>
		</div>
	</footer>
</div>
