<script lang="ts">
import { onMount } from "svelte";
import Backdrop from "$lib/components/backdrop/Backdrop.svelte";
import FloatingPanel from "$lib/components/common/FloatingPanel.svelte";
import Composer from "$lib/components/home/Composer.svelte";
import DevPanel from "$lib/components/home/DevPanel.svelte";
import Inbox from "$lib/components/home/Inbox.svelte";
import Shelf from "$lib/components/home/Shelf.svelte";
import { shell } from "$lib/components/shell/shell.svelte";
import { ANNOUNCEMENTS, dateOf, local, readIds } from "$lib/demo/announcements";
import { toast, tx } from "$lib/demo/app.svelte";

/*
 * The home page: unread things above the greeting, the box, and the shelf. The greeting and the shelf's heading are
 * drawn once per visit, at random (the main app picks them on the server, so what the page arrives with stays). Some
 * greetings belong to a time of day or of the week and are only drawn then.
 */
const GREETS: Record<string, string[]> = {
	morning: ["greetMorning1", "greetMorning2"],
	afternoon: ["greetAfternoon1", "greetAfternoon2"],
	evening: ["greetEvening1", "greetEvening2"],
	night: ["greetNight1", "greetNight2"],
	weekend: ["greetWeekend1", "greetWeekend2"],
	monday: ["greetMonday"],
	friday: ["greetFriday"],
	any: Array.from({ length: 10 }, (_, i) => `greetAny${i + 1}`),
};
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
function drawGreeting(now = new Date()) {
	const h = now.getHours();
	const day = now.getDay();
	const timely = [
		...GREETS[h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "afternoon" : h >= 17 && h < 23 ? "evening" : "night"],
		...(day === 0 || day === 6 ? GREETS.weekend : day === 1 ? GREETS.monday : day === 5 ? GREETS.friday : []),
	];
	// About one visit in three gets a greeting for the moment; the others, one for any time.
	return pick(Math.random() < 0.35 ? timely : GREETS.any);
}
const greeting = drawGreeting();
const shelfHead = pick(["shelfHead1", "shelfHead2", "shelfHead3", "shelfHead4"]);

let markEl: HTMLElement | undefined = $state();
let trayOpen = $state(false);
let composer: Composer | undefined = $state();
const read = $derived(ANNOUNCEMENTS.filter((a) => readIds().has(a.id)));

onMount(() => {
	// Seeing the whole picture is only for a picture (the old print or the painting), not for a pattern or nothing; the
	// backdrop can change under the page (the theme turns the painting off in the dark).
	const html = document.documentElement;
	const sync = () => (shell.viewable = html.dataset.backdrop === "image" || html.dataset.backdrop === "painting");
	sync();
	const watch = new MutationObserver(sync);
	watch.observe(html, { attributes: true, attributeFilter: ["data-backdrop"] });
	// A page the learner came back from may have left a word for them (collect: how many phrases it kept).
	const note = sessionStorage.getItem("homeToast");
	if (note) {
		const [k, v] = JSON.parse(note);
		toast(tx(k, v));
		sessionStorage.removeItem("homeToast");
	}
	// Seeing the whole picture: the page steps aside until the learner comes back (the button, Esc, or a click).
	const esc = (e: KeyboardEvent) => {
		if (e.key === "Escape") shell.viewing = false;
	};
	const click = (e: MouseEvent) => {
		if (shell.viewing && !(e.target as HTMLElement).closest(".view-btn")) shell.viewing = false;
	};
	addEventListener("keydown", esc);
	addEventListener("click", click, true);
	return () => {
		watch.disconnect();
		shell.viewable = false;
		shell.viewing = false;
		removeEventListener("keydown", esc);
		removeEventListener("click", click, true);
	};
});
$effect(() => {
	document.title = tx("homeTitle");
});
</script>

<Backdrop />
<main class="home" class:away={shell.viewing}>
	<div class="inbox-room"><Inbox mark={() => markEl} /></div>
	<section class="hero">
		<h1 class="greet">
			<FloatingPanel bind:open={trayOpen} label={tx("annTitle")} side="bottom" align="start" plainTrigger triggerClass="mark-btn" class="ann-tray">
				{#snippet trigger()}
					<span class="contents" bind:this={markEl} title={tx("annTitle")}>
						<svg viewBox="8 15 48 33" aria-hidden="true" fill="currentColor">
							<path
								d="M13.9 21.6Q14 21.4 14.3 21.5L29.6 25.6Q29.9 25.7 29.9 26C31.2 39.3 21.6 47.8 10.3 46.9Q9.2 46.8 9.9 46.4C13.8 44.3 16.5 42 17.7 39.1C8.1 38 8.4 30.5 13.9 21.6Z"
							/>
							<path
								d="M34.2 21.4L50.5 16.3Q50.9 16.2 51.1 16.6C57 27.1 55.6 34.2 46.2 36.3C46.9 39.8 50.3 43.1 54.3 45.1Q54.9 45.5 54.2 45.6C42.2 47.4 32.4 35.6 33.8 22Q33.8 21.6 34.2 21.4Z"
							/>
						</svg>
					</span>
				{/snippet}
				<h2 class="tray-h">{tx("annTitle")}</h2>
				{#if read.length}
					<ul>
						{#each read as a (a.id)}
							<li>
								<div class="date">{dateOf(a.date)}</div>
								<div class="t">{local(a.title)}</div>
								<div class="b">{local(a.body).split("\n\n")[0]}</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none">{tx("annNone")}</p>
				{/if}
			</FloatingPanel>
			<!-- A word joiner: never break between the mark and the first word. -->
			<span>⁠{tx(greeting)}</span>
		</h1>
		<Composer bind:this={composer} />
	</section>
	<Shelf head={shelfHead} />
</main>
<div class="dev-wrap" class:away={shell.viewing}><DevPanel onfixture={(f) => composer?.fill(f)} /></div>

<style>
.home {
	position: relative;
	z-index: 1;
	padding: clamp(20px, 9vh, 104px) 0 72px;
	transition:
		opacity 350ms var(--ease-panel),
		visibility 0s;
}
.away {
	opacity: 0;
	visibility: hidden;
	transition:
		opacity 250ms var(--ease-panel),
		visibility 0s 250ms;
}
/* Room at the end of the page, so scrolling down uncovers the print under the cards. */
:global([data-backdrop="image"]) .home {
	padding-bottom: 24vw;
}
/* The inbox's room is kept when it is empty, so the greeting and the box stand at the same height with or without
   announcements, and do not jump up when the last one is put away. */
.inbox-room {
	min-height: 103px;
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
}
.hero {
	width: min(720px, 100% - 40px);
	margin: 0 auto;
}
.greet {
	text-align: center;
	text-wrap: balance;
	font-size: clamp(30px, 4.6vw, 40px);
	line-height: 1.2;
	margin-bottom: 26px;
	color: var(--ink);
}
:global(html[data-vt="/>/live"]) .greet,
:global(html[data-vt="/live>/"]) .greet,
:global(html[data-vt="/>/collect"]) .greet,
:global(html[data-vt="/collect>/"]) .greet {
	view-transition-name: hero-title;
}
/* Libiamo's mark (two raised glasses as quotation marks) before the greeting. It holds the announcements already
   read; an unread one, acknowledged, is tossed into it. Inline, an opening quotation mark: a long greeting wraps
   balanced under it. */
.greet :global(.mark-btn) {
	display: inline-block;
	vertical-align: -0.04em;
	margin-inline-end: 0.3em;
	padding: 0.06em;
	border: 0;
	border-radius: 0.2em;
	background: none;
	color: var(--mark);
	cursor: pointer;
	outline: none;
	transition: transform 200ms var(--ease-panel);
}
.greet :global(.mark-btn:hover) {
	transform: rotate(-4deg) scale(1.05);
}
.greet :global(.mark-btn:active) {
	transform: scale(0.95);
}
.greet :global(.mark-btn:focus-visible) {
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.greet svg {
	display: block;
	width: 1.2em;
	height: 0.83em;
	overflow: visible;
}
.greet svg path {
	transform-box: fill-box;
	transform-origin: 50% 100%;
}
:global(.ann-tray.floating-panel) {
	width: min(340px, calc(100vw - 24px));
	padding: 0;
	overflow: hidden;
	text-align: start;
}
.tray-h {
	font: 600 14px / 1.3 var(--font-sans-stack);
	padding: 12px 16px;
	border-bottom: 1px solid var(--line-soft);
}
ul {
	list-style: none;
	margin: 0;
	padding: 0;
	max-height: 360px;
	overflow-y: auto;
}
li {
	padding: 12px 16px;
}
li + li {
	border-top: 1px solid var(--line-soft);
}
.date {
	font-size: 12px;
	color: var(--muted);
}
.t {
	font-weight: 500;
	margin: 2px 0;
}
.b {
	font-size: 13.5px;
	color: var(--muted);
}
.none {
	margin: 0;
	padding: 24px 16px;
	text-align: center;
	color: var(--muted);
	font-size: 13.5px;
}
.dev-wrap {
	transition: opacity 350ms var(--ease-panel);
}
</style>
