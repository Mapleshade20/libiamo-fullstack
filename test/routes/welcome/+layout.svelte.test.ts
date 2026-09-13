import { readFile } from "node:fs/promises";
import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import WelcomeLayout from "$routes/welcome/+layout.svelte";

describe("welcome homepage", () => {
	const displayClock = { now: 1_757_736_000_000, timeZone: "UTC" };

	it("marks the English welcome shell independently of learner language", () => {
		const children = createRawSnippet(() => ({ render: () => "" }));
		const { body } = render(WelcomeLayout, { props: { children, data: { displayClock, learnerDocumentLanguage: "ja" } } });

		expect(body).toContain('class="skip-link" href="#main-content" lang="en"');
		expect(body).toContain('class="landing-shell" lang="en"');
	});

	it("scopes smooth scrolling to the mounted welcome layout", async () => {
		const [shell, responsive] = await Promise.all([
			readFile("src/routes/welcome/styles/shell.css", "utf8"),
			readFile("src/routes/welcome/styles/responsive.css", "utf8"),
		]);

		expect(shell).toContain("html.welcome-scroll-active");
		expect(responsive).toContain("html.welcome-scroll-active");
		expect(`${shell}\n${responsive}`).not.toMatch(/(^|\n)html\s*\{/);
	});

	it("sends signed-in homepage actions to the learner app", () => {
		const children = createRawSnippet(() => ({ render: () => "" }));
		const { body } = render(WelcomeLayout, {
			props: { children, data: { displayClock, learnerDocumentLanguage: "en", viewer: { name: "Alice" } } },
		});

		expect(body).toContain('href="/profile"');
		expect(body).toContain('href="/"');
		expect(body).not.toContain('href="/sign-in"');
		expect(body).not.toContain('href="/sign-up"');
	});
});
