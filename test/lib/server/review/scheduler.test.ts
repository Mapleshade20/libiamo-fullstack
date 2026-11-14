import assert from "node:assert/strict";
import { test } from "vitest";
import { availableAt, intervalLabel, newCard, preview, queueKind, rate } from "#lib/server/review/scheduler.ts";

const TZ = "Asia/Shanghai";
// 2026-11-14 15:00 in Shanghai.
const now = new Date("2026-11-14T07:00:00Z");

test("a new note is due from the learner's next local day", () => {
	const c = newCard(now, TZ);
	assert.equal(queueKind(c), "new");
	assert.equal(c.dueAt, "2026-11-14T16:00:00.000Z");
});

test("the steps keep a card in the sitting; graduating sends it to the start of a later local day", () => {
	const c = { ...newCard(now, TZ), dueAt: now.toISOString() };
	const p = preview(c, now);
	assert.deepEqual(
		[p.again, p.hard, p.good].map((o) => o.stays),
		[true, true, true],
	);
	assert.equal(p.again.label, "1m");
	assert.equal(p.easy.stays, false);
	const learning = rate(c, "good", now, TZ);
	assert.equal(queueKind(learning), "learning");
	// Learn ahead shows a learning card up to twenty minutes early: the ten-minute step is in the sitting already.
	assert.ok(availableAt(learning) <= now.getTime());
	const later = new Date(now.getTime() + 10 * 60_000);
	const graduated = rate(learning, "good", later, TZ);
	assert.equal(queueKind(graduated), "review");
	// Midnight in Shanghai.
	assert.equal(new Date(graduated.dueAt).getUTCHours(), 16);
	assert.ok(Date.parse(graduated.dueAt) > later.getTime());
});

test("what a rating would do is what it does", () => {
	const c = { ...newCard(now, TZ), dueAt: now.toISOString() };
	const p = preview(c, now);
	const r = rate(c, "hard", now, TZ);
	assert.equal(Date.parse(r.dueAt) - now.getTime(), p.hard.inMs);
});

test("interval labels", () => {
	const at = (ms: number) => intervalLabel(new Date(now.getTime() + ms), now);
	assert.equal(at(10 * 60_000), "10m");
	assert.equal(at(25 * 60_000), "25m");
	assert.equal(at(3 * 864e5), "3d");
	assert.equal(at(90 * 864e5), "3mo");
});
