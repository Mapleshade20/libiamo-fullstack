import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { SOCIAL_PROVIDERS } from "$lib/auth/social";
import SocialProviderIcon from "$lib/components/auth/SocialProviderIcon.svelte";

/** The Google mark is the only multi-colour one, so its fills identify it. */
const GOOGLE_FILL = "#4285f4";

describe("SocialProviderIcon", () => {
	it("draws the Google mark for Google", () => {
		const { body } = render(SocialProviderIcon, { props: { provider: "google" } });

		expect(body).toContain(GOOGLE_FILL);
	});

	it("draws a monochrome mark for GitHub", () => {
		const { body } = render(SocialProviderIcon, { props: { provider: "github" } });

		expect(body).toContain('fill="currentColor"');
		expect(body).not.toContain(GOOGLE_FILL);
	});

	it("has a branch for every provider the app offers", () => {
		for (const { id } of SOCIAL_PROVIDERS) {
			expect(render(SocialProviderIcon, { props: { provider: id } }).body).toContain("<svg");
		}
	});
});
