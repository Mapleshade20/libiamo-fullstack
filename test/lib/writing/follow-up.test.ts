import { expect, it } from "vitest";
import { dueOf, pickFollowUp, WRITE_AGAIN_MS } from "#lib/writing/follow-up.ts";
import type { PieceItem } from "#lib/writing/types.ts";

const now = Date.parse("2026-11-16T12:00:00Z");
const day = 86_400_000;
const piece = (id: string, ago: number, more: Partial<PieceItem> = {}): PieceItem => ({
	id,
	title: id,
	site: "Reddit",
	lang: "en",
	at: now - ago - day,
	open: false,
	finishedAt: now - ago,
	...more,
});

it("asks whether the newest finished piece was posted first", () => {
	const list = [piece("new", day), piece("old", 5 * day)];
	expect(pickFollowUp(dueOf(list, now))).toEqual({ kind: "posted", w: list[0] });
});

it("puts a 'not yet' behind writing again, and asks it again a day on", () => {
	const notYet = piece("later", 2 * day, { posted: "not-yet", askedAt: now - 2 * day });
	const old = piece("old", 4 * day, { posted: "yes" });
	expect(pickFollowUp(dueOf([notYet, old], now))).toEqual({ kind: "again", w: old });
	expect(pickFollowUp(dueOf([notYet], now))).toEqual({ kind: "posted", w: notYet });
	const askedToday = piece("today", 2 * day, { posted: "not-yet", askedAt: now - 3_600_000 });
	expect(pickFollowUp(dueOf([askedToday], now))).toBeUndefined();
});

it("never asks about a scenario's piece being posted, and writes again only three days on", () => {
	const scenario = piece("scene", WRITE_AGAIN_MS - 1, { scenarioId: "s" });
	expect(pickFollowUp(dueOf([scenario], now))).toBeUndefined();
	const due = piece("scene", WRITE_AGAIN_MS, { scenarioId: "s" });
	expect(pickFollowUp(dueOf([due], now))).toEqual({ kind: "again", w: due });
	expect(pickFollowUp(dueOf([{ ...due, again: { at: now } }], now))).toBeUndefined();
});
