<script lang="ts">
import { dev } from "$app/environment";
import { streakPreview } from "$lib/client/streak-preview.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { StreakView } from "$lib/streak";
import type { CelebrationKind } from "$lib/streak-presentation";
import StreakFlame from "./StreakFlame.svelte";
import StreakWeek from "./StreakWeek.svelte";

let { kind, view, today, lang, ondone }: { kind: CelebrationKind; view: StreakView; today: string; lang: LanguageCode; ondone: () => void } =
	$props();
let phase = $state<"arrive" | "ignite" | "week" | "leave">("arrive");
let artReady = $state(false);
let ignitionDone = $state(false);
let rising = $state(false);
const weekVisible = $derived(rising || phase === "week" || phase === "leave");
const speed = $derived(dev ? streakPreview.speed : 1);
let reduced = $state(false);
$effect(() => {
	reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || (dev && streakPreview.forceReducedMotion);
});
$effect(() => {
	if (!artReady) return;
	let timer: ReturnType<typeof setTimeout>;
	if (phase === "arrive")
		timer = setTimeout(
			() => {
				phase = "ignite";
			},
			reduced ? 0 : 550 * speed,
		);
	else if (phase === "ignite" && (kind === "kindling" || ignitionDone || reduced)) {
		timer = setTimeout(
			() => {
				phase = "week";
			},
			(reduced ? 900 : kind === "kindling" ? 1150 : 0) * speed,
		);
	} else if (phase === "week")
		timer = setTimeout(
			() => {
				phase = "leave";
			},
			(reduced ? 1900 : 2800) * speed,
		);
	else if (phase === "leave") timer = setTimeout(ondone, (reduced ? 0 : 500) * speed);
	return () => clearTimeout(timer);
});
</script>
<aside class="celebration" class:leaving={phase === "leave"} class:reduced style="--tempo:{speed}" aria-label={t(lang, "streak.label")}>
	<div class="wash"></div>
	<button type="button" class="dismiss" onclick={ondone} aria-label={t(lang, "common.close")}>×</button>
	<div class="hero">
		<StreakFlame
			appearance={phase === "arrive" ? "gray" : kind === "ignite" ? "burn" : "kindling"}
			igniting={kind === "ignite" && phase !== "arrive"}
			size={120}
			idle={false}
			continuous
			onready={() => { artReady = true; }}
			onrise={() => { rising = true; }}
			onigniteend={() => { ignitionDone = true; }}
		/>
		<div class="headline" aria-live="polite">
			<strong
				>{kind === "ignite" ? t(lang, view.days === 1 ? "streak.dayOne" : "streak.dayMany").replace("{count}", String(view.days)) : t(lang, "streak.halfway")}</strong
			>
			<p>{t(lang, kind === "ignite" ? "streak.keepGoing" : view.taskCount > 0 ? "streak.nextReview" : "streak.nextQuest")}</p>
		</div>
	</div>
	<div class="week-reveal" class:visible={weekVisible} aria-hidden={!weekVisible}><StreakWeek {view} {today} {lang} compact /></div>
</aside>
<style>
.celebration {
	position: fixed;
	z-index: 100;
	top: 0;
	left: 50%;
	width: min(520px, 100%);
	padding: 26px 35px 45px;
	transform: translateX(-50%);
	color: #674b32;
	animation: arrive calc(550ms * var(--tempo)) cubic-bezier(0.18, 0.8, 0.24, 1) both;
	pointer-events: none;
}
.wash {
	position: absolute;
	z-index: -1;
	inset: 0 -30px -30px;
	background: linear-gradient(#f9f3e6fa 0%, #f9f3e6f5 68%, #f9f3e6d9 84%, #f9f3e600 100%);
	mask-image: linear-gradient(90deg, transparent, #000 9% 91%, transparent);
}
.hero {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 15px;
	min-height: 130px;
}
.headline {
	max-width: 260px;
	font-family: var(--font-sans);
}
strong {
	display: block;
	font-family: var(--font-sans);
	font-size: 31px;
	font-weight: 700;
	line-height: 1.15;
}
p {
	font-size: 12px;
	line-height: 1.5;
	margin-top: 8px;
	color: #907a63;
}
.week-reveal {
	opacity: 0;
	transform: translateY(14px);
	margin-top: 12px;
	transition:
		opacity calc(400ms * var(--tempo)),
		transform calc(400ms * var(--tempo));
}
.week-reveal.visible {
	opacity: 1;
	transform: none;
}
.dismiss {
	position: absolute;
	top: 8px;
	right: 10px;
	width: 44px;
	height: 44px;
	pointer-events: auto;
	color: #9f8a71;
	font-size: 23px;
}
.dismiss:focus-visible {
	outline: 2px solid #8b603a;
}
.leaving {
	animation: leave calc(500ms * var(--tempo)) ease-in both;
}
@keyframes arrive {
	from {
		transform: translate(-50%, -105%);
		opacity: 0;
	}
	to {
		transform: translate(-50%, 0);
		opacity: 1;
	}
}
@keyframes leave {
	to {
		transform: translate(-50%, -105%);
		opacity: 0;
	}
}
.reduced,
.reduced.leaving {
	animation: none;
}
.reduced .week-reveal {
	transition: none;
}
@media (max-width: 400px) {
	.celebration {
		padding: 20px 22px 38px;
	}
	.hero {
		gap: 3px;
	}
	strong {
		font-size: 22px;
	}
}
@media (prefers-reduced-motion: reduce) {
	.celebration,
	.leaving {
		animation: none;
	}
	.week-reveal {
		transition: none;
	}
}
</style>
