import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import LoadingReveal from "$lib/components/LoadingReveal.svelte";

describe("LoadingReveal", () => {
	const placeholder = createRawSnippet(() => ({ render: () => "<span>Loading placeholder</span>" }));
	const children = createRawSnippet(() => ({ render: () => "<p>Resolved content</p>" }));
	it("renders the loading layer without exposing placeholder text to assistive technology", () => {
		const { body } = render(LoadingReveal, { props: { loading: true, placeholder, children } });
		expect(body).toContain('aria-busy="true"');
		expect(body).toContain('aria-hidden="true"');
		expect(body).toContain("Loading placeholder");
		expect(body).not.toContain("Resolved content");
	});
	it("renders resolved content directly on the server without a forced loading delay", () => {
		const { body } = render(LoadingReveal, { props: { loading: false, placeholder, children } });
		expect(body).toContain('aria-busy="false"');
		expect(body).toContain("Resolved content");
		expect(body).not.toContain("Loading placeholder");
	});
});
