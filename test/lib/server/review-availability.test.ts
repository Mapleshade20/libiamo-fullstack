import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/db", () => ({ db: {} }));

import { State } from "ts-fsrs";
import { ANKI_LEARN_AHEAD_MINUTES, createNewCard, isReviewCardAvailable, serializeCard } from "$lib/server/review";
import { availabilityBounds, storedCardAvailable } from "$lib/server/streak";

/**
 * The streak's queue gate re-implements `isReviewCardAvailable` so it can run as one account-wide
 * existence query. This pins the two together over well-formed cards; it exercises the TypeScript
 * transcription of that query, which is the closest a test without a database can get.
 */
describe("the streak's review-queue gate", () => {
	const now = new Date("2026-09-18T12:00:00.000Z");
	const bounds = availabilityBounds(now);
	const offsets = [-86_400_000, -1, 0, 60_000, ANKI_LEARN_AHEAD_MINUTES * 60_000, ANKI_LEARN_AHEAD_MINUTES * 60_000 + 1, 86_400_000];
	const states = [State.New, State.Learning, State.Review, State.Relearning];

	it("agrees with the study queue on every well-formed card", () => {
		for (const state of states) {
			for (const offset of offsets) {
				const card = createNewCard();
				card.state = state;
				card.due = new Date(now.getTime() + offset);
				const stored = serializeCard(card);
				expect({ state, offset, available: storedCardAvailable(stored, bounds) }).toEqual({
					state,
					offset,
					available: isReviewCardAvailable(stored, now),
				});
			}
		}
	});

	it("diverges on a malformed card in the safe direction", () => {
		// `deserializeCard` falls back to "now" for an unreadable due date and so calls the card
		// available; the string comparison treats it as not available. A corrupt row can therefore
		// leave the queue looking empty, which is far better than aborting a quest completion.
		const malformed = { due: null, state: State.Review };
		vi.useFakeTimers();
		vi.setSystemTime(now);
		try {
			expect(isReviewCardAvailable(malformed, now)).toBe(true);
			expect(storedCardAvailable(malformed, bounds)).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
});
