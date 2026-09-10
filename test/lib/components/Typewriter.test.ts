import { render } from "svelte/server";
import { expect, it } from "vitest";
import Typewriter from "$lib/components/Typewriter.svelte";

it("reserves accessible full text without flashing it in the animated layer before hydration", () => {
	const { body } = render(Typewriter, { props: { text: "A thoughtful conversation awaits." } });
	expect(body).toContain('aria-label="A thoughtful conversation awaits."');
	const typed = body.slice(body.indexOf('<span class="typed'));
	expect(typed).not.toContain("A thoughtful conversation awaits.");
	expect(body).toContain("A thoughtful conversation awaits.</span>");
});
