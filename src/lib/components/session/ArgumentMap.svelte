<script lang="ts">
import { onMount, untrack } from "svelte";
import { reducedMotion } from "#lib/components/common/motion.ts";
import { clamp } from "#lib/session/text.ts";
import type { MapRow } from "#lib/session/types.ts";

/*
 * The argument map: the post's points, and under each, joined by a thin line, the parts that serve it. A plain
 * scrolling list under a fixed pointer; scrolling is native (snap does the settling), and the row whose middle is
 * nearest the pointer is chosen as it passes, so the post's highlight follows the scroll. Rows may wrap, so the
 * pointer's band takes the height of the row under it. Once the learner starts fixing, it lays flat as an ordinary
 * list with no scroll of its own.
 */
let {
	rows,
	frozen,
	labels,
	onselect,
}: { rows: MapRow[]; frozen: boolean; labels: { fix: string; miss: string; aria: string }; onselect: (r: MapRow) => void } = $props();
let box: HTMLDivElement | undefined = $state();
let picker: HTMLDivElement | undefined = $state();
let cur = $state(-1);
let band = $state(40);
let frame = 0;
const els = () => [...(box?.children ?? [])] as HTMLElement[];
const middle = (el: HTMLElement) => el.offsetTop + el.offsetHeight / 2;
function pad() {
	const e = els();
	if (!box || !e.length || frozen) return;
	box.style.paddingTop = `${Math.max(0, (box.clientHeight - e[0].offsetHeight) / 2)}px`;
	box.style.paddingBottom = `${Math.max(0, (box.clientHeight - e[e.length - 1].offsetHeight) / 2)}px`;
}
function under() {
	const e = els();
	if (!box) return 0;
	const mid = box.scrollTop + box.clientHeight / 2;
	let best = 0;
	for (let k = 1; k < e.length; k++) if (Math.abs(middle(e[k]) - mid) < Math.abs(middle(e[best]) - mid)) best = k;
	return best;
}
function choose() {
	cancelAnimationFrame(frame);
	if (frozen) return;
	const i = under();
	if (i === cur) return;
	cur = i;
	band = els()[i]?.offsetHeight ?? 40;
	onselect(rows[i]);
}
function to(i: number) {
	const el = els()[clamp(i, 0, rows.length - 1)];
	if (el && box) box.scrollTo({ top: middle(el) - box.clientHeight / 2, behavior: reducedMotion() ? "auto" : "smooth" });
}
const onScroll = () => {
	cancelAnimationFrame(frame);
	frame = requestAnimationFrame(choose);
};
onMount(() => {
	pad();
	choose();
	picker?.focus({ preventScroll: true });
	const ro = new ResizeObserver(() => {
		pad();
		if (cur >= 0) band = els()[cur]?.offsetHeight ?? band;
	});
	if (box) ro.observe(box);
	return () => {
		ro.disconnect();
		cancelAnimationFrame(frame);
	};
});
$effect(() => {
	if (frozen && box) untrack(() => ((box as HTMLDivElement).style.paddingTop = (box as HTMLDivElement).style.paddingBottom = ""));
});
</script>

<div class="map-block">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- biome-ignore lint/a11y/noStaticElementInteractions: a listbox (a plain list once frozen); biome cannot read the dynamic role -->
	<!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: both roles take a label -->
	<div
		class="picker"
		class:open={frozen}
		bind:this={picker}
		tabindex={frozen ? undefined : 0}
		role={frozen ? "list" : "listbox"}
		aria-label={labels.aria}
		onkeydown={(e) => {
			if (frozen) return;
			if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
			e.preventDefault();
			to(e.key === "ArrowDown" ? cur + 1 : cur - 1);
		}}
	>
		<div class="pk-band" style:height="{band}px"></div>
		<div class="pk-scroll" bind:this={box} onscroll={onScroll} onscrollend={choose}>
			{#each rows as r, i}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- biome-ignore lint/a11y/useKeyWithClickEvents: the listbox takes the arrow keys for its options -->
				<!-- biome-ignore lint/a11y/noStaticElementInteractions: an option (a list item once frozen); biome cannot read the dynamic role -->
				<!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-selected is set only while the role is option -->
				<div
					class="pk-row d{r.depth ?? 0}"
					class:more={r.depth === 1 && rows[i + 1]?.depth === 1}
					class:miss={r.st === "miss"}
					role={frozen ? "listitem" : "option"}
					aria-selected={frozen ? undefined : i === cur}
					onclick={() => !frozen && to(i)}
				>
					<span class="pk-what"
						>{#if r.kind}
							<span class="pk-kind">{r.kind}</span>
						{/if}
						{r.what}</span
					>
					{#if r.st}
						<span class="pk-st {r.st}">{r.st === "fix" ? labels.fix : labels.miss}</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>
	{#if !frozen}
		<!-- Every row's note is laid in the same cell, so the box is as tall as the longest from the start. -->
		<div class="pk-note">
			{#each rows as r, i}
				<p class:on={i === cur} aria-hidden="true">{r.note ?? ""}</p>
			{/each}
		</div>
		<span class="pk-live" aria-live="polite">{rows[cur]?.note ?? ""}</span>
	{/if}
</div>

<style>
.map-block {
	margin: 0 0 14px 38px;
}
.picker {
	--row: 40px;
	--rows: 5;
	position: relative;
	border-radius: 6px;
	background: var(--groove);
	box-shadow: var(--groove-shadow);
	outline: none;
}
.picker:focus-visible {
	outline: 2px solid var(--ring-c);
	outline-offset: 2px;
}
.pk-band {
	position: absolute;
	left: 6px;
	right: 6px;
	top: 50%;
	translate: 0 -50%;
	transition: height 0.15s ease;
	border-radius: 5px;
	background: var(--raised-face);
	box-shadow: var(--raised-shadow);
	pointer-events: none;
}
.pk-band::before {
	content: "";
	position: absolute;
	left: -6px;
	top: 50%;
	margin-top: -6px;
	border: 6px solid transparent;
	border-left: 7px solid var(--ink);
	border-right: 0;
}
.pk-scroll {
	position: relative;
	height: calc(var(--row) * var(--rows));
	overflow-y: auto;
	overscroll-behavior: contain;
	scroll-snap-type: y mandatory;
	scrollbar-width: none;
	padding-block: calc(var(--row) * (var(--rows) - 1) / 2);
	mask-image: linear-gradient(transparent, #000 28%, #000 72%, transparent);
}
.pk-scroll::-webkit-scrollbar {
	display: none;
}
.pk-row {
	position: relative;
	min-height: var(--row);
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 7px 20px;
	scroll-snap-align: center;
	cursor: pointer;
}
.open {
	background: var(--well);
	box-shadow: none;
}
.open .pk-band {
	display: none;
}
.open .pk-scroll {
	height: auto;
	overflow: visible;
	scroll-snap-type: none;
	padding-block: 6px;
	mask-image: none;
}
.open .pk-row {
	min-height: 34px;
	cursor: default;
}
.pk-what {
	flex: 1;
	min-width: 0;
	font-size: 14.5px;
	line-height: 1.45;
}
.d0 .pk-what {
	font-weight: 600;
}
.d1 {
	padding-left: 46px;
}
.d1::before {
	content: "";
	position: absolute;
	left: 29px;
	top: 0;
	height: 50%;
	border-left: 1.5px solid var(--line);
}
.d1.more::before {
	height: 100%;
}
.d1::after {
	content: "";
	position: absolute;
	left: 29px;
	top: 50%;
	width: 9px;
	border-top: 1.5px solid var(--line);
}
.pk-kind {
	margin-right: 8px;
	font-size: 12.5px;
	color: var(--muted);
}
.miss .pk-what {
	color: var(--muted);
}
.pk-st {
	flex: none;
	font-size: 12px;
	height: 20px;
	padding: 0 7px;
	border-radius: 4px;
	display: inline-flex;
	align-items: center;
}
.pk-st.fix {
	color: var(--tutor);
	background: color-mix(in srgb, var(--tutor) 12%, transparent);
}
.pk-st.miss {
	color: var(--reader);
	border: 1px dashed color-mix(in srgb, var(--reader) 55%, transparent);
}
.pk-note {
	display: grid;
	padding: 8px 4px 0;
	font-size: 13.5px;
	color: var(--muted);
}
.pk-note > p {
	grid-area: 1 / 1;
	margin: 0;
	opacity: 0;
	visibility: hidden;
	transition:
		opacity 0.15s ease,
		visibility 0s linear 0.15s;
}
.pk-note > p.on {
	opacity: 1;
	visibility: visible;
	transition-delay: 0s;
}
.pk-live {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}
@media (max-width: 760px) {
	.map-block {
		margin-left: -14px;
	}
	.picker {
		--row: 38px;
	}
	.pk-row {
		gap: 10px;
		padding: 7px 12px;
	}
	.pk-what {
		font-size: 13.5px;
	}
}
</style>
