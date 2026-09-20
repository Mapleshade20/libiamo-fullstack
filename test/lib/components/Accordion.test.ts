import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import Accordion from "$lib/components/Accordion.svelte";

describe("Accordion", () => {
	it.each([false, true])("renders a linked, synchronously %s disclosure", (open) => {
		const { body } = render(Accordion, {
			props: {
				title: "Tools",
				open,
				children: createRawSnippet(() => ({ render: () => '<a href="/admin/templates">Templates</a>' })),
			},
		});
		const controlledId = body.match(/aria-controls="([^"]+)"/)?.[1];
		expect(controlledId).toBeTruthy();
		expect(body).toContain(`id="${controlledId}"`);
		expect(body).toContain(`aria-expanded="${open}"`);
		expect(body.includes(" inert")).toBe(!open);
		// Content remains mounted for both animation and SSR, not replaced on open.
		expect(body).toContain('href="/admin/templates"');
	});
});
