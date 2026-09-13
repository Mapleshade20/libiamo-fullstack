import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { url: new URL("https://libiamo.test/") } }));

import Navbar from "$lib/components/Navbar.svelte";

describe("app navbar", () => {
	it("links back to the public homepage without moving Quest Hall from root", () => {
		const { body } = render(Navbar, {
			props: {
				mode: "app",
				user: { name: "Alice", email: "alice@example.com", role: "learner", activeLanguage: "en" },
			},
		});

		expect(body).toMatch(/<a href="\/"[^>]*>Quests\s/);
		expect(body).toMatch(/<a href="\/welcome"[^>]*>About\s/);
	});
});
