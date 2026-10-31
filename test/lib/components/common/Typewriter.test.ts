import { render } from "svelte/server";
import { expect, it } from "vitest";
import Typewriter from "$lib/components/common/Typewriter.svelte";

it("reserves accessible full text without flashing it in the animated layer before hydration", () => {
	const { body } = render(Typewriter, { props: { text: "A thoughtful conversation awaits." } });
	expect(body).toMatch(/<span class="sr-only[^"]*">A thoughtful conversation awaits\.<\/span>/);
	expect(body).not.toContain("aria-label=");
	const typed = body.slice(body.indexOf('<span class="typed'));
	expect(typed).not.toContain("A thoughtful conversation awaits.");
	expect(body).toContain("A thoughtful conversation awaits.</span>");
});
