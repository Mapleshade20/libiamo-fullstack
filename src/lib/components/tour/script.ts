import { drinkOf } from "#lib/components/streak/glass/drinks.ts";
import { app } from "#lib/demo/app.svelte.ts";
import { dayKey, practised, recordWriting } from "#lib/demo/data.ts";
import { contentFor } from "./content";
import type { Chapter, Director } from "./director.svelte";

/*
 * The tour, chapter by chapter, from the learner's seat: what they most want to know is what happens to something they
 * wrote, so that comes first and is done for real (on a tape); then where phrases come from besides their writing,
 * where they all go and how they come back, what to write when they have nothing, and how a day counts.
 */
const content = () => contentFor(app.lang);
const base = (): Record<string, unknown> => ({
	homeDraft: {},
	practiceDays: {},
	glassSeen: { day: dayKey(), look: "down", drink: drinkOf().id },
});
const withPiece = () => ({ ...base(), myWriting: [content().piece(Date.now())] });
const withKept = () => ({ ...withPiece(), collected: [content().kept(Date.now())] });

const q = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const last = <T>(xs: T[]) => xs[xs.length - 1];

/** Pass 1, done: the first mark fixed by typing, the rest seen through. */
async function passOne(d: Director) {
	const c = content();
	let first = true;
	// A card answered stays a moment as it goes: each is handled once, and only while it still asks.
	const seen = new WeakSet<Element>();
	const asks = (card: Element) =>
		!seen.has(card) &&
		(!!card.querySelector(".fix-in:not([readonly])") || (!card.querySelector(".fix-in") && !!card.querySelector(".p1-actions button")));
	for (let n = 0; n < 12; n++) {
		const next = await d.find(() => {
			const end = document.querySelector(".p1-card.end");
			if (end) return end;
			return q(".post-body .p1-card:not(.end)").find(asks) ?? null;
		}, 60000);
		if (next.matches(".end")) return next;
		seen.add(next);
		const field = next.querySelector<HTMLInputElement>(".fix-in:not([readonly])");
		if (field && first) {
			first = false;
			await d.say("tourW4", next);
			const was = field.value.trim().toLowerCase();
			const fix = c.fixes[was] ?? Object.entries(c.fixes).find(([k]) => was.includes(k))?.[1];
			if (fix) {
				await d.type(field, fix, { replace: true, cps: 9 });
				await d.click(next.querySelector<HTMLElement>(".send") as HTMLElement);
			} else await d.click(next.querySelector<HTMLElement>(".p1-link") as HTMLElement);
			const cont = await d.find(() => next.querySelector(".p1-actions.after button"));
			await d.say("tourW5", next);
			await d.click(cont);
		} else if (field) {
			// Seeing the answer fills it in and moves on by itself.
			await d.click(next.querySelector<HTMLElement>(".p1-link") as HTMLElement);
			await d.wait(900);
		} else {
			await d.wait(700);
			await d.click(next.querySelector<HTMLElement>(".p1-actions button") as HTMLElement);
		}
	}
	return d.find(".p1-card.end");
}

/** Pass 2's bar once it asks something (with `what` in it, when given). */
const bar = (d: Director, what = ".pill, .bar-row button, textarea") =>
	d.find(() => {
		const b = document.querySelector(".dockbar:not(.waiting):not(.out) .bar-in");
		return b?.querySelector(what) ? b : null;
	}, 90000);
const lastStop = () => last(q<HTMLElement>(".thread .stop")) ?? null;

/** Answers whatever pass 2's bar asks, once: a quick reply, the main button, or a rewrite. */
async function answerBar(d: Director) {
	const bar = await d.find(() => {
		const b = document.querySelector(".dockbar:not(.waiting):not(.out) .bar-in");
		return b?.querySelector(".pill, .bar-row button, textarea") ? b : null;
	}, 60000);
	const pill = bar.querySelector<HTMLElement>(".pill");
	const main = bar.querySelector<HTMLElement>(".bar-row button");
	const field = bar.querySelector<HTMLTextAreaElement>("textarea");
	if (pill) await d.click(pill);
	else if (main) await d.click(main);
	else if (field) {
		await d.type(field, content().rewrites[0][1], { cps: 16 });
		await d.click(bar.querySelector<HTMLElement>(".send") as HTMLElement);
	}
}

const write: Chapter = {
	key: "tourWrite",
	start: "/",
	seed: base,
	async run(d) {
		const c = content();
		// The light stays on the box while the pointer pastes and sends: it is one thing.
		await d.say("tourW1", ".composer");
		await d.paste("#draft", c.draft);
		await d.click(".composer .go");
		d.quiet();
		// The session: the scene first.
		await d.find(".scene-card .infer", 60000);
		await d.say("tourW3", ".scene-card");
		await d.click(".scene-card .actions button");
		d.quiet();
		const end = await passOne(d);
		await d.say("tourW6", end);
		await d.click(end.querySelector<HTMLElement>(".go-row button") as HTMLElement);
		d.quiet();
		// Pass 2: the reader's reading, then one place worked on.
		await bar(d);
		await d.say("tourW7", lastStop() ?? ".convo");
		await answerBar(d);
		d.quiet();
		// The tutor's plan, and the button that starts on the places.
		const plan = await bar(d, ".bar-row button");
		await d.click(plan.querySelector<HTMLElement>(".bar-row button") as HTMLElement);
		// The first place: answer what it asks until it asks for a rewrite. The reader may ask what was meant first (in
		// the learner's words, any language); a tutor who then finds it fine offers keeping it: the tour changes it anyway.
		let asked = false;
		for (let n = 0; n < 6; n++) {
			const b = await bar(d);
			const field = b.querySelector<HTMLTextAreaElement>("textarea");
			if (!field) {
				const anyway = q<HTMLElement>(".dockbar .bar-row button").find((x) => x.textContent?.trim() === d.t("changeAnyway"));
				await d.click(anyway ?? (b.querySelector<HTMLElement>(".pill, .bar-row button") as HTMLElement));
				continue;
			}
			const own = field.placeholder === d.t("ownCompose");
			if (!asked) await d.say("tourW8", [lastStop()?.querySelector<HTMLElement>(".top"), b as HTMLElement]);
			else await d.say("tourW8b", b as HTMLElement);
			asked = true;
			if (own) {
				await d.type(field, c.meant(), { cps: 12 });
				await d.click(b.querySelector<HTMLElement>(".send") as HTMLElement);
				d.quiet();
				continue;
			}
			const place = `${lastStop()?.querySelector(".top")?.textContent ?? ""} ${document.querySelector(".post-body .item.sel")?.textContent ?? ""}`;
			const rewrite = c.rewrites.find(([k]) => place.includes(k))?.[1] ?? c.rewrites[0][1];
			await d.type(field, rewrite, { cps: 12 });
			await d.click(b.querySelector<HTMLElement>(".send") as HTMLElement);
			d.quiet();
			break;
		}
		await bar(d);
		await d.wait(800);
		await d.say("tourW8c", last(q<HTMLElement>(".thread .stop:last-of-type .replies > *")) ?? lastStop());
		d.quiet();
		// The rest goes the same way; the tour skips to the finished piece.
		recordWriting(c.piece(Date.now()));
		await d.go("/w/tour-piece");
		await d.say("tourW9", ".piece .ready");
		await d.say("tourW10", ".piece .learned");
	},
};

const collect: Chapter = {
	key: "tourCollect",
	start: "/",
	seed: withPiece,
	async run(d) {
		const c = content();
		await d.say("tourC1", ".composer");
		await d.click(".composer [role='radiogroup'] label:last-of-type");
		await d.paste("#draft", c.reading);
		await d.click(".composer .go");
		d.quiet();
		const passage = await d.find(".passage", 30000);
		// The words to mark, by their text.
		const words = q<HTMLElement>(".passage .w");
		const want = c.mark.split(/\s+/);
		const at = words.findIndex((_w, i) => want.every((x, k) => words[i + k]?.textContent === x));
		await d.say("tourC2", passage);
		await d.drag(words[at], words[at + want.length - 1]);
		const item = await d.find(".items .item", 10000);
		await d.find(() => item.querySelector(".said .reg"), 60000);
		await d.say("tourC3", item);
		d.quiet();
		await d.click(".focus-bar .exit");
	},
};

const notebook: Chapter = {
	key: "tourNotes",
	start: "/notebook",
	seed: withKept,
	async run(d) {
		await d.say("tourN1", ".rows");
		// The phrase just collected: its page, then its card in review.
		await d.click(".rows a.row");
		d.quiet();
		await d.say("tourN3", ".sheet, main");
		await d.click("main a[href='/review']");
		d.quiet();
		const field = await d.find(".answer input", 15000);
		await d.say("tourN5", ".study");
		await d.type(field, content().review, { cps: 10 });
		await d.click(".answer .go");
		d.quiet();
		const rates = await d.find(".foot .rates", 10000);
		await d.say("tourN6", [document.querySelector<HTMLElement>(".study"), rates]);
		await d.click(".foot .rates button:nth-child(3)");
		d.quiet();
		await d.wait(1200);
	},
};

const scenario: Chapter = {
	key: "tourScenario",
	start: "/",
	seed: withKept,
	async run(d) {
		await d.say("tourQ1", ".shelf .cards");
		await d.click(".shelf .cards a.card[href^='/scenario/']");
		d.quiet();
		await d.find(".scenario .cols", 15000);
		await d.say("tourQ2", ".scenario .scene");
		await d.say("tourQ3", ".scenario .paper");
		await d.say("tourQ4", ".scenario .prep");
		await d.say("tourQ5", ".scenario .go");
	},
};

const week: Chapter = {
	key: "tourWeek",
	start: "/",
	seed: () => ({ ...withKept(), practiceDays: { [dayKey()]: "learned" }, glassSeen: { day: dayKey(), look: "up", drink: drinkOf().id } }),
	async run(d) {
		await d.say("tourK1", ".week-btn");
		await d.click(".week-btn");
		await d.find(".week-pop .hero", 5000);
		await d.say("tourK2", ".week-pop");
		// Clearing today's reviews, in the sandbox: the glass is filled where the learner can see it.
		practised("reviewed");
		await d.wait(5600);
		await d.say("tourK3", ".week-pop");
		d.quiet();
		await d.say("tourEnd");
	},
};

export const CHAPTERS: Chapter[] = [write, collect, notebook, scenario, week];
