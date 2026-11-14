import assert from "node:assert/strict";
import { test } from "vitest";
import { BACKGROUND_LANES, begin, discard, finish, gate, inBackground, inSession, promote, withPurpose } from "$model/trace.ts";

/** A fake provider call through the lane: resolves when `done` is called, records when it started. */
function fakeCall(purpose: string, bg: boolean, started: string[]) {
	let done!: () => void;
	const finished = new Promise<void>((r) => {
		done = r;
	});
	const run = (bg ? inBackground : withPurpose)(purpose, async () => {
		const call = begin(purpose, "m", []);
		const release = await gate(call);
		started.push(purpose);
		await finished;
		release();
		finish(call, { state: "done" });
	});
	return { run, done };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Guesses that hold every lane but one, so the tests below watch the last free lane whatever the lane count. */
async function fill(started: string[]) {
	const jobs = Array.from({ length: BACKGROUND_LANES - 1 }, (_, i) => fakeCall(`filler ${i}`, true, started));
	await tick();
	started.length = 0;
	return async () => {
		for (const j of jobs) j.done();
		await Promise.all(jobs.map((j) => j.run));
	};
}

test("speculative calls take turns while the learner's calls never wait", async () => {
	await inSession("lane-a", "x", async () => {
		const started: string[] = [];
		const free = await fill(started);
		const a = fakeCall("material s1", true, started);
		const b = fakeCall("material s2", true, started);
		const g = fakeCall("grade s1", false, started);
		await tick();
		assert.deepEqual(started, ["material s1", "grade s1"]);
		a.done();
		await a.run;
		await tick();
		assert.deepEqual(started, ["material s1", "grade s1", "material s2"]);
		b.done();
		g.done();
		await Promise.all([b.run, g.run]);
		await free();
	});
});

test("when a turn frees up, only the next queued guess starts", async () => {
	await inSession("lane-c", "x", async () => {
		const started: string[] = [];
		const free = await fill(started);
		const jobs = [1, 2, 3, 4].map((i) => fakeCall(`material s${i}`, true, started));
		await tick();
		jobs[0].done();
		await jobs[0].run;
		await tick();
		assert.deepEqual(started, ["material s1", "material s2"]);
		for (const j of jobs.slice(1)) {
			j.done();
			await j.run;
			await tick();
		}
		assert.deepEqual(started, ["material s1", "material s2", "material s3", "material s4"]);
		await free();
	});
});

test("a queued guess the learner asks for starts at once; one found unneeded never starts", async () => {
	await inSession("lane-b", "x", async () => {
		const started: string[] = [];
		const free = await fill(started);
		const a = fakeCall("material s1", true, started);
		const b = fakeCall("material s2", true, started);
		const c = fakeCall("material s3", true, started);
		await tick();
		promote("lane-b", (p) => p === "material s3");
		await tick();
		assert.deepEqual(started, ["material s1", "material s3"]);
		discard("lane-b", (p) => p === "material s2");
		await assert.rejects(b.run, /discarded/);
		a.done();
		c.done();
		await Promise.all([a.run, c.run]);
		assert.deepEqual(started, ["material s1", "material s3"]);
		await free();
	});
});
