import { render } from "svelte/server";
import { expect, it } from "vitest";
import ActionNotification from "$lib/components/ActionNotification.svelte";

it("renders server-provided action results without waiting for an effect", () => {
	const { body } = render(ActionNotification, { props: { notification: { variant: "error", message: "Please correct the submitted field." } } });
	expect(body).toContain("Please correct the submitted field.");
	expect(body).toContain('role="alertdialog"');
	expect(render(ActionNotification).body).not.toContain('role="alertdialog"');
});
