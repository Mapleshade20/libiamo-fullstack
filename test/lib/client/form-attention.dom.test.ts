import { afterEach, expect, it, vi } from "vitest";
import { markFieldAttention } from "$lib/client/form-attention";

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

it.each(["feedback-name", "name", "id", "generated"])("links generated errors using %s without changing an existing field identity", (identity) => {
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const form = document.createElement("form");
	const input = document.createElement("input");
	if (identity !== "generated") input.id = "original-id";
	if (identity === "feedback-name" || identity === "name") input.name = "email";
	if (identity === "feedback-name") input.dataset.feedbackName = "contact.email";
	form.append(input);
	document.body.append(form);

	markFieldAttention(input, "Required");
	const error = form.querySelector<HTMLElement>("[data-native-field-error]");
	expect(error).not.toBeNull();
	expect(error?.dataset.fieldError).toBe(input.dataset.feedbackName || input.name || input.id);
	if (identity === "generated") expect(input.id).toMatch(/^field-\d+$/);
	else expect(input.id).toBe("original-id");
	expect(input.getAttribute("aria-describedby")).toBe(error?.id);
	expect(error?.textContent).toBe("Required");
	markFieldAttention(input, "Try again");
	expect(form.querySelectorAll("[data-native-field-error]")).toHaveLength(1);
	expect(error?.textContent).toBe("Try again");
});
