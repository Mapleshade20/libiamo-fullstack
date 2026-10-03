import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";

describe("SegmentedControl", () => {
	it("renders sub-navigation links and marks the current one", () => {
		const { body } = render(SegmentedControl, {
			props: {
				label: "Review pages",
				value: "manage",
				items: [
					{ value: "study", label: "Study", href: "/review" },
					{ value: "manage", label: "Manage", href: "/review/manage" },
				],
			},
		});

		expect(body).toMatch(/<nav[^>]*aria-label="Review pages"/);
		expect(body).toMatch(/<a href="\/review\/manage"[^>]*aria-current="page"/);
		expect(body).not.toMatch(/<a href="\/review"[^>]*aria-current/);
	});

	it("submits a named choice as native radios and keeps an unnamed one out of the form", () => {
		const items = [
			{ value: "1", label: "Good" },
			{ value: "-1", label: "Bad" },
		];
		const named = render(SegmentedControl, { props: { label: "Vote", name: "vote", value: "-1", items } }).body;
		expect(named).toMatch(/role="radiogroup"/);
		expect(named).toMatch(/<input type="radio"[^>]*name="vote"[^>]*value="-1"[^>]*checked/);
		expect(named).not.toMatch(/<input type="radio"[^>]*form=/);

		const unnamed = render(SegmentedControl, { props: { label: "Vote", value: "1", items } }).body;
		expect(unnamed).toMatch(/<input type="radio"[^>]*form="[^"]+-none"/);
	});
});
