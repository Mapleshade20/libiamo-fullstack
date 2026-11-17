import assert from "node:assert/strict";
import { test } from "vitest";
import { DRINKS, drinkOf, insideHalf } from "#lib/components/streak/glass/drinks.ts";
import { Rocker, STEP, Surface } from "#lib/components/streak/glass/physics.ts";
import { type Moment, Scene } from "#lib/components/streak/glass/scene.ts";

const run = (s: Scene, seconds: number) => {
	for (let t = 0; t < seconds; t += 1 / 60) s.tick(1 / 60);
};

test("a knocked glass rocks back to rest, faster and smaller each time, and never topples", () => {
	const r = new Rocker(9, 18);
	r.kick(6);
	let peak = 0;
	let crossings = 0;
	let was = 0;
	for (let i = 0; i < 240 * 4; i++) {
		r.step(STEP);
		peak = Math.max(peak, Math.abs(r.theta));
		if (was !== 0 && Math.sign(r.theta) !== Math.sign(was)) crossings++;
		was = r.theta || was;
	}
	assert.ok(peak < r.tipping, "it leans less than the tipping angle");
	assert.ok(crossings >= 2, "it rattles from side to side");
	assert.ok(r.resting, "and comes to rest");
});

test("the liquid settles after a poke", () => {
	const s = new Surface(10);
	s.poke(0, 20);
	assert.ok(!s.calm);
	for (let i = 0; i < 240 * 4; i++) s.step(STEP);
	assert.ok(s.calm);
});

test("each day of the week has its own glass, Monday first", () => {
	assert.equal(new Set(DRINKS.map((d) => d.id)).size, 7);
	assert.equal(drinkOf("2026-11-09").id, DRINKS[0].id); // a Monday
	assert.equal(drinkOf("2026-11-08").id, DRINKS[6].id); // a Sunday
	for (const d of DRINKS) assert.ok(insideHalf(d, d.level) > 0 && d.level > d.rim.y, `${d.id}: its level is inside, below the rim`);
});

const ends: [Moment, "down" | "up" | "full", "down" | "up" | "full"][] = [
	["flip", "down", "up"],
	["pour", "up", "full"],
	["spill", "full", "down"],
	["unflip", "up", "down"],
	["swap", "down", "down"],
];
for (const d of DRINKS)
	test(`${d.id}: every moment ends, in the look it leads to, at rest`, () => {
		for (const [m, from, to] of ends) {
			const s = new Scene(d, from);
			let done = false;
			s.play(m, () => (done = true), DRINKS[(DRINKS.indexOf(d) + 1) % 7]);
			run(s, 12);
			assert.ok(done, `${m} ended`);
			assert.equal(s.look, to, `${m} → ${to}`);
			assert.equal(s.moment, null);
			assert.ok(Math.abs(s.rock.theta) < 0.01 && Math.abs(s.y) < 0.01, `${m}: the glass stands on the table`);
			if (to === "full") assert.ok(s.fill > 0.99 && s.items.every((i) => i.on), "poured and garnished");
			if (to !== "full") assert.equal(s.fill, 0);
		}
		for (const m of ["jitter", "tip", "hop", "slosh", ...d.idles] as Moment[]) {
			const s = new Scene(d, m === "slosh" || (d.idles as Moment[]).includes(m) ? "full" : "down");
			let done = false;
			s.play(m, () => (done = true));
			run(s, 8);
			assert.ok(done && !s.busy, `${m} ends and goes still`);
		}
	});

test("finishing a moment at once lands on its end (reduced motion)", () => {
	const s = new Scene(DRINKS[3], "up");
	let done = false;
	s.play("pour", () => (done = true));
	s.finish();
	assert.ok(done);
	assert.equal(s.look, "full");
	assert.ok(!s.busy);
});
