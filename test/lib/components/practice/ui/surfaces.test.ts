import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { persisted, persistedSession, surfaceProps } from "../support/surface.svelte";
import { SURFACES } from "./surfaces";

describe.each(SURFACES)("$name surface on the server", ({ component, openingState, history, visible }) => {
	it("renders the stored conversation into the server HTML", () => {
		const { body } = render(component, { props: surfaceProps({ openingState, session: persistedSession(history(persisted)) }) });

		for (const text of visible) expect(body).toContain(text);
	});

	it("links back to the task under the base path", () => {
		const { body } = render(component, { props: surfaceProps({ openingState }) });

		expect(body).toContain('href="/libiamo/task/5"');
	});
});
