import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearFieldFeedback,
	getFirstErrorField,
	handleInvalidField,
	installFormFeedback,
	markFieldAttention,
	showValidationIssues,
	textValidationMessage,
	validateBeforeSubmit,
} from "$lib/client/form-attention";

// A small DOM boundary double: assert observable focus, animation and event contracts.
class Field extends EventTarget {
	attrs = new Map<string, string>();
	dataset: Record<string, string> = {};
	id = "";
	isConnected = true;
	parentElement: Field | null = null;
	form: Field | null = null;
	children: Field[] = [];
	visible = true;
	validationMessage = "Required";
	textContent = "";
	remove = vi.fn();
	focus = vi.fn();
	cancel = vi.fn();
	animate = vi.fn(() => ({ cancel: this.cancel, finished: new Promise<void>(() => {}) }));
	getAttribute(key: string) {
		return this.attrs.get(key) ?? null;
	}
	setAttribute(key: string, value: string) {
		this.attrs.set(key, value);
	}
	removeAttribute(key: string) {
		this.attrs.delete(key);
	}
	matches(selector: string) {
		return selector === "input, textarea, select, [contenteditable]";
	}
	closest(selector: string) {
		return selector === "form" ? this.form : null;
	}
	querySelectorAll() {
		return this.children;
	}
	querySelector() {
		return this.children[0] ?? null;
	}
	checkVisibility() {
		return this.visible;
	}
	getBoundingClientRect() {
		return { top: 10, height: 40 };
	}
	insertAdjacentElement(_position: string, node: Field) {
		this.parentElement?.children.push(node);
	}
}
const asElement = (field: Field) => field as unknown as HTMLElement;

beforeEach(() => {
	vi.stubGlobal(
		"MutationObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.stubGlobal("HTMLElement", Field);
	vi.stubGlobal("CSS", { escape: (value: string) => value });
	vi.stubGlobal("document", { createElement: () => new Field() });
	vi.stubGlobal("window", {
		matchMedia: () => ({ matches: false }),
		getComputedStyle: () => ({ overflowY: "visible" }),
		scrollY: 0,
		innerHeight: 800,
		scrollTo: vi.fn(),
	});
});
afterEach(() => vi.unstubAllGlobals());

function fixture() {
	const form = new Field();
	const input = new Field();
	input.setAttribute("name", "email");
	input.form = form;
	input.parentElement = form;
	const error = new Field();
	error.dataset.fieldError = "email";
	form.children = [error];
	return { form, input, error };
}

describe("shared validation feedback", () => {
	it("validates custom text before service calls without rejecting valid content", () => {
		expect(textValidationMessage("   ", 5)).not.toBeNull();
		expect(textValidationMessage("abcdef", 5)).not.toBeNull();
		expect(textValidationMessage("abcde", 5)).toBeNull();
	});
	it("orders only actual field errors", () => {
		expect(getFirstErrorField({ email: [], password: ["Required"], name: ["Required"] }, ["email", "name"])).toBe("name");
		expect(getFirstErrorField({ email: [] })).toBeNull();
	});

	it("replays the four-phase shake, cancelling previous animation without a stale timeout", () => {
		const { input } = fixture();
		markFieldAttention(asElement(input));
		markFieldAttention(asElement(input));
		expect(input.cancel).toHaveBeenCalledOnce();
		expect(input.animate).toHaveBeenCalledTimes(2);
		const [frames, options] = (input.animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][])[1];
		expect(options.duration).toBe(280);
		expect(frames.map((frame) => frame.transform)).toEqual([
			"translateX(0)",
			"translateX(6px)",
			"translateX(-6px)",
			"translateX(4px)",
			"translateX(0)",
		]);
	});

	it("editing dismisses only that field and re-arms the identical error on rejection", () => {
		const { input, error } = fixture();
		markFieldAttention(asElement(input));
		clearFieldFeedback(asElement(input));
		expect(input.getAttribute("aria-invalid")).toBe("false");
		expect(error.dataset.dismissed).toBe("true");
		expect(error.getAttribute("aria-hidden")).toBe("true");
		markFieldAttention(asElement(input));
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(error.dataset.dismissed).toBeUndefined();
		expect(error.getAttribute("aria-hidden")).toBeNull();
	});

	it("keeps accessible error state but skips shake for reduced motion", () => {
		vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
		const { input } = fixture();
		markFieldAttention(asElement(input));
		expect(input.animate).not.toHaveBeenCalled();
		expect(input.getAttribute("aria-invalid")).toBe("true");
	});

	it("deduplicates native handlers and focuses only the first visible invalid control", async () => {
		const { input, form } = fixture();
		const next = new Field();
		next.form = form;
		next.parentElement = form;
		const invalid = (target: Field) => {
			const event = new Event("invalid", { cancelable: true });
			Object.defineProperty(event, "target", { value: target });
			return event;
		};
		const first = invalid(input);
		handleInvalidField(first);
		handleInvalidField(first);
		const second = invalid(next);
		handleInvalidField(second);
		expect(first.defaultPrevented).toBe(true);
		expect(input.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
		expect(next.focus).not.toHaveBeenCalled();
		expect(input.animate).toHaveBeenCalledOnce();
		await Promise.resolve();
		next.visible = false;
		const hidden = invalid(next);
		handleInvalidField(hidden);
		expect(hidden.defaultPrevented).toBe(false);
	});

	it("installs and removes capture listeners for the entire document", () => {
		const root = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
		const destroy = installFormFeedback(root as unknown as Document);
		expect(root.addEventListener.mock.calls.map(([event]) => event)).toEqual(["invalid", "input", "change"]);
		destroy();
		expect(root.removeEventListener.mock.calls).toEqual(root.addEventListener.mock.calls);
	});

	it("custom editor validation blocks submission before enhancement, updates and cleans up", () => {
		const { input, form } = fixture();
		const destroyListener = vi.spyOn(form, "removeEventListener");
		const action = validateBeforeSubmit(asElement(input), () => [{ path: [], message: "Missing slots" }]);
		const event = new Event("submit", { cancelable: true });
		form.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(input.getAttribute("aria-invalid")).toBe("true");
		action.update(() => []);
		const valid = new Event("submit", { cancelable: true });
		form.dispatchEvent(valid);
		expect(valid.defaultPrevented).toBe(false);
		action.destroy();
		expect(destroyListener).toHaveBeenCalledWith("submit", expect.any(Function), true);
		expect(showValidationIssues(asElement(input), [])).toBe(false);
	});
});
