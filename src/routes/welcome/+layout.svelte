<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import BookOpen from "@lucide/svelte/icons/book-open";
import Check from "@lucide/svelte/icons/check";
import Clock3 from "@lucide/svelte/icons/clock-3";
import Languages from "@lucide/svelte/icons/languages";
import Mail from "@lucide/svelte/icons/mail";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessagesSquare from "@lucide/svelte/icons/messages-square";
import Repeat2 from "@lucide/svelte/icons/repeat-2";
import Sparkles from "@lucide/svelte/icons/sparkles";
import { onMount } from "svelte";
import { base } from "$app/paths";
import WineGlassIcon from "$lib/components/WineGlassIcon.svelte";
import "./styles/shell.css";
import "./styles/hero.css";
import "./styles/sections.css";
import "./styles/responsive.css";

let { children } = $props();

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

const practiceCards = [
	{
		label: "Today",
		title: "An invitation you can’t accept",
		number: "01 / 03",
		platform: "iMessage",
		duration: "4 min",
		avatar: "M",
		incoming: "Would you come to dinner tonight? I’d really love you to meet everyone.",
		outgoing: "I’d love to, but I promised my sister I’d help her move. Could we plan something next week?",
		feedbackTitle: "Warm, clear, specific",
		feedback: "You declined without sounding distant and kept the connection open.",
	},
	{
		label: "This week",
		title: "Make your case without closing the door",
		number: "02 / 03",
		platform: "Discussion",
		duration: "8 min",
		avatar: "A",
		incoming: "The team is leaning toward Monday. Why do you still think we should launch on Friday?",
		outgoing: "Friday gives us time to watch the rollout, but I’m open to Monday if support coverage is the concern.",
		feedbackTitle: "Confident, not combative",
		feedback: "You made the case directly while leaving room for the group to decide.",
	},
	{
		label: "Translation",
		title: "A note that still sounds like you",
		number: "03 / 03",
		platform: "Translation",
		duration: "6 min",
		avatar: "T",
		incoming: "I didn’t mean to put you on the spot. Take whatever time you need.",
		outgoing: "Je ne voulais pas te mettre mal à l’aise. Prends tout le temps qu’il te faut.",
		feedbackTitle: "Natural, considerate phrasing",
		feedback: "The translation keeps the reassurance without sounding literal or stiff.",
	},
] as const;

type PracticeCard = (typeof practiceCards)[number];

const practiceCardTransitionMs = 480;

let activeSentenceIndex = $state(0);
let activeLanguageIndex = $state(0);
let typewriterText = $state<string>(sentenceSets[0][0].text);
let typewriterPhase = $state<"idle" | "typing" | "holding" | "deleting">("idle");
let reducedMotion = $state(false);
let activePracticeIndex = $state(0);
let practiceCardAnimating = $state(false);
let practiceCardTimer: number | undefined;
let lyricTranslation = $derived(sentenceSets[activeSentenceIndex][activeLanguageIndex]);
let nextLyricTranslation = $derived(sentenceSets[activeSentenceIndex][(activeLanguageIndex + 1) % sentenceSets[0].length]);
let activePractice = $derived(practiceCards[activePracticeIndex]);
let nextPractice = $derived(practiceCards[(activePracticeIndex + 1) % practiceCards.length]);
let followingPractice = $derived(practiceCards[(activePracticeIndex + 2) % practiceCards.length]);

function cycleLyricLanguage() {
	activeLanguageIndex = (activeLanguageIndex + 1) % sentenceSets[0].length;
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
		motionQuery.removeEventListener("change", handleMotionChange);
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
			activeLanguageIndex = (activeLanguageIndex + 1) % sentenceSets[0].length;
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
				{#if card.label === "Translation"}
					<Languages size={15} aria-hidden="true" />
				{:else}
					<MessageCircle size={15} aria-hidden="true" />
				{/if}
				{card.platform}
			</span>
			<span><Clock3 size={15} aria-hidden="true" /> {card.duration}</span>
		</div>

		<div class="dialogue">
			<div class="message incoming">
				<span class="avatar">{card.avatar}</span>
				<p>{card.incoming}</p>
			</div>
			<div class="message outgoing">
				<p>{card.outgoing}</p>
			</div>
		</div>

		<div class="brief-feedback">
			<span class="feedback-mark"><Check size={16} strokeWidth={2.4} aria-hidden="true" /></span>
			<div>
				<strong>{card.feedbackTitle}</strong>
				<p>{card.feedback}</p>
			</div>
		</div>
	</div>
{/snippet}

<a class="skip-link" href="#main-content">Skip to content</a>

<div class="landing-shell">
	<header class="site-header">
		<div class="header-inner">
			<a class="brand" href={`${base}/welcome`} aria-label="Libiamo home">
				<WineGlassIcon width={34} height={34} />
				<span>Libiamo</span>
			</a>

			<nav class="section-nav" aria-label="Homepage sections">
				<a href="#practice">Practice</a>
				<a href="#feedback">Feedback</a>
				<a href="#remember">Remember</a>
			</nav>

			<div class="account-links">
				<a class="sign-in-link" href={`${base}/sign-in`}>Sign in</a>
				<a class="header-cta" href={`${base}/sign-up`}>Start learning</a>
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
						<span class:lyric-japanese={lyricTranslation.code === "ja"} class="lyric-sentence" lang={lyricTranslation.code} aria-hidden="true">
							{typewriterText}<span class="typewriter-caret" aria-hidden="true"></span>
						</span>
					</button>
				</blockquote>
				<p class="hero-intro">
					Step into the conversations textbooks leave out, with thoughtful feedback on how your words land and a memory system that helps the right
					expressions become your own.
				</p>
				<div class="hero-actions">
					<a class="primary-cta" href={`${base}/sign-up`}>Begin a conversation <ArrowRight size={18} aria-hidden="true" /></a>
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
				<figcaption>A realistic prompt, your response, and feedback on what the words actually do.</figcaption>
			</figure>
		</section>

		<section class="manifesto" aria-labelledby="manifesto-title">
			<p class="section-index">The missing middle · 01</p>
			<div class="manifesto-grid">
				<h2 id="manifesto-title">Vocabulary gets you to the sentence. <em>Judgment gets you through the room.</em></h2>
				<div class="manifesto-copy">
					<p>
						Real fluency lives in the choices around the words: how direct to be, what the setting expects, and when a technically correct sentence
						still feels wrong.
					</p>
					<p>Libiamo gives you a safe place to rehearse those choices before you need them in real life.</p>
				</div>
			</div>
		</section>

		<section id="practice" class="feature feature-practice" aria-labelledby="practice-title">
			<div class="feature-copy">
				<p class="section-kicker"><span>01</span> Practice in context</p>
				<h2 id="practice-title">Step into the conversation, not another exercise.</h2>
				<p>
					Every quest gives you a person, a purpose, and a real social surface. Write the message, hold the boundary, make the case, or translate the
					thought in the language you are learning.
				</p>
				<ul class="feature-points">
					<li><Check size={17} aria-hidden="true" /> Daily and weekly scenarios matched to your level</li>
					<li><Check size={17} aria-hidden="true" /> Distinct personalities that respond naturally</li>
					<li><Check size={17} aria-hidden="true" /> Email, chat, forums, fiction comments, and translation</li>
				</ul>
			</div>

			<div class="scenario-stage" aria-label="Examples of Libiamo practice scenarios">
				<article class="scenario-card scenario-mail">
					<header><Mail size={17} aria-hidden="true" /><span>New message</span><small>Formal</small></header>
					<p class="scenario-label">To · Sofia Laurent</p>
					<h3>Re: Project timeline</h3>
					<p>Thanks for the update. Friday may be difficult on our side; could we agree on Monday morning instead?</p>
				</article>

				<article class="scenario-card scenario-chat">
					<header><MessagesSquare size={17} aria-hidden="true" /><span># weekend-plans</span><small>Casual</small></header>
					<div class="mini-chat">
						<span class="mini-avatar">A</span>
						<p><strong>Alex</strong> You’re still coming tomorrow, right?</p>
					</div>
					<div class="mini-reply">I might be late, but save me a seat.</div>
				</article>

				<article class="scenario-card scenario-forum">
					<header><BookOpen size={17} aria-hidden="true" /><span>Reading circle</span><small>Thoughtful</small></header>
					<p class="scenario-label">Reply to a reader</p>
					<p>“I read the ending differently. To me, her silence feels more protective than uncertain…”</p>
				</article>
			</div>
		</section>

		<section id="feedback" class="feature feature-feedback" aria-labelledby="feedback-title">
			<div class="feedback-stage" aria-label="Example of contextual language feedback">
				<div class="margin-note margin-note-one" aria-hidden="true">tone</div>
				<div class="margin-note margin-note-two" aria-hidden="true">register</div>
				<article class="editorial-review">
					<header>
						<div>
							<p>Conversation review</p>
							<h3>Your meaning, made clearer</h3>
						</div>
						<Sparkles size={22} aria-hidden="true" />
					</header>
					<div class="review-block">
						<p class="review-label">You wrote</p>
						<p class="review-text">“Send me the file when you finish.”</p>
					</div>
					<div class="review-rule" aria-hidden="true"></div>
					<div class="review-block">
						<p class="review-label">A better fit here</p>
						<p class="review-text suggestion">“Could you send me the file when you’re finished?”</p>
					</div>
					<blockquote>
						The original is grammatical, but it sounds like an order in this workplace conversation. The question form keeps the request clear while
						softening the power difference.
					</blockquote>
					<footer>
						<span><Check size={15} aria-hidden="true" /> Meaning kept</span>
						<span><Check size={15} aria-hidden="true" /> Tone adjusted</span>
					</footer>
				</article>
			</div>

			<div class="feature-copy">
				<p class="section-kicker"><span>02</span> Understand the effect</p>
				<h2 id="feedback-title">Feedback that reads the room.</h2>
				<p>
					Libiamo looks beyond grammar. It explains how your response may land, points to the exact language choice, and offers an alternative without
					sanding away your voice.
				</p>
				<ul class="feature-points">
					<li><Check size={17} aria-hidden="true" /> Clear notes on tone, politeness, and intent</li>
					<li><Check size={17} aria-hidden="true" /> Examples in your target and native languages</li>
					<li><Check size={17} aria-hidden="true" /> Follow-up questions when you want the reason</li>
				</ul>
			</div>
		</section>

		<section id="remember" class="feature feature-remember" aria-labelledby="remember-title">
			<div class="feature-copy">
				<p class="section-kicker"><span>03</span> Remember naturally</p>
				<h2 id="remember-title">Keep the phrases worth keeping.</h2>
				<p>
					Useful language from your own conversations becomes a personal review deck. Revisit it in natural examples at the moment your memory needs
					it, then carry it into the next quest.
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
						<span><Languages size={17} aria-hidden="true" /> From your last conversation</span>
						<Repeat2 size={18} aria-hidden="true" />
					</header>
					<p class="study-kicker">English · expression</p>
					<h3>to keep someone in the loop</h3>
					<p class="definition">to continue giving someone the information they need</p>
					<div class="example">
						<span>“</span>
						<p>I’ll keep you in the loop as soon as the schedule changes.</p>
					</div>
					<footer>
						<span><Clock3 size={15} aria-hidden="true" /> Next review · 4 days</span>
						<span class="mastery">Growing</span>
					</footer>
				</article>
			</div>
		</section>

		<section class="closing" aria-labelledby="closing-title">
			<div class="closing-mark" aria-hidden="true"><WineGlassIcon width={88} height={88} /></div>
			<p class="eyebrow"><span></span> Your next conversation starts here</p>
			<h2 id="closing-title">Raise your next sentence.</h2>
			<p>Practice with purpose, understand the response, and speak with more of yourself each time.</p>
			<a class="primary-cta" href={`${base}/sign-up`}>Start learning <ArrowRight size={18} aria-hidden="true" /></a>
		</section>
	</main>

	<footer class="site-footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<a class="brand" href={`${base}/welcome`} aria-label="Libiamo home">
					<WineGlassIcon width={30} height={30} />
					<span>Libiamo</span>
				</a>
				<p>Language through living conversation.</p>
			</div>
			<div class="footer-links">
				<a href="#practice">Practice</a>
				<a href="#feedback">Feedback</a>
				<a href="#remember">Remember</a>
				<a href={`${base}/sign-in`}>Sign in</a>
			</div>
			<p class="footer-note">Made for the conversations that matter.</p>
		</div>
	</footer>
</div>
