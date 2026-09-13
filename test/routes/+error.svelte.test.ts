import { readFile } from "node:fs/promises";
import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedPage = vi.hoisted(() => ({
	status: 404 as number,
	error: { message: "Not found" },
	data: { viewer: null as { name: string } | null },
}));

vi.mock("$app/state", () => ({ page: mockedPage }));

import ErrorPage from "$routes/+error.svelte";

describe("root error page", () => {
	beforeEach(() => {
		mockedPage.status = 404;
		mockedPage.error = { message: "Not found" };
		mockedPage.data.viewer = null;
	});

	it("gives signed-out 404 visitors a public recovery path", () => {
		const { body, head } = render(ErrorPage);

		expect(head).toContain("404 · Page not found · Libiamo");
		expect(body).toMatch(/<div class="error-shell[^"]*" lang="en">/);
		expect(body).toContain("This page has left the table.");
		expect(body).toContain('href="/welcome">Go to the homepage');
		expect(body).toContain('href="/sign-in">Sign in</a>');
	});

	it("keeps unexpected details private and returns signed-in users to Quest Hall", () => {
		mockedPage.status = 500;
		mockedPage.error = { message: "postgres password secret" };
		mockedPage.data.viewer = { name: "Alice" };

		const { body } = render(ErrorPage);

		expect(body).toContain("Something went wrong on our side.");
		expect(body).toContain('href="/">Return to Quest Hall');
		expect(body).toContain("Try again");
		expect(body).not.toContain("postgres password secret");
	});

	it("ships a styled fallback for errors outside the route boundary", async () => {
		const fallback = await readFile("src/error.html", "utf8");

		expect(fallback).toContain("%sveltekit.status%");
		expect(fallback).toContain("%sveltekit.error.message%");
		expect(fallback).toContain('href="%libiamo.base%/"');
		expect(fallback).toContain('role="alert"');
	});
});
