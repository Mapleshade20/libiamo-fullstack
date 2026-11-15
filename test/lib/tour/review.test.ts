import { expect, it } from "vitest";
import { freshReview, rateTourReview, tourOutcomes } from "#lib/components/tour/review.ts";
import { tourScenario, tourScenarios } from "#lib/components/tour/scenarios.ts";

it("uses the demo's fixed Good/Good progression without any learner or scheduler state", () => {
	const first = rateTourReview(freshReview(), "good");
	expect(first.done).toBe(false);
	expect(tourOutcomes(first).good).toMatchObject({ label: "1d", stays: false });
	expect(rateTourReview(first, "good").done).toBe(true);
});

it("always offers a recorded exchange with its complete scene, independent of dates and account history", () => {
	for (const language of ["en", "es", "fr", "ja"]) {
		const first = tourScenarios(language)[0];
		expect(first.id).toBe("ao3-fic");
		expect(first.scene?.people.length).toBeGreaterThan(0);
		expect(first.situation.kind).toBe("ao3");
		expect(tourScenario(first.id, language)).toEqual(first);
	}
});
